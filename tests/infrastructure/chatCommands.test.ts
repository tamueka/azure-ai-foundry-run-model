import { describe, expect, it } from "vitest";

import {
  CHAT_HELP,
  parseChatCommand,
} from "../../src/infrastructure/cli/chatCommands.js";

describe("parseChatCommand", () => {
  it("reconoce /salir y recorta espacios", () => {
    expect(parseChatCommand("  /salir  ")).toEqual({ kind: "exit" });
  });

  it("reconoce /limpiar", () => {
    expect(parseChatCommand("/limpiar")).toEqual({ kind: "clear" });
  });

  it("reconoce /ayuda", () => {
    expect(parseChatCommand("/ayuda")).toEqual({ kind: "help" });
  });

  it("trata el texto libre como prompt", () => {
    expect(parseChatCommand("  ¿Qué es Foundry?  ")).toEqual({
      kind: "prompt",
      text: "¿Qué es Foundry?",
    });
  });

  it("trata una línea vacía como prompt vacío para que Prompt la rechace", () => {
    expect(parseChatCommand("   ")).toEqual({ kind: "prompt", text: "" });
  });

  it("no reconoce comandos con texto adicional ni con otra caja", () => {
    expect(parseChatCommand("/salir ahora")).toEqual({
      kind: "prompt",
      text: "/salir ahora",
    });
    expect(parseChatCommand("/SALIR")).toEqual({ kind: "prompt", text: "/SALIR" });
  });

  it("la ayuda menciona los tres comandos", () => {
    expect(CHAT_HELP).toContain("/ayuda");
    expect(CHAT_HELP).toContain("/limpiar");
    expect(CHAT_HELP).toContain("/salir");
  });
});
