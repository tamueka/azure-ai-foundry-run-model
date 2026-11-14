import { afterEach, describe, expect, it, vi } from "vitest";

import { ConsoleLogger } from "../../src/infrastructure/logging/ConsoleLogger.js";

/** Captura lo que se escribe en `stderr` durante un test. */
function captureStderr(): string[] {
  const writes: string[] = [];

  vi.spyOn(process.stderr, "write").mockImplementation(((
    chunk: string | Uint8Array,
  ) => {
    writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stderr.write);

  return writes;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConsoleLogger", () => {
  it("prefija los eventos con el número de turno", () => {
    const writes = captureStderr();
    const logger = new ConsoleLogger({ verbose: true, turn: 2 });

    logger.event({
      type: "response.output_text.delta",
      sequence_number: 7,
      delta: "hola",
    });

    expect(writes).toEqual(['[turno 2] [7] response.output_text.delta  "hola"\n']);
  });

  it("no emite eventos si verbose está desactivado", () => {
    const writes = captureStderr();
    const logger = new ConsoleLogger({ turn: 1 });

    logger.event({ type: "response.created", sequence_number: 1 });

    expect(writes).toEqual([]);
  });

  it("prefija la información de estado", () => {
    const writes = captureStderr();
    const logger = new ConsoleLogger({ verbose: true, turn: 1 });

    logger.info("iniciando turno");

    expect(writes).toEqual(["[turno 1] iniciando turno\n"]);
  });

  it("prefija los errores y respeta el prefijo en modo sin turno", () => {
    const writes = captureStderr();

    new ConsoleLogger({ turn: 3 }).error("fallo del turno");
    new ConsoleLogger().error("fallo global");

    expect(writes).toEqual([
      "[turno 3] error: fallo del turno\n",
      "error: fallo global\n",
    ]);
  });
});
