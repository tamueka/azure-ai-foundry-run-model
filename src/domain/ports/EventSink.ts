/**
 * Puerto secundario (driven) de salida.
 *
 * Separa *qué* se comunica de *cómo* se formatea. La implementación de consola
 * decide canales (stdout/stderr) y formato; el dominio nunca llama a `console`.
 */
export interface EventSink {
  /**
   * Fragmento de la respuesta visible.
   * Debe escribirse en `stdout` sin formato ni saltos añadidos.
   */
  text(delta: string): void;

  /**
   * Evento crudo del protocolo (payload opaco).
   * Solo se invoca en modo verbose y debe ir a `stderr`, una vez por evento.
   */
  event(payload: unknown): void;

  /** Mensaje de estado para el operador. Va a `stderr`. */
  info(message: string): void;

  /**
   * Diagnóstico de error accionable. Va a `stderr`.
   * `cause` se usa solo cuando el modo verbose está activo.
   */
  error(message: string, cause?: unknown): void;
}