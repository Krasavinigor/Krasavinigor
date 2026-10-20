import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const START = '<!-- OSS-PRS:START -->';
const END = '<!-- OSS-PRS:END -->';
const USER = 'Krasavinigor';
const LIMIT = 5;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${name}`);
  return value;
}

export function escapeMarkdown(value) {
  return requireString(value, 'PR title')
    .replace(/\s+/g, ' ')
    .replace(/[\\`*_{}\[\]()#+.!|<>~]/g, '\\$&');
}

function repoName(repositoryUrl) {
  const url = new URL(requireString(repositoryUrl, 'repository_url'));
  if (url.origin !== 'https://api.github.com') throw new Error('Unexpected repository URL');
  const match = /^\/repos\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (!match) throw new Error('Invalid repository URL');
  return `${match[1]}/${match[2]}`;
}

function replaceBlock(readme, block) {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start < 0 || end < 0 || end < start ||
      readme.indexOf(START, start + START.length) !== -1 ||
      readme.indexOf(END, end + END.length) !== -1) {
    throw new Error('README must contain exactly one ordered marker pair');
  }
  return readme.slice(0, start + START.length) + '\n' + block + '\n' + readme.slice(end);
}

export function renderBlock(prs) {
  if (!Array.isArray(prs) || prs.length === 0) throw new Error('No verified external merged PRs; preserving previous block');
  const lines = ['#### Selected external merged pull requests', ''];
  for (const pr of prs) {
    const repository = requireString(pr.repository, 'repository');
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid repository name');
    if (!Number.isSafeInteger(pr.number) || pr.number < 1) throw new Error('Invalid PR number');
    lines.push(`- [${escapeMarkdown(pr.title)}](https://github.com/${repository}/pull/${pr.number}) · ${repository}`);
  }
  return lines.join('\n');
}

export async function collectPrs(requestJson, username = USER) {
  const query = encodeURIComponent(`author:${username} is:pr is:merged`);
  const items = [];
  let total = null;
  for (let page = 1; ; page++) {
    const result = await requestJson(`https://api.github.com/search/issues?q=${query}&sort=updated&order=desc&per_page=100&page=${page}`);
    if (!object(result) || typeof result.incomplete_results !== 'boolean' ||
        !Number.isSafeInteger(result.total_count) || !Array.isArray(result.items)) {
      throw new Error('Invalid GitHub Search response');
    }
    if (result.incomplete_results) throw new Error('GitHub Search results are incomplete');
    if (result.total_count > 1000) throw new Error('GitHub Search exceeds its 1,000-result limit');
    if (total !== null && total !== result.total_count) throw new Error('GitHub Search changed during pagination');
    total = result.total_count;
    if (result.items.length > 100 || (items.length < total && result.items.length === 0)) {
      throw new Error('Invalid GitHub Search page');
    }
    items.push(...result.items);
    if (items.length >= total) break;
    if (page >= 10) throw new Error('GitHub Search pagination limit reached');
  }

  const selected = [];
  const seen = new Set();
  for (const item of items) {
    if (!object(item) || !object(item.pull_request) || !Number.isSafeInteger(item.number)) {
      throw new Error('Invalid GitHub Search item');
    }
    const repository = repoName(item.repository_url);
    const [owner] = repository.split('/');
    if (owner.toLowerCase() === username.toLowerCase() || repository.toLowerCase() === 'akvelon/beam') continue;
    const key = `${repository.toLowerCase()}#${item.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pr = await requestJson(`https://api.github.com/repos/${repository}/pulls/${item.number}`);
    if (!object(pr) || !object(pr.base) || !object(pr.base.repo) ||
        pr.base.repo.full_name !== repository || pr.number !== item.number ||
        typeof pr.title !== 'string' || !('merged_at' in pr)) {
      throw new Error('Invalid GitHub Pull Request response');
    }
    if (pr.merged_at === null) continue;
    if (Number.isNaN(Date.parse(pr.merged_at))) throw new Error('Invalid merged_at');
    selected.push({ repository, number: pr.number, title: pr.title });
    if (selected.length === LIMIT) break;
  }
  if (!selected.length) throw new Error('No verified external merged PRs; preserving previous block');
  return selected;
}

export async function updateReadme(path, requestJson) {
  const readme = await readFile(path, 'utf8');
  const prs = await collectPrs(requestJson);
  const updated = replaceBlock(readme, renderBlock(prs));
  if (updated !== readme) await writeFile(path, updated, 'utf8');
  return updated !== readme;
}

export async function githubJson(url) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Krasavinigor-profile-updater',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status} for ${new URL(url).pathname}`);
  return response.json();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = fileURLToPath(new URL('../README.md', import.meta.url));
  updateReadme(path, githubJson)
    .then(changed => console.log(changed ? 'README OSS block updated' : 'README OSS block unchanged'))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
