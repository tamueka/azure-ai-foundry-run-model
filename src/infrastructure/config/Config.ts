import { ConfigError } from "../../domain/errors.js";

/** Scope OAuth por defecto para Azure AI Foundry. */
export const DEFAULT_SCOPE = "https://ai.azure.com/.default";

/** Timeout por petición, en milisegundos. */
export const DEFAULT_TIMEOUT_MS = 60_000;

export interface ConfigValues {
  readonly endpoint: string;
  readonly deployment: string;
  readonly scope: string;
  readonly timeoutMs: number;
}

/**
 * Configuración validada del proceso.
 *
 * Se construye **antes** de cualquier petición de red: si falta algo, el
 * programa falla con un mensaje claro en lugar de intentar conectarse (AC-2).
 */
export class Config implements ConfigValues {
  readonly endpoint: string;
  readonly deployment: string;
  readonly scope: string;
  readonly timeoutMs: number;

  private constructor(values: ConfigValues) {
    this.endpoint = values.endpoint;
    this.deployment = values.deployment;
    this.scope = values.scope;
    this.timeoutMs = values.timeoutMs;
  }

  /**
   * Construye la configuración a partir del entorno.
   * @throws {ConfigError} si falta una variable obligatoria o es inválida.
   */
  static fromEnv(env: NodeJS.ProcessEnv): Config {
    const endpoint = requireValue(env, "AZURE_OPENAI_ENDPOINT");
    validateEndpoint(endpoint);

    const deployment = requireValue(env, "AZURE_OPENAI_DEPLOYMENT");
    const scope = optionalValue(env, "AZURE_OPENAI_SCOPE") ?? DEFAULT_SCOPE;

    const rawTimeout = optionalValue(env, "AZURE_OPENAI_TIMEOUT_MS");
    const timeoutMs = rawTimeout === undefined
      ? DEFAULT_TIMEOUT_MS
      : parseTimeout(rawTimeout);

    return new Config({ endpoint, deployment, scope, timeoutMs });
  }
}

/** Trata cadena vacía o solo espacios como ausente. */
function optionalValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
}

function requireValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = optionalValue(env, name);

  if (value === undefined) {
    throw new ConfigError(
      `Falta la variable de entorno ${name}. Añádela a tu .env (ver INSTRUCTIONS.md).`,
    );
  }

  return value;
}

function validateEndpoint(endpoint: string): void {
  let parsed: URL;

  try {
    parsed = new URL(endpoint);
  } catch {
    throw new ConfigError(
      `AZURE_OPENAI_ENDPOINT no es una URL válida: "${endpoint}".`,
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ConfigError(
      `AZURE_OPENAI_ENDPOINT debe usar http(s); recibido "${parsed.protocol}".`,
    );
  }
}

function parseTimeout(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new ConfigError(
      `AZURE_OPENAI_TIMEOUT_MS debe ser un entero positivo; recibido "${raw}".`,
    );
  }

  const value = Number.parseInt(raw, 10);

  if (value <= 0) {
    throw new ConfigError(
      `AZURE_OPENAI_TIMEOUT_MS debe ser mayor que 0; recibido "${raw}".`,
    );
  }

  return value;
}