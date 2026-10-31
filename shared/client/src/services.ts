import { Service, type Context } from '@deepseek-ai/cordis';
import { shallowReactive, type Component } from 'vue';
import type { StatusTransport } from '@recorder/contracts';

export interface Panel { id: string; component: Component }
export interface Platform { name: string }
declare module '@deepseek-ai/cordis' {
  interface Context {
    recorderPanels: PanelRegistry;
    recorderTransport: StatusTransport;
    recorderPlatform: Platform;
  }
}
export class PanelRegistry extends Service {
  readonly items = shallowReactive<Panel[]>([]);
  constructor(ctx: Context) { super(ctx, 'recorderPanels'); }
  register(owner: Context, panel: Panel) {
    owner.effect(() => {
      if (this.items.some(item => item.id === panel.id)) throw new Error('Duplicate panel: ' + panel.id);
      this.items.push(panel);
      return () => {
        const index = this.items.indexOf(panel);
        if (index >= 0) this.items.splice(index, 1);
      };
    });
  }
}
declare module '@deepseek-ai/cordis' { interface Events { 'recorder/record-created'(record: import('@recorder/contracts').RecordData): void } }
