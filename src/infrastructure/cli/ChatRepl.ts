import { ChatSession } from "../../application/ChatSession.js";
import { AppError } from "../../domain/errors.js";
import type { ReasoningEffort } from "../../domain/model/CompletionChunk.js";
import type { EventSink } from "../../domain/ports/EventSink.js";
import { CHAT_HELP, parseChatCommand } from "./chatCommands.js";
import type { ChatIo } from "./ChatIo.js";

const EXIT_OK = 0;
const EXIT_UNEXPECTED = 1;
const EXIT_INTERRUPTED = 130;

export interface ChatReplOptions {
  readonly effort: ReasoningEffort;
  readonly verbose: boolean;
  readonly json: boolean;
}

export interface ChatReplDependencies {
  readonly session: ChatSession;
  readonly io: ChatIo;
  /** Crea el sink de cada turno para etiquetar los eventos con su número. */
  readonly createSink: (turn: number) => EventSink;
}

/**
 * Bucle del REPL multi-turno.
 *
 * Interpreta comandos, ejecuta turnos y mantiene la sesión viva ante errores.
 * No conoce el SDK ni la configuración: recibe la sesión y el IO ya construidos.
 *
 * Contrato observable: `specs/002-multi-turno/contracts/chat-cli.md`.
 */
export class ChatRepl {
  readonly #session: ChatSession;
  readonly #io: ChatIo;
  readonly #options: ChatReplOptions;
  readonly #createSink: (turn: number) => EventSink;

  #controller: AbortController | null = null;
  #interrupted = false;
  #turn = 0;

  constructor(dependencies: ChatReplDependencies, options: ChatReplOptions) {
    this.#session = dependencies.session;
    this.#io = dependencies.io;
    this.#createSink = dependencies.createSink;
    this.#options = options;
  }

  /**
   * Ejecuta el REPL hasta `/salir`, `Ctrl+D` o `Ctrl+C` en el prompt.
   * @returns código de salida del proceso.
   */
  async run(): Promise<number> {
    this.#io.onInterrupt(() => {
      this.#handleInterrupt();
    });

    this.#io.writeErr("run-model chat — escribe /ayuda para ver los comandos.\n");

    while (!this.#interrupted) {
      const line = await this.#io.readLine("tú> ");

      if (line === null) {
        break;
      }

      const command = parseChatCommand(line);

      switch (command.kind) {
        case "exit":
          this.#io.writeErr("Hasta luego.\n");
          return EXIT_OK;
        case "clear":
          this.#session.reset();
          this.#io.writeErr("Hilo reiniciado. El siguiente turno empieza sin contexto.\n");
          break;
        case "help":
          this.#io.writeErr(CHAT_HELP);
          break;
        case "prompt":
          await this.#sendTurn(command.text);
          break;
      }
    }

    return this.#interrupted ? EXIT_INTERRUPTED : EXIT_OK;
  }

  /** Ejecuta un turno; cualquier error queda aislado y la sesión continúa. */
  async #sendTurn(prompt: string): Promise<void> {
    this.#turn += 1;

    const turn = this.#turn;
    const controller = new AbortController();
    const sink = this.#createSink(turn);

    this.#controller = controller;

    try {
      const completion = await this.#session.send(
        {
          prompt,
          effort: this.#options.effort,
          verbose: this.#options.verbose,
        },
        sink,
        { signal: controller.signal },
      );

      if (this.#options.json) {
        this.#io.writeOut(`${JSON.stringify({
          turn,
          responseId: completion.responseId,
          text: completion.text,
          usage: completion.usage,
        })}\n`);
      } else {
        this.#io.writeOut("\n");
      }
    } catch (error) {
      if (isAbortError(error)) {
        const message = "Turno cancelado. La sesión sigue abierta.";
        this.#io.writeErr(`${message}\n`);
        this.#writeJsonError(turn, EXIT_INTERRUPTED, message);
        return;
      }

      if (error instanceof AppError) {
        sink.error(error.message, error);
        this.#writeJsonError(turn, error.exitCode, error.message);
        return;
      }

      sink.error("Error inesperado.", error);
      this.#writeJsonError(turn, EXIT_UNEXPECTED, "Error inesperado.");
    } finally {
      if (this.#controller === controller) {
        this.#controller = null;
      }
    }
  }

  /** `Ctrl+C` cancela el turno activo o cierra el REPL si está en el prompt. */
  #handleInterrupt(): void {
    if (this.#controller !== null) {
      this.#controller.abort();
      return;
    }

    this.#interrupted = true;
    this.#io.close();
  }

  #writeJsonError(turn: number, code: number, message: string): void {
    if (!this.#options.json) {
      return;
    }

    this.#io.writeOut(`${JSON.stringify({ turn, error: { code, message } })}\n`);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === "AbortError" || error.name === "APIUserAbortError");
}
