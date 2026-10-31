import { Context } from '@deepseek-ai/cordis';
import type { ApiTransport, FileDeviceBridge } from '@recorder/contracts';
import { PanelRegistry } from './services.js';
import { webApi, nativeApi } from './api-transport.js';
import * as shell from './plugins/shell.js';
import * as account from './plugins/account.js';
import * as accountPanel from './plugins/account-panel.js';
import * as recordsPanel from './plugins/records-panel.js';
import * as leaveGuard from './plugins/leave-guard.js';
import * as recordEditor from './plugins/record-editor.js';
import * as recordTags from './plugins/record-tags.js';
import * as tagsPanel from './plugins/tags-panel.js';
import * as recordCategories from './plugins/record-categories.js';
import * as categoriesPanel from './plugins/categories-panel.js';
import * as fileTransfer from './plugins/file-transfer.js';
import * as recordAttachments from './plugins/record-attachments.js';
import * as attachmentsPanel from './plugins/attachments-panel.js';
import * as fileRecords from './plugins/file-records.js';
import * as fileRecordsPanel from './plugins/file-records-panel.js';
export async function mountApplication(target: Element, platform: string, bridge?: ApiTransport, files?: FileDeviceBridge) {
  const ctx = new Context();
  try {
    await ctx.plugin((owner: Context) => { owner.provide('recorderPlatform', { name: platform }); });
    await ctx.plugin(PanelRegistry);
    if (bridge) await ctx.plugin(nativeApi, { bridge }); else await ctx.plugin(webApi);
    await ctx.plugin(leaveGuard);
    await ctx.plugin(account);
    await ctx.plugin(recordEditor);
    await ctx.plugin(shell, { target, application: true });
    await ctx.plugin(accountPanel);
    await ctx.plugin(recordsPanel);
    await ctx.plugin(recordTags);
    await ctx.plugin(tagsPanel);
    await ctx.plugin(recordCategories);
    await ctx.plugin(categoriesPanel);
    await ctx.plugin(fileTransfer, { bridge: files });
    await ctx.plugin(fileRecords);
    await ctx.plugin(fileRecordsPanel);
    await ctx.plugin(recordAttachments);
    await ctx.plugin(attachmentsPanel);
    return ctx;
  } catch (error) { await ctx.fiber.dispose(); throw error; }
}
