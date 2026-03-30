/**
 * Plugin contract — the interface every Feature must implement.
 *
 * The microkernel (App) calls `init(context)` on each registered plugin,
 * passing in shared services. Plugins MUST NOT import each other.
 */

import type { EventBus } from './events/EventBus';

/** Services provided by the kernel to every plugin. */
export interface IPluginContext {
  readonly events: EventBus;
}

/** A self-contained feature module. */
export interface IPlugin {
  /** Human-readable name for logging. */
  readonly name: string;
  /** Called once during bootstrap. May be async for I/O-heavy setup. */
  init(context: IPluginContext): void | Promise<void>;
}
