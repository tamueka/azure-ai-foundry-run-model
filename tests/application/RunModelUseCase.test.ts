import { describe, expect, it } from "vitest";

import { RunModelUseCase } from "../../src/application/RunModelUseCase.js";
import {
  AuthError,
  IncompleteStreamError,
  InvalidPromptError,
} from "../../src/domain/errors.js";
import type { CompletionChunk, TokenUsage } from "../../src/domain/model/CompletionChunk.js";
import { FakeLlmPort } from "../fakes/FakeLlmPort.js";
import { RecordingEventSink } from "../fakes/RecordingEventSink.js";

const usage: TokenUsage = {
  inputTokens: 16,
  outputTokens: 188,
  reasoningTokens: 64,
  totalTokens: 204,
};

const PROMPT = "¿Qué es Microsoft Foundry?";
const RESPUESTA =
  "Microsoft Foundry es la plataforma de IA de Microsoft.\nIntegra modelos, agentes y herramientas.";

const happyChunks: CompletionChunk[] = [
  { kind: "text", delta: "Microsoft Foundry es la plataforma de IA de Microsoft.\n" },
  { kind: "text", delta: "Integra modelos, agentes y herramientas." },
  { kind: "completed", responseId: "resp_123", usage },
];

function build(script: { chunks: CompletionChunk[]; error?: Error }): {
  useCase: RunModelUseCase;
  llm: FakeLlmPort;
  sink: RecordingEventSink;
} {
  const llm = new FakeLlmPort(script);
  const sink = new RecordingEventSink();

  return { useCase: new RunModelUseCase(llm, sink), llm, sink };
}

describe("RunModelUseCase", () => {
  it("devuelve la respuesta agregada y escribe el texto una sola vez", async () => {
    const { useCase, sink } = build({ chunks: happyChunks });

    const completion = await useCase.execute({ prompt: PROMPT });

    expect(completion).toEqual({
      responseId: "resp_123",
      text: RESPUESTA,
      usage,
    });
    expect(sink.output).toBe(RESPUESTA);
    expect(sink.texts).toHaveLength(2);
  });

  it("normaliza el prompt antes de llamar al puerto", async () => {
    const { useCase, llm } = build({ chunks: happyChunks });

    await useCase.execute({ prompt: `  ${PROMPT}  ` });

    expect(llm.requests[0]?.prompt).toBe(PROMPT);
  });

  it("aplica los valores por defecto de effort, verbose y store", async () => {
    const { useCase, llm } = build({ chunks: happyChunks });

    await useCase.execute({ prompt: "hola" });

    expect(llm.requests[0]).toEqual({
      prompt: "hola",
      effort: "medium",
      verbose: false,
      store: false,
    });
  });

  it("propaga previousResponseId al puerto", async () => {
    const { useCase, llm } = build({ chunks: happyChunks });

    await useCase.execute({ prompt: "hola", previousResponseId: "resp_0" });

    expect(llm.requests[0]?.previousResponseId).toBe("resp_0");
  });

  it("reenvía los eventos raw al sink (modo verbose)", async () => {
    const { useCase, sink } = build({
      chunks: [
        { kind: "raw", event: { type: "response.created", sequence_number: 1 } },
        ...happyChunks,
      ],
    });

    await useCase.execute({ prompt: "hola", verbose: true });

    expect(sink.events).toEqual([{ type: "response.created", sequence_number: 1 }]);
    expect(sink.output).toBe(RESPUESTA);
  });

  it("no escribe razonamiento en la salida visible", async () => {
    const { useCase, sink } = build({
      chunks: [
        { kind: "reasoning", delta: "definir Foundry y sus componentes" },
        ...happyChunks,
      ],
    });

    await useCase.execute({ prompt: "hola" });

    expect(sink.output).not.toContain("definir Foundry");
    expect(sink.output).toBe(RESPUESTA);
  });

  it("valida el prompt antes de tocar el puerto", async () => {
    const { useCase, llm } = build({ chunks: happyChunks });

    await expect(useCase.execute({ prompt: "   " })).rejects.toBeInstanceOf(InvalidPromptError);
    expect(llm.requests).toHaveLength(0);
  });

  it("propaga la cancelación con AbortError", async () => {
    const { useCase } = build({ chunks: happyChunks });
    const controller = new AbortController();
    controller.abort();

    try {
      await useCase.execute({ prompt: "hola" }, { signal: controller.signal });
      expect.unreachable("debería haber lanzado");
    } catch (error) {
      expect((error as Error).name).toBe("AbortError");
    }
  });

  it("propaga errores tipados del puerto", async () => {
    const { useCase } = build({ chunks: [], error: new AuthError("sin sesión") });

    await expect(useCase.execute({ prompt: "hola" })).rejects.toBeInstanceOf(AuthError);
  });

  it("falla si el stream no emite el chunk terminal", async () => {
    const { useCase } = build({ chunks: [{ kind: "text", delta: "parcial" }] });

    await expect(useCase.execute({ prompt: "hola" })).rejects.toBeInstanceOf(
      IncompleteStreamError,
    );
  });
});