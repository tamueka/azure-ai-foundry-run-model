import type { CompletionChunk, CompletionRequest } from "../model/CompletionChunk.js";

/** Opciones de una petición de streaming. */
export interface LlmStreamOptions {
  /** Cancelación cooperativa: al abortar, el iterador lanza `AbortError`. */
  readonly signal?: AbortSignal;
}

/**
 * Puerto secundario (driven) hacia un proveedor de LLM.
 *
 * Contrato normativo: `specs/001-run-model-cli/contracts/llm-port.md`.
 * El caso de uso solo conoce esta interfaz; ningún tipo del SDK la atraviesa.
 */
export interface LlmPort {
  /**
   * Inicia un stream perezoso de chunks.
   *
   * Invariantes: emite `text`/`reasoning` en orden, exactamente un `completed`
   * al final, `raw` solo si `request.verbose`, y traduce cualquier fallo del
   * proveedor a una subclase de `AppError`.
   */
  stream(
    request: CompletionRequest,
    options?: LlmStreamOptions,
  ): AsyncIterable<CompletionChunk>;
}