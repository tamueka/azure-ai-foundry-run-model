# Contrato — Puerto `LlmPort`

Normativo. Define la semántica que **toda** implementación del puerto debe
respetar. Es la base del principio de sustitución de Liskov: si el adaptador de
Azure cumple esto, cualquier otro (OpenAI directo, Ollama, fake) es
intercambiable sin tocar el caso de uso.

---

## 1. Tipos del dominio

```ts
export type ReasoningEffort = "low" | "medium" | "high";

export interface CompletionRequest {
  readonly prompt: string;              // ya validado por Prompt
  readonly effort?: ReasoningEffort;    // por defecto "medium"
  readonly store?: boolean;             // por defecto false
  readonly verbose?: boolean;           // habilita la emisión de chunks "raw"
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
}

export type CompletionChunk =
  | { readonly kind: "text"; readonly delta: string }
  | { readonly kind: "reasoning"; readonly delta: string }
  | { readonly kind: "completed"; readonly responseId: string; readonly usage: TokenUsage }
  | { readonly kind: "raw"; readonly event: unknown };

export interface Completion {
  readonly responseId: string;
  readonly text: string;
  readonly usage: TokenUsage;
}
```

```ts
export interface LlmPort {
  stream(
    request: CompletionRequest,
    options?: { readonly signal?: AbortSignal },
  ): AsyncIterable<CompletionChunk>;
}
```

## 2. Invariantes

Una implementación es válida si y solo si cumple **todas**:

| # | Invariante |
|---|---|
| I1 | Devuelve un `AsyncIterable` **perezoso**: no inicia la petición hasta el primer `next()` |
| I2 | Emite cero o más chunks `text` y `reasoning`, en el orden en que los produce el proveedor |
| I3 | Emite **exactamente un** chunk `completed` como último elemento |
| I4 | Emite `raw` **solo** si el consumidor lo solicitó explícitamente (modo verbose); nunca en modo silencioso |
| I5 | Un `text`/`reasoning` con `delta` vacío no se emite |
| I6 | Nunca lanza errores genéricos: solo subclases de `AppError` (`AuthError`, `NotFoundError`, `RateLimitError`, `ProviderError`) |
| I7 | Si se aborta la señal, el iterador termina lanzando `AbortError` en menos de 1 s y libera la conexión |
| I8 | El adaptador **no** escribe en consola ni en `stdout`; solo produce chunks |
| I9 | El constructor no hace I/O ni valida credenciales (fallo perezoso al consumir) |
| I10 | El `text` acumulado de todos los `text.delta` es igual al texto de la respuesta final |

## 3. Mapeo de errores del proveedor

| Situación del proveedor | Error del dominio | `exitCode` |
|---|---|---|
| 401 Unauthorized | `AuthError` | 3 |
| 403 Forbidden | `AuthError` | 3 |
| 404 Not Found (deployment/modelo) | `NotFoundError` | 4 |
| 429 Too Many Requests | `RateLimitError` | 5 |
| 5xx / fallo de red | `ProviderError` | 1 |
| Credencial no disponible | `AuthError` | 3 |
| `AbortSignal` abortada | `AbortError` (nativo) → CLI asigna 130 | 130 |

Los mensajes deben ser **accionables**:

- 401 → "No hay sesión válida de Azure. Ejecuta: az login"
- 403 → "La identidad no tiene el rol 'Cognitive Services OpenAI User' sobre el recurso"
- 404 → "No existe el deployment '<nombre>' en '<endpoint>'"

## 4. Implementaciones previstas

| Implementación | Uso | Red |
|---|---|---|
| `AzureOpenAiAdapter` | Producción | Sí |
| `FakeLlmPort` | Tests | No |
| *(futuro)* `OpenAiDirectAdapter` | Sin Azure | Sí |

## 5. Ejemplo de uso correcto

```ts
const chunks: CompletionChunk[] = [];
for await (const chunk of llm.stream({ prompt: "hola" }, { signal })) {
  if (chunk.kind === "text") process.stdout.write(chunk.delta);
  if (chunk.kind === "completed") last = chunk;
}
// `last` es obligatorio: I3 garantiza que existe si no hubo error.
```

## 6. Antipatrones prohibidos

- Devolver el objeto `Response` del SDK desde el puerto (filtra tipos de infraestructura).
- Emitir `completed` antes de terminar los deltas.
- Capturar el error y devolver un iterable vacío (rompe I6 y oculta fallos).
- Hacer `console.log` dentro del adaptador (rompe I8 y AC-10).
- Resolver credenciales en el constructor (rompe I9 y dificulta los tests).