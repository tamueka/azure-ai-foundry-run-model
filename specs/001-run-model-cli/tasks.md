# Tasks — Spec 001 `run-model-cli`

Checklist de implementación. Cada tarea tiene un criterio de verificación
ejecutable. No se marca una tarea como hecha sin su verificación.

Leyenda: `[ ]` pendiente · `[x]` hecho

---

## Fase 0 — Preparación

- [x] **T1. Tooling TypeScript**
  - `tsconfig.json`: `strict`, `module/moduleResolution: NodeNext`, `target: ES2023`,
    `verbatimModuleSyntax`, `noUncheckedIndexedAccess`; `noEmit` para chequeo
  - `tsconfig.build.json`: emite a `dist/` con `rootDir: src`
  - `vitest.config.ts`: entorno `node`, `tests/**/*.test.ts`
  - `package.json`: `devDependencies` (`typescript` 7.0.2, `tsx` 4.23.15,
    `vitest` 5.1.0, `@types/node`) y scripts `dev`, `typecheck`, `test`,
    `test:watch`, `build`, `start`
  - **Verificado**: `tsc --showConfig` resuelve ambas configuraciones,
    `npm run typecheck` → exit 0, `node --import tsx` ejecuta TS correctamente

## Fase 1 — Dominio (sin I/O)

- [x] **T2. Modelo**
  - `src/domain/model/CompletionChunk.ts` (unión discriminada, tipos de `llm-port.md`)
  - `src/domain/model/Completion.ts` + `CompletionAccumulator`
  - `src/domain/model/Prompt.ts` (`Prompt.create`, 1..8000 chars, recorta extremos)
  - `src/domain/errors.ts` (adelantado desde T3: `AppError` + 7 subclases con `exitCode`)
  - **Verificado**: tests de `Prompt` (9) y `CompletionAccumulator` (7) en verde

- [x] **T3. Puertos**
  - `src/domain/ports/LlmPort.ts` (+ `LlmStreamOptions` con `signal`)
  - `src/domain/ports/EventSink.ts` (`text`, `event`, `info`, `error`)
  - Extra: `tests/architecture/layers.test.ts` — hace cumplir la regla de
    dependencia (dominio sin SDKs, sin red, sin `console`)
  - **Verificado**: `npm run typecheck` exit 0

## Fase 2 — Aplicación

- [x] **T4. Caso de uso**
  - `src/application/RunModelUseCase.ts`
  - `execute({ prompt, effort, verbose }, signal): Promise<Completion>`
  - Consume `LlmPort`, reenvía a `EventSink`, acumula con `CompletionAccumulator`
  - **Verificado**: 9 tests (texto único, defaults, raw, razonamiento oculto,
    validación previa al I/O, abort, error tipado, stream incompleto)

- [x] **T5. Fake del puerto**
  - `tests/fakes/FakeLlmPort.ts`: guion de chunks, error final, respeta `signal`
  - `tests/fakes/RecordingEventSink.ts`: sink en memoria
  - **Verificado**: usado por T4 sin red

## Fase 3 — Infraestructura

- [x] **T6. Configuración**
  - `src/infrastructure/config/Config.ts` (`fromEnv`)
  - Obligatorias: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`
  - Opcionales: `AZURE_OPENAI_SCOPE`, `AZURE_OPENAI_TIMEOUT_MS`
  - Vacías = ausentes; errores → `ConfigError` (exit 2)
  - **Verificado**: 10 tests (válido, defaults, recorte, faltantes, URL inválida,
    protocolo, timeout inválido, exit 2)

- [x] **T7. `.env` del proyecto**
  - Añadidas `AZURE_OPENAI_ENDPOINT` y `AZURE_OPENAI_DEPLOYMENT`
  - **Verificado**: `npm run help` y ejecución real funcionan

- [x] **T8. Adaptador Azure**
  - `src/infrastructure/azure/AzureOpenAiAdapter.ts`
  - `DefaultAzureCredential` + `getBearerTokenProvider`
  - Traduce `ResponseStreamEvent` → `CompletionChunk`; `raw` solo si `verbose`
  - Mapea 401/403/404/429/5xx y errores de credencial a errores del dominio
  - **Verificado**: ejecución real; 404 → exit 4 con mensaje accionable

- [x] **T9. Logger**
  - `src/infrastructure/logging/ConsoleLogger.ts` (implementa `EventSink`)
  - Texto → `stdout`; logs, eventos y errores → `stderr`; sin duplicados
  - **Verificado**: `--verbose` emitió 11 eventos, 11 únicos; JSON limpio en `stdout`

## Fase 4 — Entrada y composición

- [x] **T10. Parser de argumentos**
  - `src/infrastructure/cli/args.ts` (`parseArgs`)
  - Flags: `-v/--verbose`, `--json`, `--effort`, `-h/--help`; prompt posicional
  - **Verificado**: 10 tests (incluidos `UsageError` y exit 2)

- [x] **T11. Composition root**
  - `src/infrastructure/cli/main.ts`: único `new` de infraestructura
  - `SIGINT` → `AbortController.abort()`; salida `130`
  - `catch` único que traduce `AppError` a código de salida
  - **Verificado**: ejecución real exit 0; flag inválido exit 2

- [x] **T12. Eliminar el script antiguo**
  - `run_model.js` borrado
  - **Verificado**: no quedan `.js` en la raíz del proyecto

## Fase 5 — Validación

- [x] **T13. Verificación de aceptación**
  - AC-1 ✅ token de control `RESPUESTA_UNICA_123` una sola vez, sin bloques `EVENT`, exit 0
  - AC-2 ✅ sin endpoint → mensaje + exit 2
  - AC-3 ✅ deployment inválido → mensaje + exit 4
  - AC-4 ✅ credencial inválida simulada (`AZURE_TOKEN_CREDENTIALS=EnvironmentCredential`) → exit 3
  - AC-5 ✅ ruta 401 con scope incorrecto → exit 3; mensaje específico de 403 pendiente de prueba con identidad sin rol
  - AC-6 ✅ `--verbose`: 11 eventos, 11 únicos; sin el flag, 0 eventos crudos
  - AC-7 ⚠️ manual (`Ctrl+C`); el abort está cubierto por test
  - AC-8 ✅ JSON con `responseId`, `text`, `usage`, exit 0
  - AC-9 ✅ `typecheck` exit 0 + 52 tests offline
  - AC-10 ✅ `stdout` solo JSON y `stderr` vacío sin verbose

- [x] **T14. Calidad offline**
  - `npm run typecheck` → exit 0
  - `npm test` → 52 tests, 8 archivos, sin red ni credenciales

## Fase 6 — Documentación y paridad Python

- [x] **T15. `INSTRUCTIONS.md` en español**
  - Runbook completo: requisitos, puesta en marcha, comandos, env, exit codes,
    problemas comunes, tests, paridad Python, estructura
  - Incluye el aviso de npm 12 y el lanzador `run.ps1`

- [x] **T16. `requirements.txt` + `run_model.py`**
  - `openai` 2.54.0, `azure-identity`, `python-dotenv`
  - `run_model.py`: smoke test de paridad, mismos códigos de salida
  - **Verificado**: `python run_model.py "responde solo: ok"` → `ok`, exit 0

## Fase 7 — Coherencia de copy y paridad

- [x] **T17. Prompt canónico en español y tests desacoplados**
  - Prompt por defecto único: `¿Qué es Microsoft Foundry?` en `args.ts`,
    `run_model.py`, `run.ps1`, `spec.md`, `contracts/cli.md` e `INSTRUCTIONS.md`
  - `Prompt.test.ts` ya no usa un número mágico: mide `"hola mundo".length`
  - `args.test.ts` usa una cadena local en el caso posicional
  - Fixtures de `RunModelUseCase.test.ts` y `CompletionAccumulator.test.ts`
    coherentes con la pregunta y la respuesta (sin mezclar álgebra)
  - Test de paridad `tests/parity/defaultPrompt.test.ts`: compara el
    `DEFAULT_PROMPT` de TypeScript con el de `run_model.py`
  - **Verificado**: `npm run typecheck` exit 0; `npm test` → 52/52;
    `npm run dev` y `./run.ps1 --json` reales → exit 0 y respuesta en español;
    `python run_model.py` → exit 0
  - AC-2 (sin endpoint) → exit 2; AC-3 (deployment inválido) → exit 4

- [x] **T18. README y documentación transversal**
  - `README.md`: visión general, características, inicio rápido, uso, JSON,
    variables, códigos de salida, arquitectura, estructura, tests, Python y seguridad
  - `.env.example`: plantilla sin secretos; `.env` pasa a estar ignorado por Git
  - `.gitignore`: dependencias, `dist`, entornos Python, `.env`, artefactos,
    sistema operativo y editores
  - `INSTRUCTIONS.md`: resumen rápido con los pasos y lo más reseñable, más el runbook detallado
  - `specs/README.md`, `plan.md` y `spec.md` alineados
  - **Verificado**: enlaces relativos correctos y `npm test` → 52/52

- [x] **T19. Auditoría de cierre de la 001**
  - AC-1..AC-10 revisados contra ejecución real y tests
  - Corregido AC-4: el SDK de OpenAI envuelve `AuthenticationError` en
    `OpenAIError`; `isCredentialError` ahora recorre `cause` y `AggregateError`
  - Nuevo test `tests/infrastructure/AzureOpenAiAdapter.test.ts` (2 casos)
  - **Verificado**: `npm run typecheck` 0; `npm test` 52/52; `npm run build` 0

---

## Fase 7 — Publicación

- [x] **T20. Repositorio y primera release**
  - `main` con el proyecto completo (41 archivos; `.env` fuera del índice)
  - Repositorio público: <https://github.com/tamueka/azure-ai-foundry-run-model>
  - Tag y release `v0.1.0`
  - **Verificado**: `git status` limpio y `.env.example` es el único `.env*`
    versionado

---

## Incidencias encontradas durante la implementación

| # | Hallazgo | Resolución |
|---|---|---|
| 1 | `AppError` con constructor `protected` impedía instanciar subclases sin constructor propio (TS2674) | Constructor `public` en la clase abstracta |
| 2 | `npm 12` rechaza flags desconocidos incluso tras `--` (`EUNKNOWNCONFIG`) | Scripts `dev:json`/`dev:verbose`/`help` + lanzador `run.ps1` |
| 3 | `.\run.ps1` dentro de un template literal de TS se interpretaba como `\r` | Rutas con barra normal (`./run.ps1`) |
| 4 | `esbuild` con `postinstall` bloqueado por npm | Verificado que no afecta; documentado cómo aprobarlo |
| 5 | Reemplazo global del prompt dejó un test con longitud obsoleta y fixtures que mezclaban historia y álgebra | Prompt canónico en español + tests desacoplados del copy + test de paridad TS/Python |
| 6 | `run_model.py` fallaba con `UnicodeEncodeError` (U+2011) al redirigir la salida con code page `cp1252` | `configure_output()` fuerza UTF-8 en `stdout`/`stderr` |
| 7 | `.env` contenía identificadores de Azure y estaba a punto de versionarse | `.env` ignorado + `.env.example` como plantilla sin secretos |
| 8 | AC-4 salía con exit 1: `OpenAIError` envolvía `AuthenticationError` y `isCredentialError` no miraba `cause` | `isCredentialError` recursivo + test de regresión |

---

## Registro de cierre (2026-11-14)

| AC | Resultado | Evidencia |
|---|---|---|
| AC-1 | ✅ | Token de control impreso **1 vez**; 0 bloques `EVENT`; exit 0 |
| AC-2 | ✅ | Sin endpoint → mensaje accionable + exit 2 |
| AC-3 | ✅ | Deployment inexistente → mensaje + exit 4 |
| AC-4 | ✅ | Credencial inválida simulada → exit 3 y mensaje `az login` |
| AC-5 | ✅/⚠️ | 401 con scope incorrecto → exit 3; mensaje específico de 403 pendiente de identidad sin rol |
| AC-6 | ✅ | 11 eventos, 11 únicos; 0 eventos crudos sin `--verbose` |
| AC-7 | ⚠️ | Abort cubierto por test; `Ctrl+C` manual pendiente |
| AC-8 | ✅ | JSON válido con `responseId`, `text`, `usage`; exit 0 |
| AC-9 | ✅ | `typecheck` 0 + 52 tests offline |
| AC-10 | ✅ | `stdout` solo JSON; `stderr` vacío sin verbose |

**Conclusión:** spec 001 cerrada como **Implementada v1.1**. Los dos puntos
manuales (mensaje específico de 403 y `Ctrl+C`) no bloquean el cierre: el
primero requiere una identidad sin rol y el segundo está cubierto por el test
de abort del caso de uso.

## Definición de "hecho" (DoD)

1. Código compila con `strict` y sin `any` implícito.
2. Test nuevo o actualizado; `npm test` verde sin red.
3. AC correspondiente verificado; si requiere una identidad o interacción no
   disponibles, se registra como manual aceptado.
4. `spec.md` y `plan.md` actualizados si cambió el comportamiento.
5. Sin secretos en el repositorio (solo variables de entorno).