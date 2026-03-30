/**
 * Strongly-typed, synchronous Event Bus with replay support.
 *
 * The bus is the central nervous system of the microkernel: the Sniffer
 * emits events, and Feature Plugins subscribe to them. No feature ever
 * references another feature — they only share this bus.
 *
 * Generic constraints ensure that `emit('network:lessonDataLoaded', …)`
 * only accepts a `LessonData` payload, catching mismatches at compile time.
 *
 * **Replay buffer:** The Sniffer is attached at `document-start` but plugins
 * only subscribe after DOMContentLoaded. Any events emitted in between are
 * stored, and late subscribers automatically receive the most recent payload
 * for each event type they subscribe to. This closes the startup race window.
 */

import { Logger } from '@shared/utils/logger';
import type { EventMap } from './types';

type Listener<T> = (data: T) => void;

export class EventBus {
  private listeners = new Map<keyof EventMap, Listener<never>[]>();

  /** Stores the most recent payload for each event type (replay buffer). */
  private lastEvent = new Map<keyof EventMap, unknown>();

  /** Subscribe to a typed event. If the event was already emitted, replay the last payload immediately. */
  on<K extends keyof EventMap>(event: K, callback: Listener<EventMap[K]>): void {
    const list = this.listeners.get(event) ?? [];
    list.push(callback as Listener<never>);
    this.listeners.set(event, list);

    // Replay: deliver the most recent event to late subscribers
    if (this.lastEvent.has(event)) {
      try {
        callback(this.lastEvent.get(event) as EventMap[K]);
      } catch (e) {
        Logger.error(`EventBus replay error (${String(event)}):`, e);
      }
    }
  }

  /** Emit a typed event to all registered listeners (error-isolated). */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.lastEvent.set(event, data);

    const list = this.listeners.get(event);
    if (!list) return;

    for (const cb of list) {
      try {
        (cb as Listener<EventMap[K]>)(data);
      } catch (e) {
        Logger.error(`EventBus error (${String(event)}):`, e);
      }
    }
  }
}
