import { IncompleteStreamError } from "../errors.js";
import type { CompletionChunk, TokenUsage } from "./CompletionChunk.js";

/** Resultado final de una petición, independiente del proveedor. */
export interface Completion {
  readonly responseId: string;
  readonly text: string;
  readonly usage: TokenUsage;
}

/**
 * Acumula chunks en el resultado final.
 *
 * Es una pieza pura del dominio: no hace I/O, no conoce puertos y se puede
 * testear sin red. El caso de uso lo usa para no duplicar lógica de agregación.
 */
export class CompletionAccumulator {
  readonly #textParts: string[] = [];
  readonly #reasoningParts: string[] = [];

  #responseId: string | null = null;
  #usage: TokenUsage | null = null;

  /** Incorpora un chunk. Los `raw` se ignoran (son diagnóstico, no contenido). */
  apply(chunk: CompletionChunk): void {
    switch (chunk.kind) {
      case "text":
        this.#textParts.push(chunk.delta);
        return;
      case "reasoning":
        this.#reasoningParts.push(chunk.delta);
        return;
      case "completed":
        this.#responseId = chunk.responseId;
        this.#usage = chunk.usage;
        return;
      case "raw":
        return;
    }
  }

  /** Texto visible acumulado. */
  get text(): string {
    return this.#textParts.join("");
  }

  /** Razonamiento acumulado (puede estar vacío). */
  get reasoning(): string {
    return this.#reasoningParts.join("");
  }

  /** `true` si ya se recibió el chunk terminal. */
  get isComplete(): boolean {
    return this.#responseId !== null && this.#usage !== null;
  }

  /**
   * Construye el resultado final.
   * @throws {IncompleteStreamError} si el stream no emitió `completed` (I3).
   */
  build(): Completion {
    if (this.#responseId === null || this.#usage === null) {
      throw new IncompleteStreamError();
    }

    return {
      responseId: this.#responseId,
      text: this.text,
      usage: this.#usage,
    };
  }
}