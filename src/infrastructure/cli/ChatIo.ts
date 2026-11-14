import { createInterface, type Interface } from "node:readline";
import type { Readable, Writable } from "node:stream";

/**
 * Entrada/salida del REPL.
 *
 * Abstrae la consola para que `ChatRepl` se pueda probar con líneas
 * guionizadas. El contrato observable está en
 * `specs/002-multi-turno/contracts/chat-cli.md`.
 */
export interface ChatIo {
  /** Escribe el prompt en `stderr` y devuelve la línea, o `null` al cerrar. */
  readLine(prompt: string): Promise<string | null>;
  /** Dato para `stdout`. */
  writeOut(text: string): void;
  /** Diagnóstico, prompt o ayuda para `stderr`. */
  writeErr(text: string): void;
  /** Cierra la entrada y desbloquea cualquier `readLine` pendiente. */
  close(): void;
  /** Registra el manejador de `Ctrl+C`. */
  onInterrupt(handler: () => void): void;
}

export interface ConsoleChatIoOptions {
  /** Entrada; por defecto `process.stdin`. */
  readonly input?: Readable;
  /** Salida de datos; por defecto `process.stdout`. */
  readonly output?: Writable;
  /** Salida de diagnóstico y prompts; por defecto `process.stderr`. */
  readonly error?: Writable;
  /** Fuerza el modo terminal; por defecto se detecta con `process.stdin.isTTY`. */
  readonly terminal?: boolean;
  /** Escucha `SIGINT` del proceso; por defecto `true`. */
  readonly handleProcessSignals?: boolean;
}

/**
 * `ChatIo` sobre `node:readline`.
 *
 * El prompt se escribe en `stderr` para no contaminar el NDJSON de `stdout`.
 * Escucha `SIGINT` tanto en la interfaz como en el proceso: en terminal,
 * `readline` intercepta `Ctrl+C`; con entrada redirigida, llega al proceso.
 */
export class ConsoleChatIo implements ChatIo {
  readonly #rl: Interface;
  readonly #output: Writable;
  readonly #error: Writable;
  readonly #queued: string[] = [];
  readonly #handleProcessSignals: boolean;
  readonly #onProcessSigint = (): void => {
    this.#handler?.();
  };
  readonly #onReadlineSigint = (): void => {
    this.#handler?.();
  };

  #pending: ((line: string | null) => void) | null = null;
  #handler: (() => void) | null = null;
  #closed = false;
  #detached = false;

  constructor(options: ConsoleChatIoOptions = {}) {
    const input = options.input ?? process.stdin;

    this.#output = options.output ?? process.stdout;
    this.#error = options.error ?? process.stderr;
    this.#handleProcessSignals = options.handleProcessSignals ?? true;

    this.#rl = createInterface({
      input,
      output: this.#error,
      terminal: options.terminal ?? process.stdin.isTTY === true,
      crlfDelay: Infinity,
    });

    this.#rl.on("line", (line) => {
      if (this.#pending !== null) {
        const resolve = this.#pending;
        this.#pending = null;
        resolve(line);
        return;
      }

      this.#queued.push(line);
    });

    this.#rl.on("close", () => {
      this.#closed = true;
      this.#detach();

      if (this.#pending !== null) {
        const resolve = this.#pending;
        this.#pending = null;
        resolve(null);
      }
    });

    this.#rl.on("SIGINT", this.#onReadlineSigint);

    if (this.#handleProcessSignals) {
      process.on("SIGINT", this.#onProcessSigint);
    }
  }

  readLine(prompt: string): Promise<string | null> {
    this.#error.write(prompt);

    const queued = this.#queued.shift();

    if (queued !== undefined) {
      return Promise.resolve(queued);
    }

    if (this.#closed) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      this.#pending = resolve;
    });
  }

  writeOut(text: string): void {
    this.#output.write(text);
  }

  writeErr(text: string): void {
    this.#error.write(text);
  }

  close(): void {
    this.#closed = true;
    this.#queued.length = 0;
    this.#detach();
    this.#rl.close();

    if (this.#pending !== null) {
      const resolve = this.#pending;
      this.#pending = null;
      resolve(null);
    }
  }

  onInterrupt(handler: () => void): void {
    this.#handler = handler;
  }

  /** Evita que un `SIGINT` tardío afecte a un proceso ya cerrado. */
  #detach(): void {
    if (this.#detached) {
      return;
    }

    this.#detached = true;

    if (this.#handleProcessSignals) {
      process.removeListener("SIGINT", this.#onProcessSigint);
    }

    this.#rl.removeListener("SIGINT", this.#onReadlineSigint);
  }
}
