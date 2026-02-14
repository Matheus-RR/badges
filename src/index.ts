import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import { parseProducts, parseBadgeTypes, generateAllBadges } from './badges';
import { updateReadmeContent } from './readme';
import { LinkTo } from './types';

export function isValidBadgeServiceUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // Must be HTTPS
  if (parsed.protocol !== 'https:') {
    return false;
  }

  // Reject IP addresses (IPv4 and IPv6)
  const hostname = parsed.hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[') || hostname === '::1') {
    return false;
  }

  // Reject localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return false;
  }

  // Must match *.releaserun.com or releaserun.com
  if (hostname !== 'releaserun.com' && !hostname.endsWith('.releaserun.com')) {
    return false;
  }

  return true;
}

export async function run(): Promise<void> {
  try {
    // Parse inputs
    const productsInput = core.getInput('products', { required: true });
    const badgeTypesInput = core.getInput('badge-types') || 'health';
    const readmePath = core.getInput('readme-path') || 'README.md';
    const linkTo = (core.getInput('link-to') || 'badge-page') as LinkTo;
    const prTitle = core.getInput('pr-title') || 'chore: update version health badges';
    const prBranch = core.getInput('pr-branch') || 'releaserun/badges-update';

    // Validate pr-branch to prevent ref injection
    if (/\.\./.test(prBranch) || prBranch.startsWith('/') || prBranch.endsWith('/') ||
        prBranch.endsWith('.lock') || /[\x00-\x1f\x7f ~^:?*\[\\]/.test(prBranch)) {
      core.setFailed(`Invalid pr-branch: "${prBranch}". Branch name contains invalid characters.`);
      return;
    }

    // C4: Validate style parameter
    const style = core.getInput('style') || 'flat';
    const validStyles = ['flat', 'flat-square', 'plastic', 'for-the-badge'];
    if (!validStyles.includes(style)) {
      core.setFailed(`Invalid style: "${style}". Must be one of: ${validStyles.join(', ')}`);
      return;
    }

    // Validate link-to
    if (!['badge-page', 'releaserun', 'none'].includes(linkTo)) {
      core.setFailed(`Invalid link-to value: "${linkTo}". Must be badge-page, releaserun, or none.`);
      return;
    }

    // M3: Read optional badge-service-url input with validation
    const badgeServiceBaseUrl = core.getInput('badge-service-url') || undefined;

    if (badgeServiceBaseUrl) {
      if (!isValidBadgeServiceUrl(badgeServiceBaseUrl)) {
        core.setFailed(
          `Invalid badge-service-url: "${badgeServiceBaseUrl}". ` +
          'URL must use HTTPS and match *.releaserun.com (no IP addresses or localhost).',
        );
        return;
      }
    }

    const badgeBaseUrl = badgeServiceBaseUrl ? `${badgeServiceBaseUrl.replace(/\/$/, '')}/badge` : undefined;

    // C5: Validate readme-path is within workspace to prevent path traversal
    const fullPath = path.resolve(readmePath);
    const workspacePath = process.env.GITHUB_WORKSPACE || process.cwd();

    if (!fullPath.startsWith(path.resolve(workspacePath))) {
      core.setFailed('Invalid readme-path: must be within repository workspace');
      return;
    }

    // H4: Parse and validate products, log warnings
    const { products, warnings } = parseProducts(productsInput);
    warnings.forEach(w => core.warning(w));

    if (products.length === 0) {
      core.warning('No valid products found in input. Nothing to do.');
      return;
    }

    core.info(`Parsed ${products.length} product(s)`);

    // Parse badge types
    const badgeTypes = parseBadgeTypes(badgeTypesInput);
    core.info(`Badge types: ${badgeTypes.join(', ')}`);

    // Generate badge markdown
    const badgesMarkdown = generateAllBadges(products, badgeTypes, style, linkTo, badgeBaseUrl);
    core.info(`Generated badges for ${products.length} product(s) x ${badgeTypes.length} type(s)`);

    // M5: Debug output and set outputs for generated badge data
    core.debug(`Generated badge markdown:\n${badgesMarkdown}`);
    core.setOutput('badges-markdown', badgesMarkdown);
    core.setOutput('badges-count', (products.length * badgeTypes.length).toString());
    core.setOutput('pr-branch', prBranch);

    // H3: Read README with proper error context
    let readmeContent: string;
    try {
      readmeContent = fs.readFileSync(fullPath, 'utf-8');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      core.setFailed(`Failed to read README at ${fullPath}: ${errorMessage}`);
      return;
    }

    // Update README content
    const result = updateReadmeContent(readmeContent, badgesMarkdown);

    if (!result.markersFound) {
      core.warning(
        `No badge markers found in ${readmePath}. ` +
        `Add <!-- releaserun-badges-start --> and <!-- releaserun-badges-end --> to your README.`,
      );
      return;
    }

    if (!result.updated) {
      core.info('No changes detected. Badges are up to date.');
      return;
    }

    // H3: Write updated README with proper error context
    try {
      fs.writeFileSync(fullPath, result.content, 'utf-8');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      core.setFailed(`Failed to write README at ${fullPath}: ${errorMessage}`);
      return;
    }

    core.info('README updated with new badges.');

    // C1: Obtain token via core.getInput first, mask it with setSecret
    const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;
    if (!token) {
      core.setFailed('No GitHub token provided. Set github-token input or GITHUB_TOKEN env var.');
      return;
    }
    core.setSecret(token);  // Mask token in logs

    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    // H5: Query the repository to get the actual default branch
    let defaultBranch: string;
    try {
      const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
      defaultBranch = repoData.default_branch;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      core.warning(`Failed to query repository default branch: ${errorMessage}. Falling back to context or 'main'.`);
      defaultBranch = github.context.payload.repository?.default_branch || 'main';
    }

    // Get default branch ref
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`,
    });

    // C3: Create or update branch without force push; handle conflicts gracefully
    try {
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${prBranch}`,
        sha: refData.object.sha,
      });
      core.info(`Created branch ${prBranch}`);
    } catch {
      // Branch exists, try non-force update first
      try {
        await octokit.rest.git.updateRef({
          owner,
          repo,
          ref: `heads/${prBranch}`,
          sha: refData.object.sha,
          force: false,
        });
        core.info(`Updated branch ${prBranch}`);
      } catch (err) {
        // Branch has diverged - do NOT force push as it could destroy manual commits.
        // Instead, delete and recreate the branch to start fresh.
        const errMsg = err instanceof Error ? err.message : String(err);
        core.warning(`Branch ${prBranch} has diverged from ${defaultBranch}: ${errMsg}`);
        core.warning('Deleting and recreating branch to avoid destroying manual commits.');
        try {
          await octokit.rest.git.deleteRef({
            owner,
            repo,
            ref: `heads/${prBranch}`,
          });
          await octokit.rest.git.createRef({
            owner,
            repo,
            ref: `refs/heads/${prBranch}`,
            sha: refData.object.sha,
          });
          core.info(`Recreated branch ${prBranch} from ${defaultBranch}`);
        } catch (recreateErr) {
          const recreateMsg = recreateErr instanceof Error ? recreateErr.message : String(recreateErr);
          core.setFailed(
            `Branch ${prBranch} has diverged and could not be recreated: ${recreateMsg}. ` +
            'Please manually delete the branch and re-run the action.',
          );
          return;
        }
      }
    }

    // Get current file to get its SHA
    let fileSha: string | undefined;
    try {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: readmePath,
        ref: prBranch,
      });
      if (!Array.isArray(fileData) && fileData.type === 'file') {
        fileSha = fileData.sha;
      }
    } catch {
      // File doesn't exist on branch yet
    }

    // H2: Commit the updated file with single retry on failure
    try {
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: readmePath,
        message: prTitle,
        content: Buffer.from(result.content).toString('base64'),
        sha: fileSha,
        branch: prBranch,
      });
    } catch (firstErr) {
      const firstErrMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      core.warning(`File content update failed, retrying once: ${firstErrMsg}`);
      // Re-fetch SHA in case the first attempt partially succeeded
      let retrySha: string | undefined;
      try {
        const { data: retryFileData } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: readmePath,
          ref: prBranch,
        });
        if (!Array.isArray(retryFileData) && retryFileData.type === 'file') {
          retrySha = retryFileData.sha;
        }
      } catch {
        // File doesn't exist on branch yet
      }
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: readmePath,
        message: prTitle,
        content: Buffer.from(result.content).toString('base64'),
        sha: retrySha,
        branch: prBranch,
      });
    }

    core.info('Committed badge updates.');

    // Create or update PR
    const productList = products.map(p => `- ${p.product}${p.version ? `:${p.version}` : ''}`).join('\n');
    const prBody = `## Version Health Badges Update

This PR updates version health badges in \`${readmePath}\`.

### Products tracked
${productList}

### Badge types
${badgeTypes.join(', ')}

---
Powered by [ReleaseRun](https://releaserun.com) | [Badge Documentation](https://releaserun.com/badges/)`;

    // H1: Use setFailed instead of warning for PR creation failures
    // H2: Single retry for PR creation API calls
    try {
      const { data: existingPRs } = await octokit.rest.pulls.list({
        owner,
        repo,
        head: `${owner}:${prBranch}`,
        state: 'open',
      });

      if (existingPRs.length > 0) {
        await octokit.rest.pulls.update({
          owner,
          repo,
          pull_number: existingPRs[0].number,
          title: prTitle,
          body: prBody,
        });
        core.info(`Updated existing PR #${existingPRs[0].number}`);
        core.setOutput('pr-number', existingPRs[0].number);
        core.setOutput('pr-url', existingPRs[0].html_url);
      } else {
        const { data: pr } = await octokit.rest.pulls.create({
          owner,
          repo,
          title: prTitle,
          body: prBody,
          head: prBranch,
          base: defaultBranch,
        });
        core.info(`Created PR #${pr.number}: ${pr.html_url}`);
        core.setOutput('pr-number', pr.number);
        core.setOutput('pr-url', pr.html_url);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      core.setFailed(`Failed to create/update PR: ${errorMessage}. Badge changes were committed to ${prBranch} but PR could not be created.`);
      return;
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unexpected error occurred');
    }
  }
}

run();
