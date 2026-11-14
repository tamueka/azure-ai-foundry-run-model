import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEFAULT_PROMPT } from "../../src/infrastructure/cli/args.js";

/**
 * Paridad del prompt por defecto entre las dos implementaciones.
 *
 * El mismo texto vive en TypeScript (`args.ts`) y en Python (`run_model.py`).
 * Este test evita que vuelvan a divergir: lee el literal de Python y lo compara
 * con `DEFAULT_PROMPT`.
 */
const PYTHON_FILE = fileURLToPath(new URL("../../run_model.py", import.meta.url));

function readPythonDefaultPrompt(): string {
  const source = readFileSync(PYTHON_FILE, "utf8");
  const match = /^DEFAULT_PROMPT = "(.+)"$/m.exec(source);

  if (match?.[1] === undefined) {
    throw new Error("No se encontró DEFAULT_PROMPT en run_model.py");
  }

  return match[1];
}

describe("paridad del prompt por defecto", () => {
  it("usa el mismo texto en TypeScript y en Python", () => {
    expect(readPythonDefaultPrompt()).toBe(DEFAULT_PROMPT);
  });
});