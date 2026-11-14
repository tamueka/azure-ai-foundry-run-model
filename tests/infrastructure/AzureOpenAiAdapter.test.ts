import { OpenAIError } from "openai";
import { describe, expect, it } from "vitest";

import { AuthError } from "../../src/domain/errors.js";
import type { CompletionRequest } from "../../src/domain/model/CompletionChunk.js";
import {
  buildRequestPayload,
  toAppError,
} from "../../src/infrastructure/azure/AzureOpenAiAdapter.js";

const ENDPOINT = "https://recurso.services.ai.azure.com/openai/v1";
const DEPLOYMENT = "gpt-5-mini";

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;

  return error;
}

describe("buildRequestPayload", () => {
  const base: CompletionRequest = {
    prompt: "hola",
    effort: "low",
    store: true,
  };

  it("incluye previous_response_id cuando hay hilo", () => {
    const payload = buildRequestPayload(
      { ...base, previousResponseId: "resp_123" },
      "gpt-5-mini",
    );

    expect(payload).toEqual({
      model: "gpt-5-mini",
      input: "hola",
      store: true,
      reasoning: { effort: "low" },
      previous_response_id: "resp_123",
    });
  });

  it("omite previous_response_id en el primer turno", () => {
    const payload = buildRequestPayload(base, "gpt-5-mini");

    expect(payload).not.toHaveProperty("previous_response_id");
  });

  it("aplica los valores por defecto de effort y store", () => {
    const payload = buildRequestPayload({ prompt: "hola" }, "gpt-5-mini");

    expect(payload.reasoning).toEqual({ effort: "medium" });
    expect(payload.store).toBe(false);
  });
});

describe("toAppError", () => {
  it("mapea un fallo de credencial envuelto por OpenAIError a AuthError (exit 3)", () => {
    const wrapped = new OpenAIError(
      "Failed to get token from 'apiKey' function: EnvironmentCredential authentication failed",
      { cause: namedError("AuthenticationError", "credencial inválida") },
    );

    const mapped = toAppError(wrapped, ENDPOINT, DEPLOYMENT);

    expect(mapped).toBeInstanceOf(AuthError);
    expect(mapped.exitCode).toBe(3);
    expect(mapped.message).toMatch(/az login/);
  });

  it("mapea un AggregateError de credenciales a AuthError (exit 3)", () => {
    const aggregate = new AggregateError(
      [namedError("CredentialUnavailableError", "sin credenciales")],
      "no hay credenciales disponibles",
    );

    const mapped = toAppError(aggregate, ENDPOINT, DEPLOYMENT);

    expect(mapped).toBeInstanceOf(AuthError);
    expect(mapped.exitCode).toBe(3);
  });
});