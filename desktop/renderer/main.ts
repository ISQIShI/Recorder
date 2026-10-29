import { mountClient, mountApplication } from '@recorder/client';
import { ApiError, parseApiResponse, type DesktopBridge, type ApiTransport } from '@recorder/contracts';
import '@recorder/client/theme.css';
declare global { interface Window { recorder: DesktopBridge } }
const target = document.querySelector('#app')!;
const bridge: ApiTransport = { async request(method, input) {
  const result = await window.recorder.invokeApi(method, input);
  if (!result.ok) throw new ApiError(result.error.code, result.error.message, result.error.status);
  return parseApiResponse(method, result.value);
} };
const ctx = location.search.includes('foundation=1')
  ? await mountClient(target, 'Windows / Electron', window.recorder)
  : await mountApplication(target, 'Windows / Electron', bridge, window.recorder.files);
if (import.meta.hot) import.meta.hot.dispose(() => { void ctx.fiber.dispose(); });
