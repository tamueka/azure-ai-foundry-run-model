import { describe, expect, it } from "vitest";

import { ChatSession } from "../../src/application/ChatSession.js";
import { InvalidPromptError, RateLimitError } from "../../src/domain/errors.js";
import type { CompletionChunk, TokenUsage } from "../../src/domain/model/CompletionChunk.js";
import { FakeLlmPort, type FakeLlmScript } from "../fakes/FakeLlmPort.js";
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

function build(scripts: readonly FakeLlmScript[]): {
  session: ChatSession;
  llm: FakeLlmPort;
} {
  const llm = new FakeLlmPort(scripts);

  return { session: new ChatSession(llm), llm };
}

describe("ChatSession", () => {
  it("el primer turno no envía previousResponseId y pide store", async () => {
    const { session, llm } = build([{ chunks: chunks("resp_1", "hola") }]);

    await session.send({ prompt: "primer turno" }, new RecordingEventSink());

    expect(llm.requests[0]).toEqual({
      prompt: "primer turno",
      effort: "medium",
      verbose: false,
      store: true,
    });
    expect(session.previousResponseId).toBe("resp_1");
    expect(session.hasThread).toBe(true);
  });

  it("encadena el responseId del turno anterior", async () => {
    const { session, llm } = build([
      { chunks: chunks("resp_1", "uno") },
      { chunks: chunks("resp_2", "dos") },
    ]);

    await session.send({ prompt: "uno" }, new RecordingEventSink());
    await session.send({ prompt: "dos" }, new RecordingEventSink());

    expect(llm.requests[1]?.previousResponseId).toBe("resp_1");
    expect(session.previousResponseId).toBe("resp_2");
  });

  it("reset olvida el hilo y el siguiente turno vuelve a ser el primero", async () => {
    const { session, llm } = build([
      { chunks: chunks("resp_1", "uno") },
      { chunks: chunks("resp_2", "dos") },
    ]);

    await session.send({ prompt: "uno" }, new RecordingEventSink());
    session.reset();

    expect(session.hasThread).toBe(false);
    expect(session.previousResponseId).toBeNull();

    await session.send({ prompt: "dos" }, new RecordingEventSink());

    expect(llm.requests[1]?.previousResponseId).toBeUndefined();
    expect(session.previousResponseId).toBe("resp_2");
  });

  it("un error no avanza el hilo", async () => {
    const { session, llm } = build([
      { chunks: chunks("resp_1", "uno") },
      { chunks: [], error: new RateLimitError("límite de tasa") },
      { chunks: chunks("resp_3", "tres") },
    ]);

    await session.send({ prompt: "uno" }, new RecordingEventSink());

    await expect(
      session.send({ prompt: "dos" }, new RecordingEventSink()),
    ).rejects.toBeInstanceOf(RateLimitError);

    expect(session.previousResponseId).toBe("resp_1");

    await session.send({ prompt: "tres" }, new RecordingEventSink());

    expect(llm.requests[2]?.previousResponseId).toBe("resp_1");
    expect(session.previousResponseId).toBe("resp_3");
  });

  it("una cancelación no avanza el hilo", async () => {
    const { session } = build([
      { chunks: chunks("resp_1", "uno") },
      { chunks: chunks("resp_2", "dos") },
    ]);

    await session.send({ prompt: "uno" }, new RecordingEventSink());

    const controller = new AbortController();
    controller.abort();

    await expect(
      session.send({ prompt: "dos" }, new RecordingEventSink(), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(session.previousResponseId).toBe("resp_1");
  });

  it("valida el prompt antes de tocar el puerto", async () => {
    const { session, llm } = build([{ chunks: chunks("resp_1", "uno") }]);

    await expect(
      session.send({ prompt: "   " }, new RecordingEventSink()),
    ).rejects.toBeInstanceOf(InvalidPromptError);

    expect(llm.requests).toHaveLength(0);
    expect(session.hasThread).toBe(false);
  });

  it("propaga effort y verbose al puerto", async () => {
    const { session, llm } = build([{ chunks: chunks("resp_1", "uno") }]);

    await session.send(
      { prompt: "hola", effort: "low", verbose: true },
      new RecordingEventSink(),
    );

    expect(llm.requests[0]?.effort).toBe("low");
    expect(llm.requests[0]?.verbose).toBe(true);
  });

  it("cada turno escribe en su propio sink", async () => {
    const { session } = build([
      { chunks: chunks("resp_1", "primera") },
      { chunks: chunks("resp_2", "segunda") },
    ]);
    const first = new RecordingEventSink();
    const second = new RecordingEventSink();

    await session.send({ prompt: "uno" }, first);
    await session.send({ prompt: "dos" }, second);

    expect(first.output).toBe("primera");
    expect(second.output).toBe("segunda");
  });
});
