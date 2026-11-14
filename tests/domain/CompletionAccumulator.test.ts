import { describe, expect, it } from "vitest";

import { IncompleteStreamError } from "../../src/domain/errors.js";
import { CompletionAccumulator } from "../../src/domain/model/Completion.js";
import type { TokenUsage } from "../../src/domain/model/CompletionChunk.js";

const usage: TokenUsage = {
  inputTokens: 16,
  outputTokens: 188,
  reasoningTokens: 64,
  totalTokens: 204,
};

const TEXTO_1 = "Microsoft Foundry es la plataforma de IA de Microsoft.\n";
const TEXTO_2 = "Integra modelos, agentes y herramientas.";

describe("CompletionAccumulator", () => {
  it("concatena los deltas de texto en orden", () => {
    const accumulator = new CompletionAccumulator();

    accumulator.apply({ kind: "text", delta: TEXTO_1 });
    accumulator.apply({ kind: "text", delta: TEXTO_2 });

    expect(accumulator.text).toBe(TEXTO_1 + TEXTO_2);
  });

  it("acumula razonamiento por separado del texto visible", () => {
    const accumulator = new CompletionAccumulator();

    accumulator.apply({ kind: "reasoning", delta: "definir Foundry y sus componentes" });
    accumulator.apply({ kind: "text", delta: TEXTO_2 });

    expect(accumulator.reasoning).toBe("definir Foundry y sus componentes");
    expect(accumulator.text).toBe(TEXTO_2);
  });

  it("ignora los chunks raw", () => {
    const accumulator = new CompletionAccumulator();

    accumulator.apply({ kind: "raw", event: { type: "response.created" } });
    accumulator.apply({ kind: "text", delta: "hola" });

    expect(accumulator.text).toBe("hola");
  });

  it("construye el resultado con id y uso", () => {
    const accumulator = new CompletionAccumulator();

    accumulator.apply({ kind: "text", delta: "hola" });
    accumulator.apply({ kind: "completed", responseId: "resp_123", usage });

    expect(accumulator.build()).toEqual({
      responseId: "resp_123",
      text: "hola",
      usage,
    });
  });

  it("informa de que está incompleto antes del chunk terminal", () => {
    const accumulator = new CompletionAccumulator();

    accumulator.apply({ kind: "text", delta: "hola" });

    expect(accumulator.isComplete).toBe(false);
  });

  it("falla si el stream termina sin completed", () => {
    const accumulator = new CompletionAccumulator();

    accumulator.apply({ kind: "text", delta: "hola" });

    expect(() => accumulator.build()).toThrow(IncompleteStreamError);
    expect(() => accumulator.build()).toThrow(/sin un chunk 'completed'/);
  });

  it("el error de stream incompleto es un fallo de proveedor (exit 1)", () => {
    const accumulator = new CompletionAccumulator();

    try {
      accumulator.build();
      expect.unreachable("debería haber lanzado");
    } catch (error) {
      expect(error).toBeInstanceOf(IncompleteStreamError);
      expect((error as IncompleteStreamError).exitCode).toBe(1);
    }
  });
});