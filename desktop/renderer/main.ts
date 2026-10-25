import { mountClient } from '@recorder/client';
import type { DesktopBridge } from '@recorder/contracts';
import '@recorder/client/theme.css';
declare global { interface Window { recorder: DesktopBridge } }
const target = document.querySelector('#app')!;
const ctx = await mountClient(target, 'Windows / Electron', window.recorder);
if (import.meta.hot) import.meta.hot.dispose(() => { void ctx.fiber.dispose(); });
