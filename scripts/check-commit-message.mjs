import { readFileSync } from 'node:fs';

export const subjectGuidance = 'Use Conventional Commits: type(scope): description (e.g. feat(auth): add revocable sessions)';

export function isConventionalSubject(subject) {
  if (typeof subject !== 'string' || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(subject)) return false;
  const match = /^[a-z]+(?:\(([^()]+)\))?!?: \S.*$/u.exec(subject);
  return match !== null && (match[1] === undefined || match[1].trim().length > 0);
}

if (import.meta.main) {
  try {
    const subject = readFileSync(process.argv[2], 'utf8').split(/\r?\n/, 1)[0];
    if (!isConventionalSubject(subject)) throw new Error(subjectGuidance);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
