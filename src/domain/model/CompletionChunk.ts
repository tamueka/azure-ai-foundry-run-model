/**
 * Tipos del dominio para el streaming de una completion.
 *
 * Refleja `specs/001-run-model-cli/contracts/llm-port.md`. Ningún tipo del SDK
 * de OpenAI debe aparecer aquí: el adaptador es quien traduce.
 */

/** Nivel de esfuerzo de razonamiento admitido por el proveedor. */
export type ReasoningEffort = "low" | "medium" | "high";

/** Petición ya normalizada por el dominio. */
export interface CompletionRequest {
  /** Prompt validado por `Prompt.create`. */
  readonly prompt: string;
  /** Esfuerzo de razonamiento; el adaptador aplica "medium" si se omite. */
  readonly effort?: ReasoningEffort;
  /** Si es `true`, el adaptador puede emitir chunks `raw` con eventos del protocolo. */
  readonly verbose?: boolean;
  /** Si es `true`, el proveedor persiste la respuesta. Por defecto `false`. */
  readonly store?: boolean;
}

/** Consumo de tokens de una respuesta. */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
}

/**
 * Unidad de información que atraviesa el puerto.
 *
 * Invariantes (ver contrato I1–I5):
 * - `text` / `reasoning` llegan en orden y nunca con `delta` vacío.
 * - `completed` aparece exactamente una vez y siempre al final.
 * - `raw` solo se emite si la petición pidió `verbose`.
 */
export type CompletionChunk =
  | { readonly kind: "text"; readonly delta: string }
  | { readonly kind: "reasoning"; readonly delta: string }
  | { readonly kind: "completed"; readonly responseId: string; readonly usage: TokenUsage }
  | { readonly kind: "raw"; readonly event: unknown };