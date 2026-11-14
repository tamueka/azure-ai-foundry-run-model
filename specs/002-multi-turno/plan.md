# Plan técnico — Spec 002 `multi-turno`

Documento derivado de [`spec.md`](spec.md). Describe **cómo** se implementa el
REPL multi-turno, no qué se requiere. Ningún código se escribe antes de aprobar
este plan y [`tasks.md`](tasks.md).

---

## 1. Estilo arquitectónico

Se mantiene la **hexagonal lite** de la spec 001 y su regla de dependencia:

```
        ┌──────────────────────────────────────────────┐
        │              infrastructure                  │
        │  config · azure · logging · cli              │
        │  ChatIo · ChatRepl · composition root        │
        └──────────────────┬───────────────────────────┘
                           │ implementa / invoca
        ┌──────────────────▼───────────────────────────┐
        │              application                     │
        │  RunModelUseCase · ChatSession               │
        └──────────────────┬───────────────────────────┘
                           │ depende solo de puertos
        ┌──────────────────▼───────────────────────────┐
        │              domain                          │
        │  Prompt · Completion · Chunks · Ports        │
        └──────────────────────────────────────────────┘
```

- `ChatSession` es lógica de aplicación: conserva el hilo y decide qué
  `previousResponseId` enviar. No conoce `readline`, la consola ni el SDK.
- `ChatRepl` es infraestructura de entrada: lee líneas, interpreta comandos,
  gestiona `Ctrl+C` y decide qué escribir en cada canal.
- `AzureOpenAiAdapter` sigue siendo el único punto que habla con el SDK.

---

## 2. Componentes y responsabilidades

| Componente | Capa | Responsabilidad |
|---|---|---|
| `CompletionRequest` | Dominio | Nuevo campo opcional `previousResponseId` |
| `RunModelUseCase` | Aplicación | Propagar el hilo a la petición y mantener el disparo único intacto |
| `ChatSession` | Aplicación | Guardar el `responseId` del último turno, reiniciar el hilo y enviar cada turno con `store: true` |
| `AzureOpenAiAdapter` | Infraestructura | Traducir `previousResponseId` a `previous_response_id` y construir la petición |
| `ConsoleLogger` | Infraestructura | Etiquetar eventos, mensajes y errores con `[turno N]` |
| `chatCommands` | Infraestructura | Parsear `/salir`, `/limpiar`, `/ayuda` y el texto libre |
| `ChatIo` | Infraestructura | Abstraer la lectura de líneas y los canales de salida |
| `ChatRepl` | Infraestructura | Bucle del REPL, turnos, errores, NDJSON y cancelación |
| `main.ts` | Infraestructura | Composition root: elige entre disparo único y REPL |

---

## 3. Flujo de un turno

```
usuario escribe una línea
        │
        ├─ /ayuda ──────► ayuda a stderr, sin petición
        ├─ /limpiar ────► ChatSession.reset(), sin petición
        ├─ /salir ──────► cierre ordenado, exit 0
        └─ texto ───────► ChatRepl crea AbortController y sink del turno
                              │
                              ▼
                        ChatSession.send()
                              │
                              ├─ RunModelUseCase.execute()
                              │     ├─ Prompt.create()  (valida antes de I/O)
                              │     └─ LlmPort.stream({ previousResponseId, store: true })
                              │
                              ├─ éxito: guarda completion.responseId
                              └─ error: no modifica el hilo
                              │
                              ▼
                 texto en stdout (humano) o una línea NDJSON
```

Invariantes:

1. El hilo solo avanza cuando el turno termina correctamente.
2. Un error o una cancelación **no** borran el hilo anterior.
3. `/limpiar` es la única operación que olvida el contexto.
4. Cada turno tiene su propio `AbortController`; no se reutiliza entre turnos.

---

## 4. Decisiones técnicas

### 4.1 `previous_response_id` en lugar de historial local

Se envía solo el turno nuevo y el identificador de la respuesta anterior. El
servidor recupera el contexto. Menos tokens, menos código y menos riesgo de
reenviar mensajes alterados.

Consecuencia: el adaptador debe enviar `store: true` en modo chat. El disparo
único conserva `store: false` por defecto.

### 4.2 `ChatSession` en la capa de aplicación

El estado del hilo es una regla de negocio, no un detalle del REPL. Ponerlo en
`ChatSession` permite testear continuidad, reinicio y errores sin `readline` ni
consola.

`ChatSession.send()` recibe el `EventSink` del turno, porque cada turno necesita
su propio logger etiquetado. Internamente crea un `RunModelUseCase` efímero; el
caso de uso sigue siendo la única puerta al puerto.

### 4.3 REPL con `node:readline` y prompts en `stderr`

Se usa `readline` para tener edición de línea y `Ctrl+D` en terminal. El prompt
`tú> ` se escribe en `stderr` para que `--json` mantenga `stdout` limpio.

`ChatIo` abstrae la lectura y la escritura:

- producción: `ConsoleChatIo` sobre `readline`;
- tests: `MemoryChatIo` con líneas guionizadas.

### 4.4 Cancelación por turno

`ChatRepl` mantiene el `AbortController` del turno activo:

- `Ctrl+C` con un turno en curso → `abort()`, mensaje y vuelta al prompt;
- `Ctrl+C` en el prompt → cierre del REPL y exit `130`;
- `Ctrl+D` → fin de entrada y exit `0`.

`ConsoleChatIo` escucha `SIGINT` tanto en la interfaz de `readline` como en el
proceso, y retira los listeners al cerrar.

### 4.5 NDJSON

Con `--json`, cada turno produce **exactamente una** línea en `stdout`:

```json
{"turn":1,"responseId":"resp_...","text":"...","usage":{"inputTokens":1,"outputTokens":2,"reasoningTokens":0,"totalTokens":3}}
{"turn":2,"error":{"code":5,"message":"Se alcanzó el límite de tasa..."}}
```

Los prompts, la ayuda, el banner y los diagnósticos van a `stderr`. El error de
un turno no cambia el código de salida final: la sesión termina con `0` si se
sale con `/salir` o `Ctrl+D`.

### 4.6 Etiquetado por turno

`ConsoleLogger` acepta `turn?: number`. Cuando existe, prefija eventos, mensajes
y errores con `[turno N]`. Así los eventos de `--verbose` quedan asociados a su
turno sin cambiar el contrato de `EventSink`.

---

## 5. Alternativas descartadas

| Alternativa | Motivo para descartarla |
|---|---|
| Historial local reenviado en cada turno | Más tokens y más código; el proveedor ya ofrece `previous_response_id` |
| Estado del hilo dentro de `ChatRepl` | Mezcla infraestructura con lógica de conversación y dificulta los tests |
| Un proceso nuevo por turno | Rompe la experiencia de conversación y obliga a persistir el estado |
| `readline/promises` con `question()` | Dificulta distinguir `Ctrl+C` durante un turno y en el prompt |
| Guardar la conversación en disco | Fuera de alcance de la spec 002 |
| Un `EventSink` global sin turno | Impide asociar eventos y errores al turno correcto |

---

## 6. Contratos

Se añaden dos contratos normativos en `contracts/`:

| Contrato | Contenido |
|---|---|
| [`chat-cli.md`](contracts/chat-cli.md) | Invocación, comandos, canales, NDJSON, códigos de salida y `Ctrl+C` |
| [`chat-session.md`](contracts/chat-session.md) | Semántica de `ChatSession` y extensión de `CompletionRequest` |

El contrato `specs/001-run-model-cli/contracts/llm-port.md` sigue vigente. La 002
lo amplía de forma compatible: `previousResponseId` es opcional y su ausencia
mantiene el comportamiento de la 001.

---

## 7. Estrategia de pruebas

| Nivel | Qué cubre | Archivo |
|---|---|---|
| Dominio | Sin cambios de comportamiento; `Prompt` sigue validando | `Prompt.test.ts` |
| Aplicación | Hilo, primer turno, reinicio, error que no avanza el hilo, abort | `ChatSession.test.ts` |
| Aplicación | Propagación de `previousResponseId` | `RunModelUseCase.test.ts` |
| Infraestructura | Comandos del REPL | `chatCommands.test.ts` |
| Infraestructura | Bucle, ayuda, errores aislados, NDJSON, `/limpiar`, `Ctrl+C` en prompt | `ChatRepl.test.ts` |
| Infraestructura | Prefijo `[turno N]`, verbose y canales | `ConsoleLogger.test.ts` |
| Infraestructura | Payload con y sin `previous_response_id` | `AzureOpenAiAdapter.test.ts` |
| Infraestructura | `--chat`, prompt posicional rechazado, flags | `args.test.ts` |
| Arquitectura | El dominio sigue sin SDKs, red ni consola | `layers.test.ts` |
| Manual | Dos turnos reales, NDJSON, `/limpiar`, `Ctrl+C` | `INSTRUCTIONS.md` §9 |

Todos los tests automáticos usan `FakeLlmPort` y `MemoryChatIo`: sin red, sin
credenciales y sin tokens.

---

## 8. Archivos previstos

| Archivo | Cambio |
|---|---|
| `src/domain/model/CompletionChunk.ts` | `previousResponseId?` en `CompletionRequest` |
| `src/application/RunModelUseCase.ts` | Propaga el campo al puerto |
| `src/application/ChatSession.ts` | **Nuevo**: estado del hilo |
| `src/infrastructure/azure/AzureOpenAiAdapter.ts` | Payload testeable y `previous_response_id` |
| `src/infrastructure/logging/ConsoleLogger.ts` | Prefijo de turno |
| `src/infrastructure/cli/args.ts` | `--chat`, ayuda y validación |
| `src/infrastructure/cli/chatCommands.ts` | **Nuevo**: comandos y ayuda |
| `src/infrastructure/cli/ChatIo.ts` | **Nuevo**: puerto de entrada/salida del REPL |
| `src/infrastructure/cli/ChatRepl.ts` | **Nuevo**: bucle del REPL |
| `src/infrastructure/cli/main.ts` | Elige REPL o disparo único |
| `tests/fakes/FakeLlmPort.ts` | Secuencias de scripts por llamada |
| `tests/fakes/MemoryChatIo.ts` | **Nuevo**: IO en memoria |
| `tests/application/ChatSession.test.ts` | **Nuevo** |
| `tests/infrastructure/ChatRepl.test.ts` | **Nuevo** |
| `tests/infrastructure/chatCommands.test.ts` | **Nuevo** |
| `tests/infrastructure/ConsoleLogger.test.ts` | **Nuevo** |
| `tests/infrastructure/AzureOpenAiAdapter.test.ts` | Payload de la petición |
| `tests/infrastructure/args.test.ts` | Casos de `--chat` |
| `tests/application/RunModelUseCase.test.ts` | Propagación del hilo |
| `package.json`, `package-lock.json` | Scripts `chat` y versión 0.2.0 |
| `README.md`, `INSTRUCTIONS.md`, `specs/README.md` | Documentación y estado |

---

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El proveedor caduca o invalida el `previous_response_id` | Un turno falla con 400/404 | El error se muestra sin cerrar la sesión; `/limpiar` reinicia el hilo |
| `store: true` no está permitido en el recurso | El modo chat no arranca a la primera | Se valida con una ejecución real; el mensaje del proveedor queda visible |
| `Ctrl+C` compite con `readline` | Sesión colgada o cierre inesperado | Un `AbortController` por turno y cierre explícito de la interfaz |
| El hilo crece y encarece los turnos | Coste creciente | `/limpiar` manual y documentación del coste |
| `--json` contamina `stdout` con prompts | Rompe scripts | Prompts, banner y ayuda siempre a `stderr`; test de canales |
| Entrada por tubería sin TTY | `readline` no cierra al agotar líneas | Prueba real con entrada redirigida y `Ctrl+D`/EOF |

---

## 10. Entrega y release

1. Implementar y verificar `typecheck`, tests y `build`.
2. Ejecución real de dos turnos, NDJSON y `--verbose`.
3. Actualizar documentación y registrar el cierre en `tasks.md`.
4. Subir a `main` y crear la release **v0.2.0**.

La release incluye el binario TypeScript (no se publica en npm) y las notas con
los comandos nuevos.

---

## 11. Definición de "hecho"

1. AC-1..AC-11 verificados o registrados como manuales aceptados.
2. `npm run typecheck` y `npm test` en verde, sin red.
3. `npm run build` compila a `dist/`.
4. Ejecución real de dos turnos y de NDJSON documentada.
5. `README.md`, `INSTRUCTIONS.md` y `specs/README.md` alineados con la 002.
6. Sin secretos en el repositorio.
