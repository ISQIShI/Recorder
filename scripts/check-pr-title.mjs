import { readFileSync } from 'node:fs';
import { isConventionalSubject, subjectGuidance } from './check-commit-message.mjs';

try {
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (eventName === 'push' || eventName === 'workflow_dispatch') {
    console.log('No PR title to check for this event.');
  } else {
    if (eventName !== 'pull_request') throw new Error('Expected a pull_request, push, or workflow_dispatch event.');
    if (!process.env.GITHUB_EVENT_PATH) throw new Error('GITHUB_EVENT_PATH is required for pull_request.');
    // Read untrusted titles as JSON data. Never evaluate them or interpolate them into shell source.
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    if (!isConventionalSubject(event?.pull_request?.title)) throw new Error(subjectGuidance);
    console.log('PR title follows Conventional Commits.');
  }
} catch (error) {
  // Do not echo untrusted event data into the Actions command/log protocol.
  console.error(error instanceof SyntaxError ? 'Invalid event JSON.' : error.message);
  process.exitCode = 1;
}
