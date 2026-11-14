import { CompletionAccumulator, type Completion } from "../domain/model/Completion.js";
import type { CompletionChunk, ReasoningEffort } from "../domain/model/CompletionChunk.js";
import { Prompt } from "../domain/model/Prompt.js";
import type { EventSink } from "../domain/ports/EventSink.js";
import type { LlmPort } from "../domain/ports/LlmPort.js";

/** Entrada del caso de uso, tal como la entrega el CLI (sin validar). */
export interface ExecuteInput {
  readonly prompt: string;
  readonly effort?: ReasoningEffort;
  readonly verbose?: boolean;
  readonly store?: boolean;
  readonly previousResponseId?: string;
}

export interface ExecuteOptions {
  readonly signal?: AbortSignal;
}

/**
 * Caso de uso: enviar un prompt y reconstruir la respuesta completa.
 *
 * Solo depende de puertos (`LlmPort`, `EventSink`), nunca de implementaciones
 * concretas. No conoce canales de salida ni SDKs.
 */
export class RunModelUseCase {
  readonly #llm: LlmPort;
  readonly #sink: EventSink;

  constructor(llm: LlmPort, sink: EventSink) {
    this.#llm = llm;
    this.#sink = sink;
  }

  /**
   * Valida el prompt, consume el stream y devuelve el resultado agregado.
   * @throws {InvalidPromptError} si el prompt no es válido (antes de cualquier I/O).
   * @throws {AppError} cualquier fallo del puerto.
   */
  async execute(input: ExecuteInput, options: ExecuteOptions = {}): Promise<Completion> {
    const prompt = Prompt.create(input.prompt);
    const accumulator = new CompletionAccumulator();

    const stream = this.#llm.stream(
      {
        prompt: prompt.value,
        effort: input.effort ?? "medium",
        verbose: input.verbose ?? false,
        store: input.store ?? false,
        ...(input.previousResponseId === undefined
          ? {}
          : { previousResponseId: input.previousResponseId }),
      },
      options.signal === undefined ? {} : { signal: options.signal },
    );

    for await (const chunk of stream) {
      accumulator.apply(chunk);
      this.#forward(chunk);
    }

    return accumulator.build();
  }

  /** Traduce el chunk de dominio a la salida observable. */
  #forward(chunk: CompletionChunk): void {
    switch (chunk.kind) {
      case "text":
        this.#sink.text(chunk.delta);
        return;
      case "raw":
        this.#sink.event(chunk.event);
        return;
      case "reasoning":
      case "completed":
        return;
    }
  }
}