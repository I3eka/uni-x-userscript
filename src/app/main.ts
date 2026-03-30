/**
 * Application Kernel — assembles all layers and bootstraps the system.
 *
 * This class is intentionally thin: it wires together the EventBus,
 * Sniffer, and plugins — no business logic lives here.
 *
 * Bootstrap is split into two phases:
 * 1. `attachSniffer()` — patches XHR/fetch immediately at document-start
 *    so that no API calls are missed.
 * 2. `bootstrap()` — injects styles and initializes plugins once the DOM
 *    is ready.
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

  /** Phase 1 — patch network primitives before the SPA runs. Safe to call before DOM is ready. */
  attachSniffer(): void {
    this.sniffer.attach();
  }

  /** Phase 2 — inject styles and initialize plugins. Requires DOM to be available. */
  async bootstrap(): Promise<void> {
    Logger.log('\uD83D\uDE80 Injecting...');
    injectStyles();

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
