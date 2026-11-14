import { InvalidPromptError } from "../errors.js";

/** Longitud máxima aceptada, en caracteres. */
export const PROMPT_MAX_LENGTH = 8_000;

/**
 * Value Object que garantiza que un prompt es utilizable.
 *
 * Solo se puede construir con `Prompt.create`, de modo que un `Prompt`
 * existente es, por definición, válido (no hay estados imposibles).
 */
export class Prompt {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  /**
   * Normaliza (recorta extremos) y valida el texto.
   * @throws {InvalidPromptError} si está vacío o supera `PROMPT_MAX_LENGTH`.
   */
  static create(raw: string): Prompt {
    const value = raw.trim();

    if (value.length === 0) {
      throw new InvalidPromptError("El prompt no puede estar vacío.");
    }

    if (value.length > PROMPT_MAX_LENGTH) {
      throw new InvalidPromptError(
        `El prompt supera el máximo de ${PROMPT_MAX_LENGTH} caracteres (recibidos: ${value.length}).`,
      );
    }

    return new Prompt(value);
  }

  /** Texto normalizado. */
  get value(): string {
    return this.#value;
  }

  /** Longitud en caracteres del texto normalizado. */
  get length(): number {
    return this.#value.length;
  }

  toString(): string {
    return this.#value;
  }
}