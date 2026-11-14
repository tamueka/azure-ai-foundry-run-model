/**
 * Errores del dominio.
 *
 * Todos heredan de `AppError`, que transporta el código de salida del proceso.
 * El CLI solo necesita leer `exitCode` y `message`; no conoce detalles del SDK.
 */

export interface AppErrorOptions {
  readonly cause?: unknown;
}

/** Base de todos los errores esperables del programa. */
export abstract class AppError extends Error {
  abstract readonly exitCode: number;

  constructor(message: string, options?: AppErrorOptions) {
    super(message, options as ErrorOptions | undefined);
    this.name = new.target.name;
  }
}

/** Uso incorrecto del CLI: flags, argumentos o prompt inválidos. */
export class UsageError extends AppError {
  readonly exitCode = 2;
}

/** Configuración de entorno ausente o inválida. */
export class ConfigError extends AppError {
  readonly exitCode = 2;
}

/** El prompt no cumple las reglas del dominio. */
export class InvalidPromptError extends UsageError {}

/** Autenticación o autorización: 401 / 403 / credencial no disponible. */
export class AuthError extends AppError {
  readonly exitCode = 3;
}

/** El recurso no existe: deployment o modelo (404). */
export class NotFoundError extends AppError {
  readonly exitCode = 4;
}

/** Límite de tasa del proveedor (429). */
export class RateLimitError extends AppError {
  readonly exitCode = 5;
}

/** Fallo inesperado del proveedor o de la red (5xx, conexión). */
export class ProviderError extends AppError {
  readonly exitCode = 1;
}

/** El stream terminó sin emitir el chunk `completed` (viola I3 del contrato). */
export class IncompleteStreamError extends ProviderError {
  constructor(message = "El stream terminó sin un chunk 'completed'.") {
    super(message);
  }
}