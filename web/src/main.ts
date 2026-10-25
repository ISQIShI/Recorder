import { mountClient } from '@recorder/client';
import '@recorder/client/theme.css';
const ctx = await mountClient(document.querySelector('#app')!, 'Web');
if (import.meta.hot) import.meta.hot.dispose(() => { void ctx.fiber.dispose(); });
