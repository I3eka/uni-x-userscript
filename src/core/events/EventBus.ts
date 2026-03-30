/**
 * Strongly-typed, synchronous Event Bus.
 *
 * The bus is the central nervous system of the microkernel: the Sniffer
 * emits events, and Feature Plugins subscribe to them. No feature ever
 * references another feature — they only share this bus.
 *
 * Generic constraints ensure that `emit('network:lessonDataLoaded', …)`
 * only accepts a `LessonData` payload, catching mismatches at compile time.
 */

import { Logger } from '@shared/utils/logger';
import type { EventMap } from './types';

type Listener<T> = (data: T) => void;

export class EventBus {
  private listeners = new Map<keyof EventMap, Listener<never>[]>();

  /** Subscribe to a typed event. */
  on<K extends keyof EventMap>(event: K, callback: Listener<EventMap[K]>): void {
    const list = this.listeners.get(event) ?? [];
    list.push(callback as Listener<never>);
    this.listeners.set(event, list);
  }

  /** Emit a typed event to all registered listeners (error-isolated). */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
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
