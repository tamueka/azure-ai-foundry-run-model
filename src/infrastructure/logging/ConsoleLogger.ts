import type { EventSink } from "../../domain/ports/EventSink.js";

export interface ConsoleLoggerOptions {
  /** Habilita eventos crudos y mensajes de estado en `stderr`. */
  readonly verbose?: boolean;
  /** Silencia el texto visible en `stdout` (el JSON se emite al final). */
  readonly json?: boolean;
  /** Número de turno para prefijar el diagnóstico. Sin valor, no hay prefijo. */
  readonly turn?: number;
}

/**
 * `EventSink` sobre la consola.
 *
 * Garantiza el contrato `cli.md` §8: `stdout` solo lleva datos; `stderr` lleva
 * diagnóstico. Nunca duplica información.
 */
export class ConsoleLogger implements EventSink {
  readonly #verbose: boolean;
  readonly #json: boolean;
  readonly #turn: number | undefined;

  constructor(options: ConsoleLoggerOptions = {}) {
    this.#verbose = options.verbose ?? false;
    this.#json = options.json ?? false;
    this.#turn = options.turn;
  }

  text(delta: string): void {
    if (this.#json) {
      return;
    }

    process.stdout.write(delta);
  }

  event(payload: unknown): void {
    if (!this.#verbose) {
      return;
    }

    process.stderr.write(`${this.#prefix()}${formatEvent(payload)}\n`);
  }

  info(message: string): void {
    if (!this.#verbose) {
      return;
    }

    process.stderr.write(`${this.#prefix()}${message}\n`);
  }

  error(message: string, cause?: unknown): void {
    process.stderr.write(`${this.#prefix()}error: ${message}\n`);

    if (this.#verbose && cause !== undefined) {
      process.stderr.write(`causa: ${formatCause(cause)}\n`);
    }
  }

  /** `[turno N] ` cuando el logger pertenece a un turno del REPL. */
  #prefix(): string {
    return this.#turn === undefined ? "" : `[turno ${this.#turn}] `;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** `[14] response.output_text.delta  "\\n"` */
function formatEvent(payload: unknown): string {
  if (!isRecord(payload)) {
    return String(payload);
  }

  const type = typeof payload["type"] === "string" ? payload["type"] : "evento";
  const sequence = typeof payload["sequence_number"] === "number"
    ? payload["sequence_number"]
    : null;
  const delta = typeof payload["delta"] === "string"
    ? JSON.stringify(payload["delta"])
    : "";

  const prefix = sequence === null ? "" : `[${sequence}] `;
  const suffix = delta.length === 0 ? "" : `  ${delta}`;

  return `${prefix}${type}${suffix}`;
}

function formatCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.stack ?? `${cause.name}: ${cause.message}`;
  }

  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}