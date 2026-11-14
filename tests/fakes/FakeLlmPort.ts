import type {
  CompletionChunk,
  CompletionRequest,
} from "../../src/domain/model/CompletionChunk.js";
import type { LlmPort, LlmStreamOptions } from "../../src/domain/ports/LlmPort.js";

/** Guion que sigue el fake: chunks a emitir y, opcionalmente, un error final. */
export interface FakeLlmScript {
  readonly chunks: readonly CompletionChunk[];
  readonly error?: Error;
}

/**
 * Implementación de `LlmPort` para tests: sin red, sin coste y determinista.
 *
 * Registra las peticiones recibidas para poder afirmar sobre lo que el caso de
 * uso pidió al puerto. Respeta `AbortSignal` (I7 del contrato).
 */
export class FakeLlmPort implements LlmPort {
  readonly requests: CompletionRequest[] = [];
  readonly receivedOptions: Array<LlmStreamOptions | undefined> = [];

  readonly #script: FakeLlmScript;

  constructor(script: FakeLlmScript) {
    this.#script = script;
  }

  async *stream(
    request: CompletionRequest,
    options?: LlmStreamOptions,
  ): AsyncIterable<CompletionChunk> {
    this.requests.push(request);
    this.receivedOptions.push(options);

    for (const chunk of this.#script.chunks) {
      options?.signal?.throwIfAborted();
      yield chunk;
    }

    if (this.#script.error !== undefined) {
      throw this.#script.error;
    }
  }
}