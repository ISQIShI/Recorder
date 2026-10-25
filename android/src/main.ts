import { mountClient } from '@recorder/client';
import '@recorder/client/theme.css';
// Native connection/credential plugins will replace this explicit unavailable provider.
const ctx = await mountClient(document.querySelector('#app')!, 'Android / Capacitor', {
  status: async () => { throw new Error('Android backend connection not configured'); },
});
if (import.meta.hot) import.meta.hot.dispose(() => { void ctx.fiber.dispose(); });
