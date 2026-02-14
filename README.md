# ReleaseRun Badges GitHub Action

Automatically update version health badges in your README via pull request.

## Usage

```yaml
name: Update Badges
on:
  schedule:
    - cron: '0 6 * * 1'  # Weekly on Monday
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  badges:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: releaserun/badges@v1
        with:
          products: |
            python:3.12
            node:20
            postgres:16
          badge-types: health,eol
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `products` | Multiline list of `product:version` pairs | **required** |
| `badge-types` | Comma-separated: `health`, `eol`, `freshness`, `cve`, `cloud` | `health` |
| `readme-path` | Path to README file | `README.md` |
| `style` | Badge style (`flat`, `flat-square`, `plastic`, `for-the-badge`) | `flat` |
| `link-to` | Where badges link: `badge-page`, `releaserun`, `none` | `badge-page` |
| `pr-title` | Title for the created PR | `chore: update version health badges` |
| `pr-branch` | Branch name for the PR | `releaserun/badges-update` |
| `github-token` | GitHub token for creating PRs | `GITHUB_TOKEN` env |
| `badge-service-url` | Base URL for badge service (for testing/custom deployments) | `https://img.releaserun.com` |

## Outputs

| Output | Description |
|--------|-------------|
| `pr-number` | Number of the created/updated PR |
| `pr-url` | URL of the created/updated PR |
| `badges-markdown` | The generated badge markdown |
| `badges-count` | Number of badges generated |
| `pr-branch` | The branch name used for the PR |

## README Markers

Add these markers to your README where you want badges to appear:

```markdown
<!-- releaserun-badges-start -->
<!-- releaserun-badges-end -->
```

The action replaces everything between the markers with generated badges. If markers are not found, the action logs a warning and skips.

## Examples

### Health badges only

```yaml
- uses: releaserun/badges@v1
  with:
    products: |
      python:3.12
      node:20
```

### Multiple badge types with custom style

```yaml
- uses: releaserun/badges@v1
  with:
    products: |
      python:3.12
      node:20
      postgres:16
    badge-types: health,eol,cve
    style: for-the-badge
```

### Product without version (latest)

```yaml
- uses: releaserun/badges@v1
  with:
    products: |
      python
      node
```

## Development

> **Important:** The `dist/` directory must be committed to the repository and kept in sync with the
> source code. After making changes to `src/`, always run `npm run build && npm run package` and
> commit the updated `dist/` directory. GitHub Actions loads the action directly from `dist/index.js`.

## Generated Output

For `python:3.12` with badge types `health,eol`:

```markdown
[![python 3.12 health](https://img.releaserun.com/badge/health/python/3.12.svg)](https://releaserun.com/badges/python/) [![python 3.12 EOL](https://img.releaserun.com/badge/eol/python/3.12.svg)](https://releaserun.com/badges/python/)
```
