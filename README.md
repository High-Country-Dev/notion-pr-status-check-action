# Notion PR Status Check Action

This GitHub Action checks the status of Notion tasks associated with Pull Requests. It's designed to streamline the workflow between GitHub and Notion, ensuring that PR statuses align with their corresponding task statuses in Notion.

**Note: This action is currently in development. Some properties are still hardcoded and need to be made configurable.**

## Features

- Automatically checks Notion task status when a PR is opened, reopened, or updated
- Comments on PRs with the current Notion task status
- Supports multiple PRs in a single deployment (e.g., when merging `dev` into `staging`)

## Setup

1. Create a new repository for this action or clone this one.

2. Ensure you have Node.js installed (version 16 or later recommended).

3. Install dependencies:

   ```
   npm install
   ```

4. Build the action:
   ```
   npm run build
   ```

## Usage

To use this action in your workflow, add the following step to your `.github/workflows/your-workflow.yml` file:

```yaml
- name: Check Notion PR Status
  uses: high-country-dev/notion-pr-status-check-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    notion-token: ${{ secrets.NOTION_API_KEY }}
    notion-database-id: ${{ secrets.NOTION_DATABASE_ID }}
```

## Inputs

- `github-token`: The GitHub token used to create comments on PRs. (Required)
- `notion-token`: Your Notion API key. (Required)
- `notion-database-id`: The ID of your Notion database containing the tasks. (Required)

## Environment Setup

1. In your GitHub repository, go to Settings > Secrets and add the following secrets:

   - `NOTION_API_KEY`: Your Notion API key
   - `NOTION_DATABASE_ID`: Your Notion database ID

2. The `GITHUB_TOKEN` is automatically provided by GitHub Actions.

## Current Limitations and TODO

- The action currently has some hardcoded properties that need to be made configurable:
  - The Notion property name for task IDs (`bOh%7C`)
  - The Notion property ID for QA status (`yNMG`)
  - The format of task IDs in PR titles (`[MD-1234]`)
- Error handling and logging need to be improved for better debugging
- More comprehensive testing is needed

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
