/**
 * Application Kernel — assembles all layers and bootstraps the system.
 *
 * This class is intentionally thin: it wires together the EventBus,
 * Sniffer, and plugins — no business logic lives here.
 */

import { EventBus } from '@core/events/EventBus';
import { Sniffer } from '@core/network/Sniffer';
import type { IPluginContext } from '@core/plugin';
import { injectStyles } from '@shared/ui/styles';
import { Logger } from '@shared/utils/logger';
import { plugins } from './registry';

export class App {
  private readonly events = new EventBus();
  private readonly sniffer = new Sniffer(this.events);
  private readonly context: IPluginContext = { events: this.events };

  async bootstrap(): Promise<void> {
    Logger.log('\uD83D\uDE80 Injecting...');
    injectStyles();
    this.sniffer.attach();

    for (const plugin of plugins) {
      try {
        await plugin.init(this.context);
        Logger.success(`Plugin loaded: ${plugin.name}`);
      } catch (error) {
        Logger.error(`Failed to load plugin ${plugin.name}:`, error);
      }
    }
  }
}
