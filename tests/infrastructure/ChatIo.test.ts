import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";

import { ConsoleChatIo } from "../../src/infrastructure/cli/ChatIo.js";

function buildIo(): {
  io: ConsoleChatIo;
  input: PassThrough;
  output: PassThrough;
  error: PassThrough;
} {
  const input = new PassThrough();
  const output = new PassThrough();
  const error = new PassThrough();
  const io = new ConsoleChatIo({
    input,
    output,
    error,
    terminal: false,
    handleProcessSignals: false,
  });

  return { io, input, output, error };
}

describe("ConsoleChatIo", () => {
  it("entrega las líneas en cola aunque la entrada se cierre", async () => {
    const { io, input } = buildIo();

    input.end("uno\ndos\n/salir\n");

    const lines: string[] = [];
    let line = await io.readLine("> ");

    while (line !== null) {
      lines.push(line);
      line = await io.readLine("> ");
    }

    expect(lines).toEqual(["uno", "dos", "/salir"]);
    io.close();
  });

  it("close desbloquea un readLine pendiente", async () => {
    const { io } = buildIo();
    const pending = io.readLine("> ");

    io.close();

    await expect(pending).resolves.toBeNull();
  });
});
