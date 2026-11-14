# Spec 002 — Conversación multi-turno (`chat`)

| Campo | Valor |
|---|---|
| ID | 002-multi-turno |
| Estado | Aprobada |
| Versión | 1.0 |
| Fecha | 2026-11-14 |
| Autor | Equipo del proyecto (curso Microsoft AI) |
| Depende de | [001 — CLI `run-model`](../001-run-model-cli/spec.md) |
| Implementación | Pendiente — `plan.md` y `tasks.md` por escribir |

---

## 1. Contexto y problema

La [spec 001](../001-run-model-cli/spec.md) resolvió el disparo único: un prompt,
una respuesta y salida. Ese modelo obliga a repetir todo el contexto en cada
pregunta, lo que produce tres problemas:

1. **Preguntas de seguimiento incómodas**: cada turno exige reescribir el
   contexto anterior, con riesgo de omitirlo o contradecirlo.
2. **Coste y latencia**: reenviar el historial completo en cada petición gasta
   tokens de entrada que el proveedor ya conoce.
3. **Fricción de uso**: el estudiante y el docente necesitan conversar, no
   encadenar comandos sueltos.

El proveedor permite encadenar respuestas con `previous_response_id`: el cliente
envía solo el turno nuevo y el servidor recupera el contexto. Esta spec define
ese comportamiento observable, sin cambiar el modo de un disparo único.

---

## 2. Objetivo

Añadir un **REPL interactivo** que:

- mantenga una conversación multi-turno con `previous_response_id`,
- conserve el estado **solo en memoria** durante la sesión,
- muestre cada respuesta en streaming **una sola vez**,
- permita reiniciar el hilo sin cerrar el proceso,
- aísle los errores de un turno para que la sesión siga viva,
- reutilice el dominio, los puertos y el adaptador de la spec 001.

---

## 3. Usuarios y casos de uso

| Actor | Necesidad |
|---|---|
| Estudiante del curso | Hacer preguntas de seguimiento sin repetir el contexto |
| Docente / demo | Mostrar una conversación fluida con el modelo en la terminal |
| Script o CI | Consumir cada turno como una línea JSON (NDJSON) |

---

## 4. Requisitos (MoSCoW)

| ID | Prio. | Requisito | Razón |
|---|---|---|---|
| R1 | Must | `npm run chat` inicia un REPL: cada línea es un turno y la respuesta se muestra en streaming una sola vez | Problema 1 |
| R2 | Must | El hilo se mantiene con `previous_response_id`; el primer turno no lo envía | Problema 2 |
| R3 | Must | Comandos `/salir`, `/limpiar` y `/ayuda`; `/limpiar` reinicia el hilo sin cerrar el proceso | Control del usuario |
| R4 | Must | Un error de un turno se informa en `stderr` y **no** cierra la sesión; un error de configuración al arrancar sale con `2` | Robustez |
| R5 | Must | `Ctrl+C` durante un turno lo cancela y vuelve al prompt; en el prompt, `Ctrl+C` sale con `130` | Robustez |
| R6 | Should | `--effort` se aplica a todos los turnos y `--verbose` muestra los eventos crudos de cada turno | Coste y depuración |
| R7 | Should | Tests offline con `FakeLlmPort`; sin red ni tokens | Calidad |
| R8 | Could | `--json` emite **NDJSON**: exactamente un documento por turno en `stdout` | Uso en scripts |
| R9 | Must | Cada entrada se valida como prompt: recorte de extremos, 1..8000 caracteres; una entrada inválida no genera petición | Coherencia con 001 |

---

## 5. Criterios de aceptación

Formato Given/When/Then. Todos son **verificables** y se cierran con el comando
o la evidencia de la columna de verificación.

### AC-1 — Continuidad entre dos turnos (R1, R2)

- **Given** un REPL iniciado y un primer turno respondido con `responseId` R1
- **When** el usuario envía un segundo prompt
- **Then** la petición incluye `previous_response_id = R1`, la respuesta se
  muestra una sola vez y la sesión sigue abierta
- **Verificación**: test con `FakeLlmPort` que capture las peticiones + ejecución
  real de dos turnos encadenados

### AC-2 — Primer turno sin hilo (R2)

- **Given** un REPL recién iniciado, sin turnos previos
- **When** el usuario envía el primer prompt
- **Then** la petición **no** incluye `previous_response_id`
- **Verificación**: test con `FakeLlmPort`

### AC-3 — Reinicio del hilo con `/limpiar` (R3)

- **Given** una conversación con al menos un turno
- **When** el usuario escribe `/limpiar`
- **Then** se confirma el reinicio, el proceso sigue vivo y el turno siguiente
  **no** incluye `previous_response_id`
- **Verificación**: test con `FakeLlmPort` + manual

### AC-4 — Salida y ayuda (R3)

- **Given** un REPL en el prompt
- **When** el usuario escribe `/ayuda`
- **Then** se listan los comandos disponibles y **no** se envía ninguna petición
- **When** el usuario escribe `/salir` (o pulsa `Ctrl+D`)
- **Then** el proceso termina con código `0` y sin peticiones adicionales
- **Verificación**: test del parser de comandos + manual

### AC-5 — Entrada inválida (R9)

- **Given** un REPL en el prompt
- **When** el usuario envía una línea vacía, solo espacios o más de 8000
  caracteres
- **Then** se informa del motivo en `stderr`, **no** se envía ninguna petición y
  la sesión sigue abierta
- **Verificación**: test con `FakeLlmPort`

### AC-6 — Aislamiento de errores por turno (R4)

- **Given** una conversación en curso
- **When** un turno falla con un error del proveedor (por ejemplo, `429` o `404`)
- **Then** el mensaje accionable se escribe en `stderr`, la sesión sigue en el
  prompt y el turno siguiente puede completarse con normalidad
- **Verificación**: test con `FakeLlmPort` que falle una vez y luego responda

### AC-7 — Arranque sin configuración (R4)

- **Given** un entorno sin `AZURE_OPENAI_ENDPOINT` o sin
  `AZURE_OPENAI_DEPLOYMENT`
- **When** se ejecuta `npm run chat`
- **Then** se muestra el mensaje de configuración en `stderr`, no se abre el
  REPL y el código de salida es `2`
- **Verificación**: manual + test de `Config`

### AC-8 — Cancelación con `Ctrl+C` (R5)

- **Given** una petición en curso
- **When** el usuario pulsa `Ctrl+C`
- **Then** la petición se aborta, se informa de la cancelación y se vuelve al
  prompt sin cerrar la sesión, sin `unhandledRejection`
- **Given** el REPL en el prompt, sin petición en curso
- **When** el usuario pulsa `Ctrl+C`
- **Then** el proceso termina con código `130`
- **Verificación**: manual; el abort por turno se cubre con test del caso de uso

### AC-9 — Esfuerzo y modo verbose (R6)

- **Given** una sesión iniciada con `--effort low`
- **When** se envían varios turnos
- **Then** todos usan `low`
- **Given** una sesión con `--verbose`
- **When** llega un turno
- **Then** cada evento crudo se imprime **una sola vez** en `stderr`, asociado a
  su turno; sin el flag no se imprime ningún evento crudo
- **Verificación**: test con `FakeLlmPort` + manual

### AC-10 — NDJSON y separación de canales (R8)

- **Given** una sesión con `--json`
- **When** un turno finaliza correctamente
- **Then** `stdout` contiene **exactamente una** línea JSON válida con las claves
  `turn`, `responseId`, `text` y `usage`
- **When** un turno falla
- **Then** `stdout` contiene una línea JSON con `turn` y `error` (`code` y
  `message`), y el diagnóstico adicional va a `stderr`
- **Then** los prompts, la ayuda y los mensajes de estado nunca se escriben en
  `stdout`
- **Verificación**: `./run.ps1 --chat --json` y validación línea a línea con
  `ConvertFrom-Json`

### AC-11 — Calidad offline (R7)

- **Given** el repositorio clonado, sin red y sin credenciales
- **When** se ejecuta `npm run typecheck && npm test`
- **Then** ambos terminan con código `0` y **ningún test realiza peticiones de
  red**
- **Verificación**: `npm run typecheck; npm test`

---

## 6. No-objetivos

Explícitamente **fuera** de esta spec (evitar scope creep):

- Persistir la conversación en disco o reanudarla tras cerrar el proceso.
- Varias conversaciones simultáneas, sesiones con nombre o cambio entre hilos.
- Editar, borrar o reordenar turnos concretos.
- Historial local reenviado en cada petición; el estado vive en el servidor.
- Tool calling, MCP, RAG, agentes, ficheros adjuntos o imágenes.
- Interfaz gráfica, web o API HTTP.
- Retry automático con backoff, telemetría/OpenTelemetry, CI/CD o contenedores.
- Cambiar el comportamiento de un disparo único definido en la spec 001.

---

## 7. Supuestos y dependencias

- La spec 001 está implementada y sus 52 tests siguen en verde.
- El deployment admite la API de Responses con `previous_response_id`.
- El encadenamiento con `previous_response_id` requiere que la respuesta previa
  se haya almacenado (`store: true`); la retención y caducidad las define el
  proveedor.
- Cada respuesta devuelve un `responseId` utilizable en el turno siguiente.
- Se reutilizan la autenticación de Entra ID, la configuración y los códigos de
  salida de la spec 001.
- Node.js ≥ 20, Azure CLI con sesión iniciada y red hacia
  `*.services.ai.azure.com`.
- No se crean recursos nuevos de Azure.

---

## 8. Decisiones de alcance

| Decisión | Valor | Motivo |
|---|---|---|
| Interfaz | REPL interactivo (`npm run chat`) | Conversación natural sin perder el modo de un disparo único |
| Estado del hilo | `previous_response_id` | Menos tokens y menos código que reenviar el historial |
| Persistencia | Solo en memoria | Simplicidad; retomar sesiones queda fuera de alcance |
| Comandos | `/salir`, `/limpiar`, `/ayuda` | Control mínimo sin construir un shell completo |
| `Ctrl+C` | Cancela el turno; en el prompt sale con `130` | Evita perder la sesión por una cancelación accidental |
| `--json` | NDJSON, un documento por turno | Scripts pueden procesar la conversación en streaming |
| `--effort` | Se aplica a todos los turnos | Coherencia y coste predecible |

---

## 9. Impacto en los contratos existentes

Esta spec no reescribe la 001, pero exige ampliar sus contratos de forma
compatible:

| Contrato | Cambio esperado |
|---|---|
| `LlmPort` / `CompletionRequest` | Añadir `previousResponseId?` opcional y definir que el adaptador lo envía como `previous_response_id` |
| `LlmPort` / `Completion` | Sin cambios de forma: `responseId` ya existe y se propaga al turno siguiente |
| Adaptador de Azure | En modo `chat`, la petición debe almacenarse (`store: true`) para permitir el encadenamiento |
| CLI | Nuevo comando observable `chat` y flag `--json` con semántica NDJSON |
| Logger | Los eventos y mensajes de cada turno se etiquetan con el número de turno en `stderr` |

El detalle de diseño, las alternativas y los riesgos se documentarán en
`plan.md` antes de escribir código.

---

## 10. Glosario

| Término | Significado |
|---|---|
| **REPL** | Bucle lectura-evaluación-impresión: se lee una línea, se procesa y se vuelve al prompt |
| **Turno** | Un prompt del usuario y su respuesta completa |
| **Hilo** | Secuencia de turnos encadenados por `previous_response_id` |
| **`previous_response_id`** | Identificador de la respuesta anterior que el servidor usa para recuperar el contexto |
| **`responseId`** | Identificador que devuelve el proveedor para la respuesta de un turno |
| **NDJSON** | JSON delimitado por líneas: un documento JSON por línea |
| **Sesión** | Ejecución del REPL desde que arranca hasta que termina |
| **AC** | Criterio de aceptación |

---

## 11. Trazabilidad

| Requisito | Criterio | Test previsto | Tarea |
|---|---|---|---|
| R1 | AC-1, AC-4 | `ChatSession.test.ts` | Pendiente |
| R2 | AC-1, AC-2, AC-3 | `ChatSession.test.ts` | Pendiente |
| R3 | AC-3, AC-4 | `commands.test.ts` | Pendiente |
| R4 | AC-6, AC-7 | `ChatSession.test.ts`, `Config.test.ts` | Pendiente |
| R5 | AC-8 | `ChatSession.test.ts` (abort) + manual | Pendiente |
| R6 | AC-9 | `ChatSession.test.ts`, `ConsoleLogger` | Pendiente |
| R7 | AC-11 | suite completa | Pendiente |
| R8 | AC-10 | `ChatSession.test.ts`, `logger` | Pendiente |
| R9 | AC-5 | `ChatSession.test.ts`, `Prompt.test.ts` | Pendiente |

Las tareas se numerarán en `tasks.md` después de aprobar `plan.md`.
