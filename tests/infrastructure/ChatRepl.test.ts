import { describe, expect, it } from "vitest";

import { ChatSession } from "../../src/application/ChatSession.js";
import { RateLimitError } from "../../src/domain/errors.js";
import type { CompletionChunk, TokenUsage } from "../../src/domain/model/CompletionChunk.js";
import { ChatRepl, type ChatReplOptions } from "../../src/infrastructure/cli/ChatRepl.js";
import { FakeLlmPort, type FakeLlmScript } from "../fakes/FakeLlmPort.js";
import { MemoryChatIo } from "../fakes/MemoryChatIo.js";
import { RecordingEventSink } from "../fakes/RecordingEventSink.js";

const usage: TokenUsage = {
  inputTokens: 10,
  outputTokens: 20,
  reasoningTokens: 0,
  totalTokens: 30,
};

function chunks(responseId: string, text: string): CompletionChunk[] {
  return [
    { kind: "text", delta: text },
    { kind: "completed", responseId, usage },
  ];
}

const ok1: FakeLlmScript = { chunks: chunks("resp_1", "primera") };
const ok2: FakeLlmScript = { chunks: chunks("resp_2", "segunda") };

function build(
  scripts: readonly FakeLlmScript[],
  lines: readonly string[],
  options: Partial<ChatReplOptions> = {},
): {
  repl: ChatRepl;
  io: MemoryChatIo;
  llm: FakeLlmPort;
  session: ChatSession;
  sinks: RecordingEventSink[];
} {
  const llm = new FakeLlmPort(scripts);
  const session = new ChatSession(llm);
  const io = new MemoryChatIo(lines);
  const sinks: RecordingEventSink[] = [];

  const repl = new ChatRepl(
    {
      session,
      io,
      createSink: () => {
        const sink = new RecordingEventSink();
        sinks.push(sink);
        return sink;
      },
    },
    {
      effort: options.effort ?? "medium",
      verbose: options.verbose ?? false,
      json: options.json ?? false,
    },
  );

  return { repl, io, llm, session, sinks };
}

describe("ChatRepl", () => {
  it("ejecuta dos turnos encadenados y sale con 0", async () => {
    const { repl, io, llm, sinks } = build([ok1, ok2], ["uno", "dos", "/salir"]);

    await expect(repl.run()).resolves.toBe(0);

    expect(llm.requests).toHaveLength(2);
    expect(llm.requests[1]?.previousResponseId).toBe("resp_1");
    expect(sinks[0]?.output).toBe("primera");
    expect(sinks[1]?.output).toBe("segunda");
    expect(io.outText).toBe("\n\n");
    expect(io.errText).toContain("Hasta luego.");
  });

  it("/limpiar olvida el hilo sin cerrar la sesión", async () => {
    const { repl, io, llm } = build(
      [ok1, ok2],
      ["uno", "/limpiar", "dos", "/salir"],
    );

    await expect(repl.run()).resolves.toBe(0);

    expect(llm.requests[1]?.previousResponseId).toBeUndefined();
    expect(io.errText).toContain("Hilo reiniciado");
  });

  it("/ayuda no envía ninguna petición", async () => {
    const { repl, io, llm } = build([], ["/ayuda", "/salir"]);

    await expect(repl.run()).resolves.toBe(0);

    expect(llm.requests).toHaveLength(0);
    expect(io.errText).toContain("/limpiar");
    expect(io.errText).toContain("/salir");
  });

  it("informa de prompts inválidos y mantiene la sesión abierta", async () => {
    const { repl, io, llm, sinks } = build(
      [],
      ["", "   ", "x".repeat(8_001), "/salir"],
    );

    await expect(repl.run()).resolves.toBe(0);

    expect(llm.requests).toHaveLength(0);
    expect(sinks).toHaveLength(3);
    expect(sinks[0]?.errors[0]?.message).toMatch(/vacío/);
    expect(sinks[1]?.errors[0]?.message).toMatch(/vacío/);
    expect(sinks[2]?.errors[0]?.message).toMatch(/máximo/);
    expect(io.errText).toContain("Hasta luego.");
  });

  it("aísla el error de un turno y permite el siguiente", async () => {
    const { repl, llm, session, sinks } = build(
      [{ chunks: [], error: new RateLimitError("límite de tasa") }, ok2],
      ["falla", "funciona", "/salir"],
    );

    await expect(repl.run()).resolves.toBe(0);

    expect(llm.requests).toHaveLength(2);
    expect(sinks[0]?.errors[0]?.message).toMatch(/límite de tasa/);
    expect(sinks[1]?.output).toBe("segunda");
    expect(session.previousResponseId).toBe("resp_2");
  });

  it("en modo --json emite una línea NDJSON por turno correcto", async () => {
    const { repl, io } = build([ok1], ["hola", "/salir"], { json: true });

    await expect(repl.run()).resolves.toBe(0);

    const lines = io.outText.trim().split("\n");

    expect(lines).toHaveLength(1);

    const document = JSON.parse(lines[0] ?? "") as {
      turn: number;
      responseId: string;
      text: string;
      usage: TokenUsage;
    };

    expect(document).toEqual({
      turn: 1,
      responseId: "resp_1",
      text: "primera",
      usage,
    });
    expect(io.errText).toContain("run-model chat");
  });

  it("en modo --json emite un documento de error por turno fallido", async () => {
    const { repl, io } = build(
      [{ chunks: [], error: new RateLimitError("límite de tasa") }],
      ["falla", "/salir"],
      { json: true },
    );

    await expect(repl.run()).resolves.toBe(0);

    const document = JSON.parse(io.outText.trim()) as {
      turn: number;
      error: { code: number; message: string };
    };

    expect(document.turn).toBe(1);
    expect(document.error.code).toBe(5);
    expect(document.error.message).toMatch(/límite de tasa/);
  });

  it("Ctrl+C en el prompt cierra con 130", async () => {
    const { repl, io } = build([], []);

    const running = repl.run();

    expect(io.waiting).toBe(true);

    io.pressCtrlC();

    await expect(running).resolves.toBe(130);
    expect(io.prompts).toContain("tú> ");
  });
});
