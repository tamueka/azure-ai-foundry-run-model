import type { EventSink } from "../../src/domain/ports/EventSink.js";

/** `EventSink` de test: guarda todo en memoria en lugar de escribir en consola. */
export class RecordingEventSink implements EventSink {
  readonly texts: string[] = [];
  readonly events: unknown[] = [];
  readonly infos: string[] = [];
  readonly errors: Array<{ message: string; cause?: unknown }> = [];

  text(delta: string): void {
    this.texts.push(delta);
  }

  event(payload: unknown): void {
    this.events.push(payload);
  }

  info(message: string): void {
    this.infos.push(message);
  }

  error(message: string, cause?: unknown): void {
    this.errors.push({ message, cause });
  }

  /** Texto visible acumulado. */
  get output(): string {
    return this.texts.join("");
  }
}