import { describe, expect, it } from "vitest";

import { InvalidPromptError } from "../../src/domain/errors.js";
import { PROMPT_MAX_LENGTH, Prompt } from "../../src/domain/model/Prompt.js";

describe("Prompt", () => {
  it("recorta espacios en los extremos", () => {
    const texto = "  hola mundo\n";
    const prompt = Prompt.create(texto);

    expect(prompt.value).toBe("hola mundo");
    expect(prompt.length).toBe("hola mundo".length);
  });

  it("conserva el texto interno intacto", () => {
    const prompt = Prompt.create("linea 1\nlinea 2");

    expect(prompt.value).toBe("linea 1\nlinea 2");
  });

  it("rechaza cadena vacía", () => {
    expect(() => Prompt.create("")).toThrow(InvalidPromptError);
    expect(() => Prompt.create("")).toThrow(/no puede estar vacío/);
  });

  it("rechaza solo espacios en blanco", () => {
    expect(() => Prompt.create("   \n\t  ")).toThrow(InvalidPromptError);
  });

  it("acepta exactamente el máximo permitido", () => {
    const prompt = Prompt.create("a".repeat(PROMPT_MAX_LENGTH));

    expect(prompt.length).toBe(PROMPT_MAX_LENGTH);
    expect(prompt.value.length).toBe(PROMPT_MAX_LENGTH);
  });

  it("rechaza un carácter más que el máximo", () => {
    const tooLong = "a".repeat(PROMPT_MAX_LENGTH + 1);

    expect(() => Prompt.create(tooLong)).toThrow(InvalidPromptError);
    expect(() => Prompt.create(tooLong)).toThrow(/supera el máximo/);
  });

  it("aplica el recorte antes de medir la longitud", () => {
    const padded = `  ${"a".repeat(PROMPT_MAX_LENGTH)}  `;

    expect(() => Prompt.create(padded)).not.toThrow();
  });

  it("expone su texto con String()", () => {
    expect(String(Prompt.create("hola"))).toBe("hola");
  });

  it("marca el error de prompt como error de uso (exit 2)", () => {
    try {
      Prompt.create("");
      expect.unreachable("debería haber lanzado");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPromptError);
      expect((error as InvalidPromptError).exitCode).toBe(2);
    }
  });
});