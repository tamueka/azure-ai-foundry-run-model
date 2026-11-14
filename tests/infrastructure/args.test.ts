import { describe, expect, it } from "vitest";

import { UsageError } from "../../src/domain/errors.js";
import { DEFAULT_PROMPT, parseArgs } from "../../src/infrastructure/cli/args.js";

describe("parseArgs", () => {
  it("usa el prompt por defecto cuando no hay argumentos", () => {
    const options = parseArgs([]);

    expect(options).toEqual({
      prompt: DEFAULT_PROMPT,
      verbose: false,
      json: false,
      chat: false,
      effort: "medium",
      help: false,
    });
  });

  it("acepta el prompt posicional", () => {
    const prompt = "una pregunta propia";

    expect(parseArgs([prompt]).prompt).toBe(prompt);
  });

  it("une varios argumentos posicionales", () => {
    expect(parseArgs(["hola", "mundo"]).prompt).toBe("hola mundo");
  });

  it("reconoce -v y --verbose", () => {
    expect(parseArgs(["-v"]).verbose).toBe(true);
    expect(parseArgs(["--verbose"]).verbose).toBe(true);
  });

  it("reconoce --json y -h", () => {
    const options = parseArgs(["--json", "-h"]);

    expect(options.json).toBe(true);
    expect(options.help).toBe(true);
  });

  it("acepta --effort con valor válido", () => {
    expect(parseArgs(["--effort", "high"]).effort).toBe("high");
    expect(parseArgs(["--effort", "low", "hola"]).prompt).toBe("hola");
  });

  it("rechaza --effort sin valor", () => {
    expect(() => parseArgs(["--effort"])).toThrow(UsageError);
    expect(() => parseArgs(["--effort"])).toThrow(/requiere un valor/);
  });

  it("rechaza --effort con valor inválido", () => {
    expect(() => parseArgs(["--effort", "maximo"])).toThrow(/Valor inválido/);
  });

  it("reconoce --chat", () => {
    expect(parseArgs(["--chat"]).chat).toBe(true);
    expect(parseArgs(["--chat", "--json", "--verbose"]).json).toBe(true);
    expect(parseArgs(["--chat", "--verbose"]).verbose).toBe(true);
  });

  it("rechaza un prompt posicional en modo --chat", () => {
    expect(() => parseArgs(["--chat", "hola"])).toThrow(UsageError);
    expect(() => parseArgs(["--chat", "hola"])).toThrow(/no acepta prompt posicional/);
  });

  it("--chat --help no exige un prompt válido", () => {
    expect(parseArgs(["--chat", "--help", "hola"]).help).toBe(true);
  });

  it("rechaza flags desconocidos", () => {
    expect(() => parseArgs(["--turbo"])).toThrow(UsageError);
    expect(() => parseArgs(["--turbo"])).toThrow(/Opción desconocida/);
  });

  it("el error de uso produce exit 2", () => {
    try {
      parseArgs(["--turbo"]);
      expect.unreachable("debería haber lanzado");
    } catch (error) {
      expect((error as UsageError).exitCode).toBe(2);
    }
  });
});