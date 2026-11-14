# Spec 001 — CLI `run-model`

| Campo | Valor |
|---|---|
| ID | 001-run-model-cli |
| Estado | Implementada |
| Versión | 1.1 |
| Fecha | 2026-11-14 |
| Autor | Equipo del proyecto (curso Microsoft AI) |
| Implementación | `src/` (TypeScript) — ver `plan.md` |
| Auditoría | 2026-11-14 — AC-1..AC-10 revisados; cierre en `tasks.md` |

---

## 1. Contexto y problema

El sample generado por Azure AI Foundry (`run_model.js`) cumple su función de
demostración, pero presenta cuatro problemas que impiden usarlo como base de
trabajo durante el curso:

1. **Salida ilegible**: cada evento se imprime dos veces (`.on('event')` y el
   `for await`) y el texto se escribe tres veces.
2. **Configuración hardcodeada**: endpoint y nombre del deployment viven en el
   código; cambiar de recurso exige editar el fuente.
3. **Errores opacos**: un 401/403/404 se muestra como volcado del SDK, sin
   indicar la acción correctiva (`az login`, rol faltante, deployment inexistente).
4. **Sin tests ni cancelación**: no hay forma de verificar el comportamiento sin
   gastar tokens, ni de interrumpir una petición en curso.

## 2. Objetivo

Sustituir el script por un **CLI de un solo comando** que:

- envíe un prompt a un deployment de Azure AI Foundry,
- muestre la respuesta en streaming **una sola vez**,
- exponga los eventos crudos solo bajo demanda (`--verbose`),
- devuelva **códigos de salida estables** y mensajes accionables,
- aísle el dominio de la infraestructura para poder testearse sin red.

## 3. Usuarios y casos de uso

| Actor | Necesidad |
|---|---|
| Estudiante del curso | Probar el modelo desde la terminal con una pregunta propia |
| Docente / demo | Mostrar el protocolo de streaming sin ruido (`--verbose`) |
| Script o CI | Consumir la respuesta como JSON (`--json`) |

---

## 4. Requisitos (MoSCoW)

| ID | Prio. | Requisito | Razón |
|---|---|---|---|
| R1 | Must | Enviar un prompt y mostrar la respuesta en streaming, una sola vez, sin duplicados | Problema 1 |
| R2 | Must | Obtener endpoint y deployment del entorno, validados al arranque (fail-fast) | Problema 2 |
| R3 | Must | Autenticarse con Entra ID sin secretos en código ni en disco | Requisito de seguridad |
| R4 | Must | Salida legible por defecto; eventos SSE crudos solo con `--verbose` | Problema 1 |
| R5 | Must | Cancelar la petición en curso con `Ctrl+C`, sin errores no capturados | Robustez |
| R6 | Should | Emitir un único objeto JSON en `stdout` con `--json` | Uso en scripts |
| R7 | Should | Traducir 401/403/404/429 a mensajes accionables y códigos de salida | Problema 3 |
| R8 | Should | Tests unitarios offline (sin red, sin coste) y `typecheck` estricto | Problema 4 |
| R9 | Could | Seleccionar el esfuerzo de razonamiento con `--effort` (`low\|medium\|high`) | Coste/latencia |

---

## 5. Criterios de aceptación

Formato Given/When/Then. Todos son **verificables** y se cierran con el comando
de la columna de verificación.

### AC-1 — Ejecución básica (R1)

- **Given** un `.env` válido, sesión de Azure iniciada y deployment disponible
- **When** se ejecuta `npm run dev -- "¿Qué es Microsoft Foundry?"`
- **Then** se imprime el texto de la respuesta **una sola vez**, sin bloques
  `EVENT`/`EVENT RUNNER`, y el proceso termina con código `0`
- **Verificación**: ejecución manual + `echo $LASTEXITCODE` (PowerShell)

### AC-2 — Configuración incompleta (R2)

- **Given** un entorno sin `AZURE_OPENAI_ENDPOINT`
- **When** se ejecuta el CLI
- **Then** se escribe un mensaje en `stderr` indicando la variable que falta,
  no se imprime stack trace y el código de salida es `2`
- **Verificación**: `npm test` (test de `Config`) + manual

### AC-3 — Deployment inexistente (R7)

- **Given** un `AZURE_OPENAI_DEPLOYMENT` que no existe en el recurso
- **When** se ejecuta el CLI
- **Then** el mensaje nombra el deployment y el endpoint, y el código de salida
  es `4`
- **Verificación**: manual con valor inválido

### AC-4 — Sin sesión de Azure (R3, R7)

- **Given** ninguna credencial disponible (`az logout`)
- **When** se ejecuta el CLI
- **Then** el mensaje sugiere ejecutar `az login` y el código de salida es `3`
- **Verificación**: manual o simulada con
  `AZURE_TOKEN_CREDENTIALS=EnvironmentCredential` y credenciales inválidas

### AC-5 — Sin permisos sobre el recurso (R7)

- **Given** una identidad sin el rol *Cognitive Services OpenAI User*
- **When** se ejecuta el CLI
- **Then** el mensaje menciona el rol necesario y el código de salida es `3`
- **Verificación**: manual con identidad sin rol; la ruta 401 se puede simular
  con un `AZURE_OPENAI_SCOPE` incorrecto (exit 3)

### AC-6 — Modo verbose (R4)

- **Given** la ejecución con `--verbose`
- **When** llegan eventos del stream
- **Then** cada evento se imprime **una sola vez** en `stderr`, y sin el flag
  no se imprime ningún evento crudo
- **Verificación**: `npm test` + manual

### AC-7 — Cancelación (R5)

- **Given** una petición en curso
- **When** el usuario pulsa `Ctrl+C`
- **Then** la petición se aborta en menos de 1 segundo, se informa de la
  cancelación y el código de salida es `130`, sin `unhandledRejection`
- **Verificación**: manual; el `AbortController` se cubre en test de caso de uso

### AC-8 — Salida JSON (R6)

- **Given** la ejecución con `--json`
- **When** la petición finaliza correctamente
- **Then** `stdout` contiene **exactamente un** documento JSON válido con las
  claves `responseId`, `text` y `usage`, y el código de salida es `0`
- **Verificación**: `./run.ps1 --json "¿Qué es Microsoft Foundry?" | ConvertFrom-Json`

### AC-9 — Calidad offline (R8)

- **Given** el repositorio clonado, sin red y sin credenciales
- **When** se ejecuta `npm run typecheck && npm test`
- **Then** ambos terminan con código `0` y **ningún test realiza peticiones de red**
- **Verificación**: `npm run typecheck; npm test`

### AC-10 — Separación de canales (R4, R6)

- **Given** la ejecución con `--json`
- **When** se inspecciona la salida
- **Then** `stdout` contiene solo el JSON (datos) y todo diagnóstico, log o error
  va a `stderr`
- **Verificación**: `./run.ps1 --json "..." 1> out.json 2> err.txt`

---

## 6. No-objetivos

Explícitamente **fuera** de esta spec (evitar scope creep):

- Interfaz gráfica, web o API HTTP.
- Persistencia en base de datos o historial de conversaciones.
- Conversación multi-turno con `previous_response_id` (spec 002).
- Tool calling, MCP, RAG, agentes.
- Retry con backoff, telemetría/OpenTelemetry, CI/CD, contenedores.
- Paridad arquitectónica en Python: `run_model.py` es solo un smoke test.

---

## 7. Supuestos y dependencias

- Node.js ≥ 20 (verificado: v26.4.0) y npm.
- Azure CLI instalada y con sesión iniciada (`az login`).
- Un recurso de Azure AI Foundry con un deployment accesible
  (`gpt-5-mini` en `rg-tamueka-9114`).
- Permiso de red hacia `*.services.ai.azure.com`.
- Dependencias: `openai@6.9.0`, `@azure/identity@4.13.0`, `typescript`, `tsx`,
  `vitest`, `@types/node`.

---

## 8. Glosario

| Término | Significado |
|---|---|
| **Deployment** | Nombre con el que el modelo está desplegado en Azure; no es el nombre del modelo |
| **Puerto** | Interfaz del dominio que define *qué* necesita la aplicación, sin decir *cómo* |
| **Adaptador** | Implementación concreta de un puerto (Azure, consola, fake) |
| **Composition root** | Único lugar donde se instancian implementaciones concretas (`main.ts`) |
| **Chunk** | Fragmento de la respuesta en streaming |
| **AC** | Criterio de aceptación |

---

## 9. Trazabilidad

| Requisito | Criterio | Test previsto | Tarea |
|---|---|---|---|
| R1 | AC-1 | `RunModelUseCase.test.ts` | T4, T13 |
| R2 | AC-2 | `Config.test.ts` | T6, T13 |
| R3 | AC-4 | `AzureOpenAiAdapter` + test de mapeo | T8, T19 |
| R4 | AC-6, AC-10 | `RunModelUseCase.test.ts`, `ConsoleLogger` | T9, T13 |
| R5 | AC-7 | `RunModelUseCase.test.ts` | T4, T13 |
| R6 | AC-8, AC-10 | `RunModelUseCase.test.ts` | T11, T13 |
| R7 | AC-3, AC-5 | `errors` / adaptador | T8, T13 |
| R8 | AC-9 | suite completa | T14 |
| R9 | — | `args.test.ts` | T10 |