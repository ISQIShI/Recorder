import { readFileSync } from 'node:fs';
const subject = readFileSync(process.argv[2], 'utf8').split(/\r?\n/, 1)[0];
if (!/^[a-z]+(?:\([^\r\n()]+\))?!?: \S.*$/.test(subject)) {
  console.error('Use Conventional Commits: type(scope): description (e.g. feat(auth): add revocable sessions)');
  process.exitCode = 1;
}
