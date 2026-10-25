import { mountApplication } from '@recorder/client';
import '@recorder/client/theme.css';
const ctx = await mountApplication(document.querySelector('#app')!, 'Web');
if (import.meta.hot) import.meta.hot.dispose(() => { void ctx.fiber.dispose(); });
