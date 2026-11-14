# Contrato — `ChatSession` y extensión de `LlmPort`

Normativo. Define la semántica del estado conversacional y la ampliación
compatible del puerto LLM de la spec 001.

---

## 1. Extensión de `CompletionRequest`

```ts
export interface CompletionRequest {
  readonly prompt: string;
  readonly effort?: ReasoningEffort;       // por defecto "medium"
  readonly verbose?: boolean;              // habilita chunks "raw"
  readonly store?: boolean;                // por defecto false
  readonly previousResponseId?: string;    // NUEVO: hilo anterior
}
```

- `previousResponseId` ausente significa **primer turno**.
- El adaptador lo traduce a `previous_response_id` y **no** envía la clave si el
  campo está ausente.
- Un adaptador que no soporte hilos debe ignorar el campo, no fallar.

## 2. Interfaz de `ChatSession`

```ts
export interface ChatTurnInput {
  readonly prompt: string;
  readonly effort?: ReasoningEffort;
  readonly verbose?: boolean;
}

export interface ChatTurnOptions {
  readonly signal?: AbortSignal;
}

export class ChatSession {
  constructor(llm: LlmPort);
  get previousResponseId(): string | null;
  get hasThread(): boolean;
  reset(): void;
  send(
    input: ChatTurnInput,
    sink: EventSink,
    options?: ChatTurnOptions,
  ): Promise<Completion>;
}
```

## 3. Invariantes

| # | Invariante |
|---|---|
| C1 | El primer `send()` no incluye `previousResponseId` |
| C2 | Un `send()` correcto fija el hilo al `responseId` del `Completion` |
| C3 | El siguiente `send()` envía ese `responseId` como `previousResponseId` |
| C4 | Un error o una cancelación **no** modifican el hilo anterior |
| C5 | `reset()` deja el hilo en `null`; el siguiente turno es como el primero |
| C6 | Todo turno envía `store: true`, porque el proveedor debe conservar la respuesta para encadenarla |
| C7 | `effort` y `verbose` se propagan sin cambios al caso de uso |
| C8 | El prompt se valida antes de cualquier I/O; un prompt inválido no llama al puerto |
| C9 | `ChatSession` no conoce SDKs, consola, `readline` ni canales de salida |
| C10 | El `EventSink` se recibe por turno; la sesión no lo guarda ni lo reutiliza |

## 4. Secuencia

```
ChatSession.send("segundo", sink2)
  │
  ├─ previousResponseId = "resp_1"
  ├─ RunModelUseCase.execute({ prompt, store: true, previousResponseId: "resp_1" })
  │     └─ LlmPort.stream({ prompt, store: true, previousResponseId: "resp_1" })
  │
  ├─ éxito: completion.responseId = "resp_2"
  └─ previousResponseId = "resp_2"
```

## 5. Errores

- `InvalidPromptError` antes de tocar el puerto.
- `AuthError`, `NotFoundError`, `RateLimitError`, `ProviderError` se propagan
  sin envolver.
- `AbortError` se propaga tal cual para que el REPL lo distinga de un fallo.
- `ChatSession` no imprime ni registra: solo devuelve o lanza.

## 6. Pruebas normativas

| Invariante | Caso de prueba |
|---|---|
| C1, C2, C3 | Dos turnos encadenados |
| C4 | Error en el segundo turno; el hilo sigue en el primero |
| C4 | Abort en el segundo turno; el hilo sigue en el primero |
| C5 | `/limpiar` y siguiente turno sin `previousResponseId` |
| C6 | La petición siempre lleva `store: true` |
| C7 | `effort` y `verbose` llegan al puerto |
| C8 | Prompt vacío no genera petición |
| C10 | Cada turno recibe su propio sink |

## 7. Compatibilidad con la spec 001

- El campo nuevo es opcional: los consumidores existentes no cambian.
- `RunModelUseCase` mantiene `store: false` por defecto en disparo único.
- El contrato `specs/001-run-model-cli/contracts/llm-port.md` sigue siendo la
  base; este documento solo añade la semántica del hilo.
