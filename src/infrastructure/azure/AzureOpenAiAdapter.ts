import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import OpenAI, { APIError } from "openai";
import type { ResponseStreamEvent } from "openai/resources/responses/responses.js";

import {
  AppError,
  AuthError,
  NotFoundError,
  ProviderError,
  RateLimitError,
} from "../../domain/errors.js";
import type {
  CompletionChunk,
  CompletionRequest,
  ReasoningEffort,
  TokenUsage,
} from "../../domain/model/CompletionChunk.js";
import type { LlmPort, LlmStreamOptions } from "../../domain/ports/LlmPort.js";
import type { Config } from "../config/Config.js";

/** Payload que se envía a la Responses API, independiente de los tipos del SDK. */
export interface AzureResponsePayload {
  readonly model: string;
  readonly input: string;
  readonly store: boolean;
  readonly reasoning: { readonly effort: ReasoningEffort };
  readonly previous_response_id?: string;
}

/**
 * Construye la petición al proveedor.
 *
 * `previous_response_id` solo aparece si hay un hilo; en el primer turno la
 * clave se omite por completo.
 */
export function buildRequestPayload(
  request: CompletionRequest,
  deployment: string,
): AzureResponsePayload {
  const payload: AzureResponsePayload = {
    model: deployment,
    input: request.prompt,
    store: request.store ?? false,
    reasoning: { effort: request.effort ?? "medium" },
  };

  return request.previousResponseId === undefined
    ? payload
    : { ...payload, previous_response_id: request.previousResponseId };
}

/**
 * Adaptador de Azure AI Foundry sobre la Responses API de OpenAI.
 *
 * Es el único punto del programa que conoce el SDK y el protocolo SSE: traduce
 * eventos a `CompletionChunk` y errores HTTP a errores de dominio.
 */
export class AzureOpenAiAdapter implements LlmPort {
  readonly #client: OpenAI;
  readonly #deployment: string;
  readonly #endpoint: string;

  constructor(config: Config) {
    this.#deployment = config.deployment;
    this.#endpoint = config.endpoint;

    this.#client = new OpenAI({
      baseURL: config.endpoint,
      apiKey: getBearerTokenProvider(new DefaultAzureCredential(), config.scope),
      timeout: config.timeoutMs,
    });
  }

  async *stream(
    request: CompletionRequest,
    options?: LlmStreamOptions,
  ): AsyncIterable<CompletionChunk> {
    const signal = options?.signal;

    try {
      const runner = this.#client.responses.stream(
        buildRequestPayload(request, this.#deployment),
        signal === undefined ? undefined : { signal },
      );

      for await (const event of runner) {
        if (request.verbose === true) {
          yield { kind: "raw", event };
        }

        const chunk = mapEvent(event);

        if (chunk !== null) {
          yield chunk;
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      throw toAppError(error, this.#endpoint, this.#deployment);
    }
  }
}

/** Traduce un evento del protocolo a un chunk de dominio (o `null` si no aporta). */
function mapEvent(event: ResponseStreamEvent): CompletionChunk | null {
  switch (event.type) {
    case "response.output_text.delta":
      return event.delta.length === 0 ? null : { kind: "text", delta: event.delta };
    case "response.reasoning_text.delta":
      return event.delta.length === 0 ? null : { kind: "reasoning", delta: event.delta };
    case "response.completed":
      return {
        kind: "completed",
        responseId: event.response.id,
        usage: toUsage(event.response.usage),
      };
    default:
      return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Normaliza el uso de tokens sin depender de los tipos exactos del SDK. */
function toUsage(raw: unknown): TokenUsage {
  const usage = asRecord(raw);
  const outputDetails = asRecord(usage?.["output_tokens_details"]);

  return {
    inputTokens: asCount(usage?.["input_tokens"]),
    outputTokens: asCount(usage?.["output_tokens"]),
    reasoningTokens: asCount(outputDetails?.["reasoning_tokens"]),
    totalTokens: asCount(usage?.["total_tokens"]),
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === "AbortError" || error.name === "APIUserAbortError");
}

/**
 * Detecta fallos de credencial, incluso cuando el SDK de OpenAI los envuelve
 * en un `OpenAIError` conservando el error original en `cause`.
 */
function isCredentialError(error: unknown, seen: Set<unknown> = new Set()): boolean {
  if (seen.has(error)) {
    return false;
  }

  seen.add(error);

  if (error instanceof AggregateError) {
    return error.errors.some((inner) => isCredentialError(inner, seen));
  }

  if (!(error instanceof Error)) {
    return false;
  }

  if (
    error.name === "CredentialUnavailableError"
    || error.name === "AuthenticationError"
    || error.name === "AuthenticationRequiredError"
  ) {
    return true;
  }

  return isCredentialError(error.cause, seen);
}

/** Convierte cualquier fallo del proveedor en un error accionable (AC-3, AC-4, AC-5). */
export function toAppError(error: unknown, endpoint: string, deployment: string): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof APIError) {
    const { status } = error;

    if (status === 401) {
      return new AuthError(
        "No hay una sesión válida de Azure. Ejecuta: az login",
        { cause: error },
      );
    }

    if (status === 403) {
      return new AuthError(
        "La identidad no tiene el rol 'Cognitive Services OpenAI User' sobre el recurso.",
        { cause: error },
      );
    }

    if (status === 404) {
      return new NotFoundError(
        `No existe el deployment "${deployment}" en "${endpoint}". Revisa AZURE_OPENAI_DEPLOYMENT.`,
        { cause: error },
      );
    }

    if (status === 429) {
      return new RateLimitError(
        "Se alcanzó el límite de tasa del modelo. Espera unos segundos y reintenta.",
        { cause: error },
      );
    }

    return new ProviderError(
      `El proveedor falló (HTTP ${status ?? "sin estado"}): ${error.message}`,
      { cause: error },
    );
  }

  if (isCredentialError(error)) {
    return new AuthError(
      "No se pudo obtener una credencial de Azure. Ejecuta: az login",
      { cause: error },
    );
  }

  const message = error instanceof Error ? error.message : String(error);

  return new ProviderError(`Error al llamar al modelo: ${message}`, { cause: error });
}