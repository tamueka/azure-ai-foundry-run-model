# Tasks — Spec 002 `multi-turno`

Checklist de implementación. Cada tarea tiene un criterio de verificación
ejecutable. No se marca una tarea como hecha sin su verificación.

Leyenda: `[ ]` pendiente · `[x]` hecho

---

## Fase 0 — Diseño

- [x] **T1. Plan y contratos**
  - `plan.md` con arquitectura, decisiones, alternativas, riesgos y pruebas
  - `contracts/chat-cli.md`: invocación, comandos, canales, NDJSON y `Ctrl+C`
  - `contracts/chat-session.md`: extensión de `CompletionRequest` e invariantes
  - **Verificado**: enlaces relativos correctos y revisión cruzada con `spec.md`

## Fase 1 — Dominio y aplicación

- [x] **T2. Extensión de `CompletionRequest`**
  - `src/domain/model/CompletionChunk.ts`: `previousResponseId?: string`
  - Sin dependencias nuevas ni cambios en los chunks
  - **Verificado**: `npm run typecheck` exit 0

- [x] **T3. Propagación en el caso de uso**
  - `src/application/RunModelUseCase.ts` acepta `previousResponseId` y lo pasa al puerto
  - El disparo único conserva `store: false`
  - **Verificado**: `RunModelUseCase.test.ts` cubre el campo presente; los tests
    existentes confirman que su ausencia mantiene el comportamiento de la 001

- [x] **T4. `ChatSession`**
  - `src/application/ChatSession.ts` con `previousResponseId`, `hasThread`, `reset` y `send`
  - `store: true` en todos los turnos
  - El hilo solo avanza tras un éxito
  - **Verificado**: 8 tests de primer turno, continuidad, reinicio, error, abort,
    prompt inválido, propagación y sink por turno

## Fase 2 — Infraestructura

- [x] **T5. Payload del adaptador de Azure**
  - `AzureOpenAiAdapter.ts`: `buildRequestPayload()` exportado y uso de `previous_response_id`
  - La clave se omite cuando no hay hilo
  - **Verificado**: 3 tests unitarios de `buildRequestPayload`; ejecución real de
    dos turnos encadenados

- [x] **T6. Logger por turno**
  - `ConsoleLogger` acepta `turn?: number`
  - Eventos, mensajes y errores se prefijan con `[turno N]`
  - **Verificado**: 4 tests de formato y canales; ejecución real con `--verbose`

- [x] **T7. Comandos del REPL**
  - `src/infrastructure/cli/chatCommands.ts`: `/salir`, `/limpiar`, `/ayuda`, texto libre
  - Ayuda en español
  - **Verificado**: 7 tests de cada comando, recorte, texto libre y caja

- [x] **T8. Entrada/salida del REPL**
  - `src/infrastructure/cli/ChatIo.ts`: interfaz `ChatIo` y `ConsoleChatIo` sobre `readline`
  - Prompts y banner a `stderr`; datos a `stdout`
  - `SIGINT` y cierre ordenado
  - **Verificado**: `npm run typecheck`; 2 tests de `ConsoleChatIo` con streams en
    memoria; ejecución manual en terminal

- [x] **T9. Bucle del REPL y composition root**
  - `ChatRepl` con turnos, comandos, errores aislados, NDJSON y `Ctrl+C`
  - `main.ts` elige entre disparo único y `--chat`
  - `args.ts`: `--chat`, ayuda y rechazo de prompt posicional
  - `package.json`: scripts `chat`, `chat:json`, `chat:verbose`
  - **Verificado**: 8 tests de `ChatRepl` y 3 de `args`; ejecuciones manuales de
    chat, NDJSON, verbose, `/limpiar`, `/ayuda`, error y rechazo posicional

## Fase 3 — Pruebas

- [x] **T10. Tests de aplicación**
  - `ChatSession.test.ts`: C1–C8 del contrato
  - `RunModelUseCase.test.ts`: propagación del hilo
  - `FakeLlmPort` admite secuencias de scripts
  - **Verificado**: `npm test` — 88/88 en verde

- [x] **T11. Tests de infraestructura**
  - `ChatRepl.test.ts`: ayuda, `/limpiar`, errores aislados, NDJSON, `Ctrl+C` en prompt
  - `chatCommands.test.ts`, `ConsoleLogger.test.ts`, `AzureOpenAiAdapter.test.ts`, `args.test.ts`
  - `MemoryChatIo` como doble de entrada/salida
  - **Verificado**: `npm test` sin red

- [x] **T12. Calidad offline**
  - `npm run typecheck` exit 0
  - `npm test` con todos los tests en verde
  - `npm run build` exit 0
  - **Verificado**: los tres comandos (13 archivos, 88 tests)

## Fase 4 — Validación, documentación y release

- [x] **T13. Verificación de aceptación**
  - AC-1: dos turnos reales encadenados
  - AC-2: primer turno sin `previous_response_id` (test)
  - AC-3: `/limpiar` real y siguiente turno sin hilo
  - AC-4: `/ayuda`, `/salir` y `Ctrl+D`
  - AC-5: entrada vacía, espacios y exceso de longitud
  - AC-6: error de turno y sesión que continúa
  - AC-7: arranque sin configuración
  - AC-8: `Ctrl+C` durante turno y en prompt
  - AC-9: `--effort low` y `--verbose` por turno
  - AC-10: NDJSON parseable y canales separados
  - AC-11: `typecheck` + tests sin red
  - **Verificado**: registro en `tasks.md` con evidencia

- [x] **T14. Documentación**
  - `README.md`: características, comandos, ejemplos, estructura, tests y estado
  - `INSTRUCTIONS.md`: sección de chat, comandos, `Ctrl+C`, NDJSON y problemas
  - `specs/README.md`: 002 como implementada
  - `spec.md`: estado `Implementada` y referencia a la implementación
  - **Verificado**: enlaces relativos y contadores reales (88 tests, 13 archivos)

- [x] **T15. Release v0.2.0**
  - `package.json` y `package-lock.json` en `0.2.0`
  - Commit(s) en `main` y push
  - Tag `v0.2.0` y GitHub Release con notas en español
  - **Verificado**: `gh release view v0.2.0` y `git status` limpio

---

## Registro de cierre

Verificación ejecutada el **2026-11-14** en Windows 11 con Node v26.4.0.

| AC | Resultado | Evidencia |
|---|---|---|
| AC-1 | **Verificado** | Test: `ChatSession.test.ts` y `ChatRepl.test.ts` capturan `previousResponseId = resp_1` en el segundo turno. Real: «Mi color favorito es el azul» → «¿Cuál es mi color favorito?» respondió `azul` |
| AC-2 | **Verificado** | Test de `ChatSession`: la primera petición no incluye `previousResponseId`. Test del adaptador: `buildRequestPayload` omite `previous_response_id` sin hilo |
| AC-3 | **Verificado** | Test de `/limpiar`: el turno siguiente no envía hilo. Real: tras `/limpiar`, la pregunta sin contexto respondió `NO_LO_SE` |
| AC-4 | **Verificado** | Tests de comandos y REPL: `/ayuda` no genera petición. Real: `/ayuda` + EOF salió con `0` y `stdout` con 0 bytes; `/salir` cierra con `0` |
| AC-5 | **Verificado** | Test de `ChatRepl`: línea vacía, solo espacios y 8001 caracteres informan en `stderr`, no llaman al puerto y la sesión sigue |
| AC-6 | **Verificado** | Test: un `RateLimitError` no impide el turno siguiente. Real: deployment inexistente produjo dos líneas NDJSON con `code: 4`, la sesión siguió y salió con `0` |
| AC-7 | **Verificado** | Real sin `AZURE_OPENAI_ENDPOINT`/`AZURE_OPENAI_DEPLOYMENT`: mensaje en `stderr`, sin REPL y exit `2`. Tests de `Config` cubren las variables |
| AC-8 | **Manual aceptado** (parcial automatizado) | Abort por turno cubierto por `ChatSession.test.ts`; `Ctrl+C` en el prompt cubierto por `ChatRepl.test.ts` (exit `130`). La pulsación real en terminal queda como comprobación manual |
| AC-9 | **Verificado** | Real con `--effort low` en todos los turnos. `--verbose`: 10 eventos, 10 únicos, todos con `[turno 1]`; sin `--verbose`: 0 eventos crudos |
| AC-10 | **Verificado** | Real: dos líneas NDJSON válidas con `turn`, `responseId`, `text` y `usage`; `stderr` solo con banner, prompts y estado. Turno fallido: línea con `turn` y `error.code/message` |
| AC-11 | **Verificado** | `npm run typecheck` exit `0`; `npm test` 88/88 en 13 archivos, sin red; `npm run build` exit `0` |

## Definición de "hecho" (DoD)

1. Código compila con `strict` y sin `any` implícito.
2. Test nuevo o actualizado; `npm test` verde sin red.
3. AC correspondiente verificado; si requiere interacción no disponible, se
   registra como manual aceptado.
4. `spec.md`, `plan.md` y contratos coherentes con el comportamiento.
5. Sin secretos en el repositorio (solo variables de entorno).
