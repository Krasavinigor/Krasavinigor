import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collectPrs, renderBlock, updateReadme } from '../scripts/update-oss-prs.mjs';

const original = '# About\n\nManual intro.\n\n<!-- OSS-PRS:START -->\nOld content.\n<!-- OSS-PRS:END -->\n\nManual outro.\n';
const search = {
  incomplete_results: false,
  total_count: 2,
  items: [
    { number: 7, repository_url: 'https://api.github.com/repos/Krasavinigor/own', pull_request: {} },
    { number: 42, repository_url: 'https://api.github.com/repos/example/tool', pull_request: {} },
  ],
};
const pr = { number: 42, title: 'Fix [input] <script> & state', merged_at: '2026-01-01T12:00:00Z', base: { repo: { full_name: 'example/tool' } } };
const api = async url => url.includes('/search/issues') ? search : pr;

async function withTempFile(callback) {
  const dir = await mkdtemp(join(tmpdir(), 'profile-test-'));
  const path = join(dir, 'README.md');
  try {
    await writeFile(path, original);
    await callback(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('updates only the marked block, escapes titles, and is idempotent', async () => {
  await withTempFile(async path => {
    assert.equal(await updateReadme(path, api), true);
    const once = await readFile(path, 'utf8');
    assert.ok(once.startsWith('# About\n\nManual intro.\n\n'));
    assert.ok(once.endsWith('\n\nManual outro.\n'));
    assert.match(once, /Fix \\\[input\\\] \\<script\\>/);
    assert.match(once, /https:\/\/github.com\/example\/tool\/pull\/42/);
    assert.equal(await updateReadme(path, api), false);
    assert.equal(await readFile(path, 'utf8'), once);
  });
});

test('API error preserves the previous README', async () => {
  await withTempFile(async path => {
    await assert.rejects(updateReadme(path, async () => { throw new Error('HTTP 403'); }), /HTTP 403/);
    assert.equal(await readFile(path, 'utf8'), original);
  });
});

test('incomplete search and zero eligible PRs preserve the previous README', async () => {
  await withTempFile(async path => {
    await assert.rejects(updateReadme(path, async () => ({ ...search, incomplete_results: true })), /incomplete/);
    assert.equal(await readFile(path, 'utf8'), original);
    const ownOnly = { ...search, total_count: 1, items: [search.items[0]] };
    await assert.rejects(updateReadme(path, async () => ownOnly), /No verified/);
    assert.equal(await readFile(path, 'utf8'), original);
  });
});

test('paginates search and verifies actual merged_at from the PR endpoint', async () => {
  const calls = [];
  const first = { ...search, total_count: 101, items: Array.from({ length: 100 }, (_, i) => ({
    number: i + 1, repository_url: 'https://api.github.com/repos/Krasavinigor/own', pull_request: {},
  })) };
  const second = { ...search, total_count: 101, items: [search.items[1]] };
  const result = await collectPrs(async url => {
    calls.push(url);
    return /[?&]page=1(?:&|$)/.test(url) ? first : /[?&]page=2(?:&|$)/.test(url) ? second : pr;
  });
  assert.equal(calls.filter(url => url.includes('/search/issues')).length, 2);
  assert.deepEqual(result, [{ repository: 'example/tool', number: 42, title: pr.title }]);
});

test('rejects invalid PR details and Markdown-breaking repository names', async () => {
  await assert.rejects(collectPrs(async url => url.includes('/search/issues') ? search : { ...pr, merged_at: undefined }), /Invalid merged_at/);
  assert.throws(() => renderBlock([{ repository: 'bad/repo)url', number: 1, title: 'x' }]), /Invalid repository/);
});
