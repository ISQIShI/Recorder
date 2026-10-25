import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const prScript = fileURLToPath(new URL('./check-pr-title.mjs', import.meta.url));
const commitScript = fileURLToPath(new URL('./check-commit-message.mjs', import.meta.url));

function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'recorder-title-'));
  try { run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

function checkEvent(directory, eventName, event) {
  const path = join(directory, 'event with spaces.json');
  writeFileSync(path, typeof event === 'string' ? event : JSON.stringify(event));
  return spawnSync(process.execPath, [prScript], {
    cwd: directory,
    env: { ...process.env, GITHUB_EVENT_NAME: eventName, GITHUB_EVENT_PATH: path },
    encoding: 'utf8',
    shell: false,
  });
}

test('accepts conventional titles, optional scopes, breaking markers, and Unicode descriptions', () => fixture(directory => {
  for (const title of ['ci: add checks', 'feat(records): 编辑记录', 'fix!: change API', 'feat(api)!: change contract', 'custom: a local type']) {
    const result = checkEvent(directory, 'pull_request', { pull_request: { title } });
    assert.equal(result.status, 0, title + ': ' + result.stderr);
  }
}));

test('rejects missing syntax, empty scopes/descriptions, control characters, and multiple lines', () => fixture(directory => {
  for (const title of ['', 'Add CI', 'Feat: add CI', 'feat:add CI', 'feat: ', 'feat:  add CI', 'feat(): add CI', 'feat( ): add CI', 'feat(a(b)): add CI', 'feat: first\nsecond', 'feat: first\n', 'feat: first\r', 'feat: tab\there', 'feat: null\0here', 'feat: line\u2028break', 'feat: paragraph\u2029break']) {
    const result = checkEvent(directory, 'pull_request', { pull_request: { title } });
    assert.equal(result.status, 1, JSON.stringify(title));
    assert.match(result.stderr, /Use Conventional Commits/);
  }
}));

test('treats shell metacharacters and Actions expressions as literal event data', () => fixture(directory => {
  const title = 'ci: "quoted"; $(touch injected) `touch injected` & echo bad > injected | %PATH% ${{ secrets.TEST }}';
  const result = checkEvent(directory, 'pull_request', { pull_request: { title } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(directory, 'injected')), false);
  assert.equal(result.stdout, 'PR title follows Conventional Commits.\n');
  assert.equal(result.stderr, '');
  const invalid = checkEvent(directory, 'pull_request', { pull_request: { title: '::error::untrusted' } });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stderr.includes('::error::untrusted'), false);
}));

test('fails closed on malformed PR event data', () => fixture(directory => {
  for (const event of ['{invalid', {}, null, { pull_request: {} }, { pull_request: { title: 42 } }]) {
    const result = checkEvent(directory, 'pull_request', event);
    assert.equal(result.status, 1, JSON.stringify(event));
  }
  const missingPath = spawnSync(process.execPath, [prScript], {
    env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: '' }, encoding: 'utf8',
  });
  assert.equal(missingPath.status, 1);
  assert.match(missingPath.stderr, /GITHUB_EVENT_PATH is required/);
}));

test('push and manual events need no PR title or event file; unknown events fail', () => {
  for (const eventName of ['push', 'workflow_dispatch', '']) {
    const result = spawnSync(process.execPath, [prScript], {
      env: { ...process.env, GITHUB_EVENT_NAME: eventName, GITHUB_EVENT_PATH: '' }, encoding: 'utf8',
    });
    assert.equal(result.status, eventName ? 0 : 1, result.stderr);
  }
});

test('commit-msg CLI shares the rule and still checks only the first line', () => fixture(directory => {
  const path = join(directory, 'COMMIT_EDITMSG');
  for (const [message, status] of [['ci: add checks\n\nBody text\n', 0], ['feat(api)!: 改变接口\r\n\r\nBody\r\n', 0], ['invalid\n\nci: valid body', 1]]) {
    writeFileSync(path, message);
    const result = spawnSync(process.execPath, [commitScript, path], { encoding: 'utf8' });
    assert.equal(result.status, status, result.stderr);
  }
}));
