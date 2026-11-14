import { describe, expect, it } from "vitest";

import { ConfigError } from "../../src/domain/errors.js";
import {
  Config,
  DEFAULT_SCOPE,
  DEFAULT_TIMEOUT_MS,
} from "../../src/infrastructure/config/Config.js";

const baseEnv: NodeJS.ProcessEnv = {
  AZURE_OPENAI_ENDPOINT: "https://recurso.services.ai.azure.com/openai/v1",
  AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
};

describe("Config", () => {
  it("lee las variables obligatorias", () => {
    const config = Config.fromEnv({ ...baseEnv });

    expect(config.endpoint).toBe("https://recurso.services.ai.azure.com/openai/v1");
    expect(config.deployment).toBe("gpt-5-mini");
  });

  it("aplica scope y timeout por defecto", () => {
    const config = Config.fromEnv({ ...baseEnv });

    expect(config.scope).toBe(DEFAULT_SCOPE);
    expect(config.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
  });

  it("recorta espacios y acepta valores opcionales", () => {
    const config = Config.fromEnv({
      AZURE_OPENAI_ENDPOINT: "  https://recurso.services.ai.azure.com/openai/v1  ",
      AZURE_OPENAI_DEPLOYMENT: "  gpt-5-mini  ",
      AZURE_OPENAI_SCOPE: "  https://ai.azure.com/.default  ",
      AZURE_OPENAI_TIMEOUT_MS: "15000",
    });

    expect(config.endpoint).toBe("https://recurso.services.ai.azure.com/openai/v1");
    expect(config.deployment).toBe("gpt-5-mini");
    expect(config.timeoutMs).toBe(15_000);
  });

  it("falla si falta el endpoint", () => {
    const env: NodeJS.ProcessEnv = { AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini" };

    expect(() => Config.fromEnv(env)).toThrow(ConfigError);
    expect(() => Config.fromEnv(env)).toThrow(/AZURE_OPENAI_ENDPOINT/);
  });

  it("trata una variable vacía como ausente", () => {
    const env: NodeJS.ProcessEnv = { ...baseEnv, AZURE_OPENAI_ENDPOINT: "   " };

    expect(() => Config.fromEnv(env)).toThrow(/AZURE_OPENAI_ENDPOINT/);
  });

  it("falla si falta el deployment", () => {
    const env: NodeJS.ProcessEnv = { AZURE_OPENAI_ENDPOINT: baseEnv["AZURE_OPENAI_ENDPOINT"] };

    expect(() => Config.fromEnv(env)).toThrow(/AZURE_OPENAI_DEPLOYMENT/);
  });

  it("rechaza un endpoint que no es URL", () => {
    const env: NodeJS.ProcessEnv = { ...baseEnv, AZURE_OPENAI_ENDPOINT: "no-es-una-url" };

    expect(() => Config.fromEnv(env)).toThrow(/no es una URL válida/);
  });

  it("rechaza un protocolo no HTTP", () => {
    const env: NodeJS.ProcessEnv = { ...baseEnv, AZURE_OPENAI_ENDPOINT: "ftp://recurso" };

    expect(() => Config.fromEnv(env)).toThrow(/http\(s\)/);
  });

  it("rechaza un timeout no numérico o no positivo", () => {
    expect(() =>
      Config.fromEnv({ ...baseEnv, AZURE_OPENAI_TIMEOUT_MS: "abc" }),
    ).toThrow(/entero positivo/);

    expect(() =>
      Config.fromEnv({ ...baseEnv, AZURE_OPENAI_TIMEOUT_MS: "0" }),
    ).toThrow(/mayor que 0/);
  });

  it("el error de configuración produce exit 2", () => {
    const env: NodeJS.ProcessEnv = {};

    try {
      Config.fromEnv(env);
      expect.unreachable("debería haber lanzado");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).exitCode).toBe(2);
    }
  });
});