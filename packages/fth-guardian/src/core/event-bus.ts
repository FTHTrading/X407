/**
 * EventBus — Inter-daemon communication
 *
 * All daemons communicate through events. This enables loose coupling
 * and allows the system to react to changes asynchronously.
 */

type EventHandler = (event: GuardianEvent) => void | Promise<void>;

export interface GuardianEvent {
  type: string;
  source: string;
  timestamp: string;
  data: Record<string, unknown>;
  severity: "info" | "warn" | "critical" | "emergency";
}

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private history: GuardianEvent[] = [];
  private maxHistory = 1000;

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  async emit(event: string, source: string, data: Record<string, unknown>, severity: GuardianEvent["severity"] = "info"): Promise<void> {
    const evt: GuardianEvent = {
      type: event,
      source,
      timestamp: new Date().toISOString(),
      data,
      severity,
    };

    this.history.push(evt);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(evt);
        } catch (err) {
          console.error(`[EventBus] Handler error for ${event}: ${String(err)}`);
        }
      }
    }

    // Wildcard handlers
    const wildcards = this.handlers.get("*");
    if (wildcards) {
      for (const handler of wildcards) {
        try {
          await handler(evt);
        } catch {
          // suppress
        }
      }
    }
  }

  getHistory(limit = 100): GuardianEvent[] {
    return this.history.slice(-limit);
  }

  getCriticalEvents(limit = 50): GuardianEvent[] {
    return this.history
      .filter((e) => e.severity === "critical" || e.severity === "emergency")
      .slice(-limit);
  }
}
