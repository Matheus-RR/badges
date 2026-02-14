/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Mocks (must be before imports) ─────────────────────────────────────────

const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

const mockGetInput = jest.fn();
const mockSetFailed = jest.fn();
const mockWarning = jest.fn();
const mockInfo = jest.fn();
const mockDebug = jest.fn();
const mockSetOutput = jest.fn();
const mockSetSecret = jest.fn();

jest.mock('@actions/core', () => ({
  getInput: mockGetInput,
  setFailed: mockSetFailed,
  warning: mockWarning,
  info: mockInfo,
  debug: mockDebug,
  setOutput: mockSetOutput,
  setSecret: mockSetSecret,
}));

const mockGetOctokit = jest.fn();

jest.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'test-owner', repo: 'test-repo' },
    payload: { repository: { default_branch: 'main' } },
  },
  getOctokit: mockGetOctokit,
}));

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { run, isValidBadgeServiceUrl } from '../src/index';

// ─── Helpers ────────────────────────────────────────────────────────────────

const README_WITH_MARKERS = `# Project
<!-- releaserun-badges-start -->
old badges
<!-- releaserun-badges-end -->
Footer`;

const README_NO_MARKERS = '# Project\nNo markers here';

const README_UP_TO_DATE = `# Project
<!-- releaserun-badges-start -->
[![python 3.12 health](https://img.releaserun.com/badge/health/python/3.12.svg)](https://releaserun.com/badges/python/)
<!-- releaserun-badges-end -->`;

function makeOctokit() {
  return {
    rest: {
      repos: {
        get: jest.fn().mockResolvedValue({ data: { default_branch: 'main' } }),
        getContent: jest.fn().mockResolvedValue({
          data: { type: 'file', sha: 'file-sha-123' },
        }),
        createOrUpdateFileContents: jest.fn().mockResolvedValue({}),
      },
      git: {
        getRef: jest.fn().mockResolvedValue({
          data: { object: { sha: 'abc123' } },
        }),
        createRef: jest.fn().mockResolvedValue({}),
        updateRef: jest.fn().mockResolvedValue({}),
        deleteRef: jest.fn().mockResolvedValue({}),
      },
      pulls: {
        list: jest.fn().mockResolvedValue({ data: [] }),
        create: jest.fn().mockResolvedValue({
          data: { number: 42, html_url: 'https://github.com/test/pr/42' },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    },
  };
}

function setupInputs(inputs: Record<string, string>) {
  mockGetInput.mockImplementation((name: string) => inputs[name] || '');
}

function setupFs(content: string) {
  mockReadFileSync.mockReturnValue(content);
  mockWriteFileSync.mockImplementation(() => {});
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GITHUB_WORKSPACE = '/workspace';
  delete process.env.GITHUB_TOKEN;
});

afterEach(() => {
  delete process.env.GITHUB_WORKSPACE;
  delete process.env.GITHUB_TOKEN;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('isValidBadgeServiceUrl', () => {
  test('accepts https://img.releaserun.com', () => {
    expect(isValidBadgeServiceUrl('https://img.releaserun.com')).toBe(true);
  });

  test('accepts https://staging.releaserun.com', () => {
    expect(isValidBadgeServiceUrl('https://staging.releaserun.com')).toBe(true);
  });

  test('accepts https://releaserun.com', () => {
    expect(isValidBadgeServiceUrl('https://releaserun.com')).toBe(true);
  });

  test('rejects http:// URLs', () => {
    expect(isValidBadgeServiceUrl('http://img.releaserun.com')).toBe(false);
  });

  test('rejects non-releaserun domains', () => {
    expect(isValidBadgeServiceUrl('https://evil.com')).toBe(false);
  });

  test('rejects IP addresses', () => {
    expect(isValidBadgeServiceUrl('https://192.168.1.1')).toBe(false);
  });

  test('rejects localhost', () => {
    expect(isValidBadgeServiceUrl('https://localhost')).toBe(false);
  });

  test('rejects invalid URLs', () => {
    expect(isValidBadgeServiceUrl('not-a-url')).toBe(false);
  });

  test('rejects spoofed subdomains like releaserun.com.evil.com', () => {
    expect(isValidBadgeServiceUrl('https://releaserun.com.evil.com')).toBe(false);
  });
});

describe('run() - input validation', () => {
  test('rejects invalid style parameter', async () => {
    setupInputs({
      products: 'python:3.12',
      style: 'invalid-style',
      'github-token': 'fake-token',
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('Invalid style'),
    );
  });

  test('rejects invalid link-to parameter', async () => {
    setupInputs({
      products: 'python:3.12',
      'link-to': 'invalid-link',
      'github-token': 'fake-token',
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('Invalid link-to value'),
    );
  });

  test('rejects invalid badge-service-url', async () => {
    setupInputs({
      products: 'python:3.12',
      'badge-service-url': 'http://evil.com/phishing',
      'github-token': 'fake-token',
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('Invalid badge-service-url'),
    );
  });

  test('rejects badge-service-url with IP address', async () => {
    setupInputs({
      products: 'python:3.12',
      'badge-service-url': 'https://192.168.1.100',
      'github-token': 'fake-token',
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('Invalid badge-service-url'),
    );
  });

  test('accepts valid badge-service-url', async () => {
    setupInputs({
      products: 'python:3.12',
      'badge-service-url': 'https://img.releaserun.com',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockSetFailed).not.toHaveBeenCalledWith(
      expect.stringContaining('Invalid badge-service-url'),
    );
  });

  test('rejects path traversal in readme-path', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '../../etc/passwd',
      'github-token': 'fake-token',
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('must be within repository workspace'),
    );
  });
});

describe('run() - product parsing and badge generation', () => {
  test('warns and exits when no valid products', async () => {
    setupInputs({
      products: 'INVALID',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });

    await run();

    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining('No valid products found'),
    );
  });

  test('logs warnings for invalid product entries', async () => {
    setupInputs({
      products: 'python:3.12\nINVALID:1.0',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining('Skipping invalid product name'),
    );
  });

  test('sets badge outputs (badges-markdown, badges-count, pr-branch)', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('badges-markdown', expect.any(String));
    expect(mockSetOutput).toHaveBeenCalledWith('badges-count', '1');
    expect(mockSetOutput).toHaveBeenCalledWith('pr-branch', 'releaserun/badges-update');
  });
});

describe('run() - file I/O', () => {
  test('handles README read failure', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read README'),
    );
  });

  test('handles README read failure with non-Error throw', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    mockReadFileSync.mockImplementation(() => {
      throw 'string error';
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read README'),
    );
  });

  test('warns when no badge markers found', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_NO_MARKERS);

    await run();

    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining('No badge markers found'),
    );
  });

  test('exits gracefully when badges are up to date', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_UP_TO_DATE);

    await run();

    expect(mockInfo).toHaveBeenCalledWith('No changes detected. Badges are up to date.');
  });

  test('handles README write failure', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    mockReadFileSync.mockReturnValue(README_WITH_MARKERS);
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('Failed to write README'),
    );
  });

  test('handles README write failure with non-Error throw', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    mockReadFileSync.mockReturnValue(README_WITH_MARKERS);
    mockWriteFileSync.mockImplementation(() => {
      throw 42;
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('Failed to write README'),
    );
  });

  test('writes updated README content', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('README.md'),
      expect.stringContaining('releaserun-badges-start'),
      'utf-8',
    );
  });
});

describe('run() - GitHub token handling', () => {
  test('fails when no token provided', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
    });
    setupFs(README_WITH_MARKERS);

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('No GitHub token provided'),
    );
  });

  test('uses GITHUB_TOKEN env var when input not set', async () => {
    process.env.GITHUB_TOKEN = 'env-token';
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockGetOctokit).toHaveBeenCalledWith('env-token');
    expect(mockSetSecret).toHaveBeenCalledWith('env-token');
  });

  test('masks token with setSecret', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'my-secret-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockSetSecret).toHaveBeenCalledWith('my-secret-token');
  });
});

describe('run() - default branch resolution', () => {
  test('queries repository for default branch', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockOctokit.rest.repos.get.mockResolvedValue({
      data: { default_branch: 'develop' },
    });
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockOctokit.rest.git.getRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'heads/develop' }),
    );
  });

  test('falls back to context default branch when API fails', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockOctokit.rest.repos.get.mockRejectedValue(new Error('API error'));
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to query repository default branch'),
    );
    expect(mockOctokit.rest.git.getRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'heads/main' }),
    );
  });
});

describe('run() - branch management', () => {
  test('creates new branch when it does not exist', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockOctokit.rest.git.createRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: 'refs/heads/releaserun/badges-update',
        sha: 'abc123',
      }),
    );
  });

  test('updates existing branch with non-force update', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockOctokit.rest.git.createRef.mockRejectedValue(new Error('Reference already exists'));
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockOctokit.rest.git.updateRef).toHaveBeenCalledWith(
      expect.objectContaining({ force: false }),
    );
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('Updated branch'),
    );
  });

  test('deletes and recreates branch when diverged (no force push)', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockOctokit.rest.git.createRef
      .mockRejectedValueOnce(new Error('Reference already exists'))
      .mockResolvedValueOnce({});
    mockOctokit.rest.git.updateRef.mockRejectedValue(new Error('Update is not a fast forward'));
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockOctokit.rest.git.deleteRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'heads/releaserun/badges-update' }),
    );
    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining('has diverged'),
    );
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('Recreated branch'),
    );
  });

  test('fails gracefully when branch recreation fails', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockOctokit.rest.git.createRef.mockRejectedValue(new Error('Reference already exists'));
    mockOctokit.rest.git.updateRef.mockRejectedValue(new Error('Not fast forward'));
    mockOctokit.rest.git.deleteRef.mockRejectedValue(new Error('Protected branch'));
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('could not be recreated'),
    );
  });
});

describe('run() - file content commit', () => {
  test('gets file SHA before commit', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/workspace/README.md',
        ref: 'releaserun/badges-update',
      }),
    );
    expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ sha: 'file-sha-123' }),
    );
  });

  test('handles file not found on branch (no SHA)', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockOctokit.rest.repos.getContent.mockRejectedValue(new Error('Not Found'));
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ sha: undefined }),
    );
  });

  test('handles getContent returning array (directory listing)', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockOctokit.rest.repos.getContent.mockResolvedValue({ data: [] });
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ sha: undefined }),
    );
  });

  test('retries once on commit failure', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockOctokit.rest.repos.createOrUpdateFileContents
      .mockRejectedValueOnce(new Error('Server Error'))
      .mockResolvedValueOnce({});
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining('File content update failed, retrying once'),
    );
    expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(2);
  });

  test('commits file with base64 content', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    const call = mockOctokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0];
    expect(call.content).toBeTruthy();
    const decoded = Buffer.from(call.content, 'base64').toString('utf-8');
    expect(decoded).toContain('releaserun-badges-start');
  });
});

describe('run() - PR creation', () => {
  test('creates a new PR when none exists', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'chore: update version health badges',
        head: 'releaserun/badges-update',
        base: 'main',
      }),
    );
    expect(mockSetOutput).toHaveBeenCalledWith('pr-number', 42);
    expect(mockSetOutput).toHaveBeenCalledWith('pr-url', 'https://github.com/test/pr/42');
  });

  test('updates existing PR when one is open', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockOctokit.rest.pulls.list.mockResolvedValue({
      data: [{ number: 99, html_url: 'https://github.com/test/pr/99' }],
    });
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith(
      expect.objectContaining({ pull_number: 99 }),
    );
    expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    expect(mockSetOutput).toHaveBeenCalledWith('pr-number', 99);
    expect(mockSetOutput).toHaveBeenCalledWith('pr-url', 'https://github.com/test/pr/99');
  });

  test('generates correct PR body with product list', async () => {
    setupInputs({
      products: 'python:3.12\nnode:20',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    const call = mockOctokit.rest.pulls.create.mock.calls[0][0];
    expect(call.body).toContain('- python:3.12');
    expect(call.body).toContain('- node:20');
    expect(call.body).toContain('ReleaseRun');
  });

  test('fails with setFailed when PR creation throws', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockOctokit.rest.pulls.list.mockRejectedValue(new Error('API rate limit'));
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create/update PR'),
    );
  });

  test('uses custom pr-title and pr-branch', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
      'pr-title': 'Custom PR title',
      'pr-branch': 'custom/branch',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Custom PR title',
        head: 'custom/branch',
      }),
    );
  });
});

describe('run() - error handling', () => {
  test('catches unexpected Error and calls setFailed', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockOctokit.rest.git.getRef.mockRejectedValue(new Error('Network error'));
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith('Network error');
  });

  test('handles non-Error thrown objects', async () => {
    setupInputs({
      products: 'python:3.12',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockOctokit.rest.git.getRef.mockRejectedValue('string throw');
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith('An unexpected error occurred');
  });
});

describe('run() - full happy path', () => {
  test('complete flow: read README, update badges, create branch, commit, create PR', async () => {
    setupInputs({
      products: 'python:3.12\nnode:20',
      'badge-types': 'health,eol',
      'readme-path': '/workspace/README.md',
      'github-token': 'fake-token',
      style: 'for-the-badge',
      'link-to': 'releaserun',
    });
    setupFs(README_WITH_MARKERS);

    const mockOctokit = makeOctokit();
    mockGetOctokit.mockReturnValue(mockOctokit);

    await run();

    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Parsed 2 product(s)'));
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Badge types: health, eol'));
    expect(mockInfo).toHaveBeenCalledWith('README updated with new badges.');
    expect(mockInfo).toHaveBeenCalledWith('Committed badge updates.');
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Created PR #42'));
    expect(mockSetFailed).not.toHaveBeenCalled();
  });
});
