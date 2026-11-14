import type { ChatIo } from "../../src/infrastructure/cli/ChatIo.js";

/**
 * `ChatIo` de test: líneas guionizadas y salidas en memoria.
 *
 * Cuando se agotan las líneas, `readLine` queda pendiente hasta que se llama a
 * `close()` o se simula `Ctrl+C`, igual que una terminal interactiva.
 */
export class MemoryChatIo implements ChatIo {
  readonly out: string[] = [];
  readonly err: string[] = [];
  readonly prompts: string[] = [];

  readonly #lines: string[];
  #pending: ((line: string | null) => void) | null = null;
  #handler: (() => void) | null = null;
  #closed = false;

  constructor(lines: readonly string[]) {
    this.#lines = [...lines];
  }

  readLine(prompt: string): Promise<string | null> {
    this.prompts.push(prompt);

    if (this.#closed) {
      return Promise.resolve(null);
    }

    const line = this.#lines.shift();

    if (line !== undefined) {
      return Promise.resolve(line);
    }

    return new Promise((resolve) => {
      this.#pending = resolve;
    });
  }

  writeOut(text: string): void {
    this.out.push(text);
  }

  writeErr(text: string): void {
    this.err.push(text);
  }

  close(): void {
    this.#closed = true;

    if (this.#pending !== null) {
      const resolve = this.#pending;
      this.#pending = null;
      resolve(null);
    }
  }

  onInterrupt(handler: () => void): void {
    this.#handler = handler;
  }

  /** Simula `Ctrl+C`. */
  pressCtrlC(): void {
    this.#handler?.();
  }

  /** `true` si hay un `readLine` esperando entrada. */
  get waiting(): boolean {
    return this.#pending !== null;
  }

  get outText(): string {
    return this.out.join("");
  }

  get errText(): string {
    return this.err.join("");
  }
}
