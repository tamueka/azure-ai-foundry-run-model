import type { Completion } from "../domain/model/Completion.js";
import type { ReasoningEffort } from "../domain/model/CompletionChunk.js";
import type { EventSink } from "../domain/ports/EventSink.js";
import type { LlmPort } from "../domain/ports/LlmPort.js";
import { RunModelUseCase } from "./RunModelUseCase.js";

/** Entrada de un turno conversacional, tal como la entrega el REPL. */
export interface ChatTurnInput {
  readonly prompt: string;
  readonly effort?: ReasoningEffort;
  readonly verbose?: boolean;
}

export interface ChatTurnOptions {
  readonly signal?: AbortSignal;
}

/**
 * Caso de uso de una conversación multi-turno.
 *
 * Conserva **solo en memoria** el `responseId` del último turno correcto y lo
 * envía como `previousResponseId` en el siguiente. Un error o una cancelación
 * no modifican el hilo: solo un `Completion` correcto lo hace avanzar.
 *
 * Contrato normativo: `specs/002-multi-turno/contracts/chat-session.md`.
 */
export class ChatSession {
  readonly #llm: LlmPort;
  #previousResponseId: string | null = null;

  constructor(llm: LlmPort) {
    this.#llm = llm;
  }

  /** Identificador del último turno correcto, o `null` si no hay hilo. */
  get previousResponseId(): string | null {
    return this.#previousResponseId;
  }

  /** `true` si la conversación ya tiene al menos un turno correcto. */
  get hasThread(): boolean {
    return this.#previousResponseId !== null;
  }

  /** Olvida el contexto: el siguiente turno se comporta como el primero. */
  reset(): void {
    this.#previousResponseId = null;
  }

  /**
   * Envía un turno y actualiza el hilo solo si termina correctamente.
   *
   * @throws {InvalidPromptError} si el prompt no es válido (antes de cualquier I/O).
   * @throws {AppError} cualquier fallo del puerto.
   */
  async send(
    input: ChatTurnInput,
    sink: EventSink,
    options: ChatTurnOptions = {},
  ): Promise<Completion> {
    const useCase = new RunModelUseCase(this.#llm, sink);
    const completion = await useCase.execute(
      {
        prompt: input.prompt,
        effort: input.effort,
        verbose: input.verbose,
        store: true,
        ...(this.#previousResponseId === null
          ? {}
          : { previousResponseId: this.#previousResponseId }),
      },
      options,
    );

    this.#previousResponseId = completion.responseId;

    return completion;
  }
}
