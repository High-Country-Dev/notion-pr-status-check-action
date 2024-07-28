import * as core from "@actions/core";
import * as github from "@actions/github";
import { Client } from "@notionhq/client";
import type {
  DatabaseObjectResponse,
  PageObjectResponse,
  PartialDatabaseObjectResponse,
  PartialPageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

interface PullRequest {
  number: number;
  title: string;
  base: { ref: string };
  head: { ref: string };
}

interface NotionTaskStatus {
  status: string | null;
  url: string | null;
}

const isPageObjectResponse = (
  val:
    | PageObjectResponse
    | PartialPageObjectResponse
    | DatabaseObjectResponse
    | PartialDatabaseObjectResponse
    | undefined
): val is PageObjectResponse => {
  return val ? "properties" in val : false;
};

const isSelect = (val: unknown): val is { select: { name: string } } => {
  return (
    !!val &&
    typeof val === "object" &&
    "select" in val &&
    !!val.select &&
    typeof val.select === "object" &&
    "name" in val.select &&
    typeof val.select.name === "string"
  );
};

async function getNotionTaskStatus(
  notion: Client,
  notionDatabaseId: string,
  taskId: number
): Promise<NotionTaskStatus | null> {
  try {
    const response = await notion.databases.query({
      database_id: notionDatabaseId,
      filter: {
        property: "bOh%7C", // TASK ID [MD-1234]
        number: { equals: taskId },
      },
    });

    const result = isPageObjectResponse(response?.results[0])
      ? response?.results[0]
      : null;
    if (!result) throw new Error("Notion response is not a page object");
    const qaStatus = Object.values(result.properties).find(
      (prop) => prop.id === "yNMG"
    );
    const qaStatusSelect = isSelect(qaStatus) ? qaStatus.select : null;
    return {
      status: qaStatusSelect?.name?.toLowerCase() ?? null,
      url: result.url,
    };
  } catch (error) {
    core.warning(
      `Error querying Notion: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  return null;
}

async function processPullRequest(
  pr: PullRequest,
  notion: Client,
  notionDatabaseId: string,
  baseBranch: string,
  stagingEnvs: string[],
  mainEnvs: string[]
): Promise<string> {
  console.log(`Processing PR #${pr.number}: ${pr.title}`);
  const match = pr.title.match(/\[MD-(\d+)\]/);
  const taskId = match?.[1] ? parseInt(match[1], 10) : null;
  if (taskId === null) {
    console.log("No task ID found in PR title:", pr.title);
    return `❌ PR #${pr.number} ${pr.title}`;
  }

  const taskResp = await getNotionTaskStatus(notion, notionDatabaseId, taskId);
  const status = taskResp?.status;

  const forThisBaseBranch =
    baseBranch === "staging"
      ? stagingEnvs.some((e) => status?.includes(e))
      : baseBranch === "master" || baseBranch === "main"
      ? mainEnvs.some((e) => status?.includes(e))
      : false;

  const prettyTitle = pr.title.replace(
    /\[MD-\d+\]/,
    taskResp?.url ? `[MD-${taskId}](${taskResp.url})` : `[MD-${taskId}]`
  );

  return `${forThisBaseBranch ? "✅" : "❌"} PR #${pr.number} ${prettyTitle} ${
    status ? `\`(${status})\`` : ""
  }`;
}

async function getRecentMergedPRs(
  octokit: ReturnType<typeof github.getOctokit>,
  repo: { owner: string; repo: string },
  baseBranch: string,
  sourceBranch: string
): Promise<PullRequest[]> {
  console.log(
    `Getting recent merged PRs from ${sourceBranch} to ${baseBranch}`
  );

  const [{ data: recentPRs }, { data: comparison }] = await Promise.all([
    octokit.rest.pulls.list({
      ...repo,
      state: "all",
      sort: "updated",
      direction: "desc",
      per_page: 100,
    }),
    octokit.rest.repos.compareCommits({
      ...repo,
      base: baseBranch,
      head: sourceBranch,
    }),
  ]);

  const commitSHAs = new Set(comparison.commits.map((commit) => commit.sha));

  const associatedPRs = recentPRs.filter((pr) => {
    return pr.merge_commit_sha && commitSHAs.has(pr.merge_commit_sha);
  });

  console.log(`Found ${associatedPRs.length} associated PRs`);

  return associatedPRs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    base: { ref: pr.base.ref },
    head: { ref: pr.head.ref },
  }));
}

async function run(): Promise<void> {
  try {
    const githubToken =
      process.env.GITHUB_TOKEN ?? core.getInput("github-token");
    const notionToken =
      process.env.NOTION_TOKEN ?? core.getInput("notion-token");
    const notionDatabaseId =
      process.env.NOTION_DATABASE_ID ?? core.getInput("notion-database-id");
    const prNumber = process.env.PR_NUMBER ?? core.getInput("pr-number");

    const octokit = github.getOctokit(githubToken);
    const notion = new Client({ auth: notionToken });

    const context = github.context;
    const runId = process.env.GITHUB_RUN_ID ?? context.runId;
    const repo = context.repo;

    let currentPR: PullRequest;
    if (context.payload.pull_request) {
      currentPR = context.payload.pull_request as PullRequest;
    } else {
      const { data: pr } = await octokit.rest.pulls.get({
        ...repo,
        pull_number: parseInt(prNumber, 10),
      });
      currentPR = pr as PullRequest;
    }

    const baseBranch = currentPR.base.ref;
    const sourceBranch = currentPR.head.ref;

    if (baseBranch === "dev") return;

    const stagingEnvs = ["dev", "staging", "master", "main"];
    const mainEnvs = ["staging", "master", "main"];

    console.log(
      `Current PR: ${currentPR.title} (${sourceBranch} -> ${baseBranch})`
    );

    let mergedPRs = await getRecentMergedPRs(
      octokit,
      repo,
      baseBranch,
      sourceBranch
    );

    if (mergedPRs.length === 0) {
      console.log("No merged PRs found. Processing the current PR.");
      mergedPRs = [currentPR];
    }

    const results = await Promise.all(
      mergedPRs.map((pr) =>
        processPullRequest(
          pr,
          notion,
          notionDatabaseId,
          baseBranch,
          stagingEnvs,
          mainEnvs
        )
      )
    );

    const runUrl = `https://github.com/${repo.owner}/${repo.repo}/actions/runs/${runId}`;

    const commentBody = `# Notion Task Status Check

${results.join("\n")}

[View run details or rerun](${runUrl})
`;

    const { data: comments } = await octokit.rest.issues.listComments({
      ...repo,
      issue_number: currentPR.number,
    });

    const existingComment = comments.find((comment) => {
      return comment.body?.startsWith("# Notion Task Status Check");
    });

    if (existingComment) {
      console.log("Updating existing comment");
      await octokit.rest.issues.updateComment({
        ...repo,
        comment_id: existingComment.id,
        body: commentBody,
      });
    } else {
      await octokit.rest.issues.createComment({
        ...repo,
        issue_number: currentPR.number,
        body: commentBody,
      });
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

void run();
