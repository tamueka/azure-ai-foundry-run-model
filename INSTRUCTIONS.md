# Ejecución local en Windows 11

Guía práctica del proyecto **run-model**: un CLI que envía un prompt a un
deployment de Azure AI Foundry, muestra la respuesta en streaming y permite
conversar en multi-turno con `previous_response_id`.

> Visión general, características y comandos rápidos: [`README.md`](README.md).
> Fuente de verdad del comportamiento: [`specs/001-run-model-cli/spec.md`](specs/001-run-model-cli/spec.md)
> y [`specs/002-multi-turno/spec.md`](specs/002-multi-turno/spec.md).
> Si esta guía y la spec divergen, manda la spec.

---

## Resumen rápido

**Qué hace:** envía un prompt a un deployment de Azure AI Foundry y muestra la
respuesta en streaming una sola vez; con `--chat`, mantiene una conversación
multi-turno con el contexto en el servidor.

```powershell
npm install
az login
Copy-Item .env.example .env   # rellena endpoint y deployment
npm run typecheck
npm test
npm run dev                  # un disparo
npm run chat                 # conversación
```

Lo más reseñable:

| Tema | Detalle |
|---|---|
| Prompt por defecto | `¿Qué es Microsoft Foundry?` |
| Flags con npm 12 | `npm run dev -- --json` falla; usa `.\run.ps1 --json ...` o `npm run dev:json -- ...` |
| Configuración | `.env` es local e ignorado; `.env.example` es la plantilla |
| Tests | 88 tests offline, sin red ni tokens |
| Salidas | Texto por defecto, `--json` para scripts, `--verbose` para eventos SSE |
| Chat | REPL con `/ayuda`, `/limpiar`, `/salir`, `Ctrl+C` por turno y NDJSON con `--json` |
| Errores | Exit `2` configuración/uso, `3` auth, `4` deployment, `5` rate limit |
| Python | `python run_model.py` como smoke test de paridad |
| Fuente de verdad | [`specs/001-run-model-cli/spec.md`](specs/001-run-model-cli/spec.md) y [`specs/002-multi-turno/spec.md`](specs/002-multi-turno/spec.md) |

Esta guía es el **runbook detallado**. Para la visión general y los comandos
básicos, usa [`README.md`](README.md).

---

## 1. Qué es y cómo está construido

Arquitectura **hexagonal lite** en tres capas, con dependencias hacia dentro:

```
src/
├── domain/            # Prompt, Completion, chunks, puertos y errores (sin I/O, sin SDKs)
├── application/       # RunModelUseCase y ChatSession: flujo e hilo conversacional
└── infrastructure/    # Config, AzureOpenAiAdapter, ConsoleLogger, ChatRepl, CLI
```

- El dominio **no conoce** `openai` ni `@azure/identity`; lo garantiza un test de arquitectura.
- `ChatSession` conserva el `responseId` del último turno; `ChatRepl` gestiona consola, comandos y cancelación.
- `src/infrastructure/cli/main.ts` es el único sitio que instancia implementaciones.
- La autenticación usa **Entra ID** (`DefaultAzureCredential`), no API keys:
  reutiliza tu sesión de `az login`.

---

## 2. Requisitos

| Requisito | Versión probada | Comprobación |
|---|---|---|
| Windows | 11 | — |
| Node.js | v26.4.0 (mínimo 20) | `node --version` |
| npm | 12.2.1 | `npm --version` |
| Azure CLI | 2.91.0 | `az version` |
| Sesión de Azure | — | `az account show` |

Debes tener acceso al recurso de AI Foundry con el rol
**Cognitive Services OpenAI User**.

---

## 3. Puesta en marcha (6 pasos)

```powershell
# 1. Ir a la carpeta del proyecto
cd C:\Users\tamue\AIFoundryProjects\gpt-5-mini-Ae859s

# 2. Instalar dependencias (solo la primera vez)
npm install

# 3. Iniciar sesión en Azure
az login
az account set --subscription 73bd7604-883b-42f8-b043-16dff288c111

# 4. Crear la configuración local (solo si no existe .env)
Copy-Item .env.example .env
# Edita .env con tu endpoint y el nombre del deployment

# 5. Verificar que todo compila y los tests pasan (sin red, sin coste)
npm run typecheck
npm test

# 6. Ejecutar contra el modelo
npm run dev
```

`.env` es local y está **ignorado por Git**; `.env.example` es la plantilla.
Tu `.env` debe contener al menos:

```ini
AZURE_OPENAI_ENDPOINT="https://tamueka-2667-resource.services.ai.azure.com/openai/v1"
AZURE_OPENAI_DEPLOYMENT="gpt-5-mini"
```

No hay secretos en el repositorio: la autenticación usa tu sesión de `az login`.

---

## 4. Comandos disponibles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Ejecuta con el prompt por defecto (`¿Qué es Microsoft Foundry?`) |
| `npm run dev -- "tu prompt"` | Ejecuta con tu prompt (solo texto, sin flags) |
| `npm run dev:json -- "tu prompt"` | Salida JSON para scripts |
| `npm run dev:verbose` | Muestra los eventos SSE crudos en `stderr` |
| `npm run chat` | **Conversación multi-turno** (REPL) |
| `npm run chat:json` | REPL con NDJSON: una línea por turno |
| `npm run chat:verbose` | REPL con eventos crudos etiquetados por turno |
| `npm run help` | Ayuda y opciones |
| `.\run.ps1 [flags] "prompt"` | **Cualquier** combinación de flags (ver nota) |
| `.\run.ps1 --chat [flags]` | REPL con **cualquier** combinación de flags |
| `npm run typecheck` | Verificación de tipos (`strict`) |
| `npm test` | 88 tests offline (sin red, sin tokens) |
| `npm run test:watch` | Tests en modo vigilancia |
| `npm run build` | Compila a `dist/` |
| `npm start -- "prompt"` | Ejecuta la versión compilada |

### ⚠️ Nota sobre npm 12 y los flags

npm 12 valida los flags **incluso después de `--`**, así que esto **falla**:

```powershell
npm run dev -- --json "hola"        # error EUNKNOWNCONFIG
```

Tienes dos alternativas válidas:

```powershell
npm run dev:json -- "hola"          # flag "horneado" en el script npm
.\run.ps1 --json "hola"             # lanzador que no interpreta argumentos
```

---

## 5. Ejemplos

```powershell
# Pregunta propia
npm run dev -- "explica RAG en una frase"

# Ver el protocolo de streaming (una línea por evento, sin duplicados)
.\run.ps1 --verbose --effort low "di hola"

# Consumir desde PowerShell
.\run.ps1 --json "¿Qué es Microsoft Foundry?" | ConvertFrom-Json | Select-Object -ExpandProperty text

# Separar datos de diagnóstico
.\run.ps1 --json "hola" 1> salida.json 2> errores.txt
```

### 5.1 Conversación multi-turno (REPL)

`npm run chat` abre un REPL. Cada línea es un turno; el contexto se conserva con
`previous_response_id` y vive **solo en memoria**. Para poder encadenar, cada
respuesta se almacena con `store: true`.

```powershell
npm run chat
```

| Comando | Efecto | ¿Petición? |
|---|---|---|
| `/ayuda` | Muestra los comandos en `stderr` | No |
| `/limpiar` | Reinicia el hilo sin cerrar la sesión | No |
| `/salir` | Cierra la sesión con código `0` | No |
| `Ctrl+D` | Cierra la entrada y sale con `0` | No |
| `Ctrl+C` | Cancela el turno en curso; en el prompt sale con `130` | — |
| Cualquier otro texto | Prompt del siguiente turno | Sí |

- `--effort` se aplica a **todos** los turnos.
- `--verbose` imprime cada evento una sola vez con el prefijo `[turno N]`.
- Un error de turno se informa en `stderr` y la sesión sigue abierta; el código
  de salida final no cambia.
- El prompt `tú> `, el banner y la ayuda van a `stderr`; `stdout` solo lleva
  datos.

```powershell
# Dos turnos con continuidad (entrada redirigida)
@(
  "Mi color favorito es el azul. Responde solo: entendido.",
  "¿Cuál es mi color favorito? Responde solo el color.",
  "/salir"
) | node --env-file=.env --import tsx src/infrastructure/cli/main.ts --chat --effort low

# NDJSON: exactamente una línea JSON por turno
@("di hola", "/salir") |
  .\run.ps1 --chat --json 1> chat.ndjson 2> chat.err
```

Ejemplo de `chat.ndjson`:

```json
{"turn":1,"responseId":"resp_...","text":"...","usage":{"inputTokens":12,"outputTokens":164,"reasoningTokens":64,"totalTokens":176}}
{"turn":2,"responseId":"resp_...","text":"azul","usage":{"inputTokens":95,"outputTokens":67,"reasoningTokens":0,"totalTokens":162}}
```

Un turno fallido produce una línea con `turn` y `error`:

```json
{"turn":1,"error":{"code":4,"message":"No existe el deployment ..."}}
```

> `.\run.ps1` no reenvía entrada por tubería en PowerShell. Para pruebas con
> entrada redirigida usa directamente `node --env-file=.env --import tsx
> src/infrastructure/cli/main.ts --chat ...`.

**Requisito del proveedor:** el deployment debe admitir la Responses API con
`previous_response_id`. Si el identificador caduca, el turno falla con un error
accionable; usa `/limpiar` para empezar un hilo nuevo.

---

## 6. Variables de entorno

| Variable | Obligatoria | Por defecto | Descripción |
|---|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | Sí | — | Base URL `…/openai/v1` |
| `AZURE_OPENAI_DEPLOYMENT` | Sí | — | Nombre del **deployment**, no del modelo |
| `AZURE_OPENAI_SCOPE` | No | `https://ai.azure.com/.default` | Scope OAuth |
| `AZURE_OPENAI_TIMEOUT_MS` | No | `60000` | Timeout por petición |

- Valores vacíos se consideran ausentes.
- La configuración se valida **antes** de cualquier petición de red.
- Para cambiar de modelo, crea otro deployment en Foundry y actualiza
  `AZURE_OPENAI_DEPLOYMENT` en `.env`.

---

## 7. Códigos de salida

| Código | Significado | Qué hacer |
|---|---|---|
| `0` | Éxito | — |
| `1` | Error inesperado o del proveedor | Reintentar; revisar red |
| `2` | Configuración o uso inválido | Revisar `.env` o flags |
| `3` | Autenticación/autorización (401/403) | `az login`; revisar rol |
| `4` | Deployment inexistente (404) | Revisar `AZURE_OPENAI_DEPLOYMENT` |
| `5` | Límite de tasa (429) | Esperar y reintentar |
| `130` | Cancelado con `Ctrl+C` | — |

En el REPL, los errores de un turno se muestran en `stderr` y **no** terminan el
proceso. La sesión sale con `0` mediante `/salir` o `Ctrl+D`, y con `130` si se
pulsa `Ctrl+C` en el prompt.

Comprobar el código en PowerShell:

```powershell
npm run dev
"exit: $LASTEXITCODE"
```

---

## 8. Problemas comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `Falta la variable de entorno AZURE_OPENAI_ENDPOINT` | No se cargó `.env` | Usa los scripts npm (incluyen `--env-file`) o `.\run.ps1` |
| `AADSTS50020` / `AADSTS700016` | Sesión en otro tenant | `az login --tenant 882ff88b-92a3-4041-a327-f916000416a7` |
| `No hay una sesión válida de Azure` (exit 3) | Token no disponible | `az logout`, `az login` |
| `no tiene el rol 'Cognitive Services OpenAI User'` (exit 3) | Permisos | Pide el rol en el recurso `tamueka-2667-resource` |
| `No existe el deployment ...` (exit 4) | Nombre incorrecto | Comprueba el nombre real del deployment |
| `EUNKNOWNCONFIG` de npm | npm 12 valida flags | Usa `.\run.ps1`, `dev:json` / `dev:verbose` o `chat:*` |
| `El modo --chat no acepta prompt posicional` | Prompt fuera del REPL | Escribe los turnos dentro de `npm run chat` |
| El REPL no lee líneas por tubería con `.\run.ps1` | PowerShell no reenvía stdin | Usa `node --env-file=.env --import tsx src/infrastructure/cli/main.ts --chat` |
| `previous_response_id` inválido o caducado | Hilo demasiado antiguo | `/limpiar` y repetir el turno |
| `no se puede cargar run.ps1` | Execution Policy | `powershell -ExecutionPolicy Bypass -File .\run.ps1` |
| Timeout / `ECONNREFUSED` | VPN o proxy | Revisa `HTTPS_PROXY`; prueba sin VPN |
| `esbuild` no encontrado | `postinstall` bloqueado | `npm install-scripts approve esbuild` |

---

## 9. Calidad y tests

```powershell
npm run typecheck     # strict, sin any implícito
npm test              # 88 tests: dominio, aplicación, infraestructura, arquitectura, paridad
npm run build         # emite dist/ (sin tests)
```

Los tests **no hacen red**: los casos de uso se prueban con `FakeLlmPort` y el
REPL con `MemoryChatIo`. Por eso `npm test` no consume tokens y funciona sin
credenciales.

### 9.1 Verificación manual del chat

| Comprobación | Comando | Resultado esperado |
|---|---|---|
| Continuidad | Dos turnos pidiendo el color favorito | El segundo responde con el color del primero |
| `/limpiar` | Turno, `/limpiar`, pregunta sin contexto | Respuesta sin el contexto anterior |
| `/ayuda` | `/ayuda` y `Ctrl+D` | Ayuda en `stderr`, exit `0`, `stdout` vacío |
| NDJSON | `--chat --json` con dos turnos | Dos líneas JSON válidas y `stdout` limpio |
| Error aislado | Deployment inexistente y dos turnos | Dos líneas de error, sesión viva y exit `0` |
| Verbose | `--chat --verbose` | Eventos únicos con `[turno N]` |
| Sin configuración | `--chat` sin `.env` | Mensaje en `stderr` y exit `2` |
| `Ctrl+C` | Durante un turno / en el prompt | Cancela el turno / sale con `130` |

---

## 10. Versión Python (paridad)

Smoke test equivalente, para comprobar el mismo deployment desde Python:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run_model.py "¿Qué es Microsoft Foundry?"
```

`run_model.py` lee `.env` con `python-dotenv` y usa la misma autenticación de
Entra ID. No replica la arquitectura hexagonal: es solo una prueba de paridad.
La salida se fuerza a **UTF-8** para que los acentos y signos tipográficos del
español no rompan la ejecución en consolas de Windows con otra code page.

El **prompt por defecto es el mismo en TypeScript y en Python**
(`¿Qué es Microsoft Foundry?`). Un test de paridad
(`tests/parity/defaultPrompt.test.ts`) lee el literal de `run_model.py` y lo
compara con `DEFAULT_PROMPT`: si alguien cambia solo uno de los dos, `npm test`
falla.

---

## 11. Estructura del repositorio

```
.
├── src/                      # código TypeScript (hexagonal lite)
├── tests/                    # tests offline + fakes + arquitectura + paridad
├── specs/                    # spec-driven development (fuente de verdad)
│   ├── 001-run-model-cli/    # disparo único
│   │   ├── spec.md
│   │   ├── plan.md
│   │   ├── tasks.md
│   │   └── contracts/
│   └── 002-multi-turno/      # conversación multi-turno
│       ├── spec.md
│       ├── plan.md
│       ├── tasks.md
│       └── contracts/
├── README.md                 # visión general y comandos rápidos
├── INSTRUCTIONS.md           # este runbook
├── run.ps1                   # lanzador que reenvía flags sin interpretarlos
├── run_model.py              # smoke test de paridad en Python
├── requirements.txt
├── install.ps1               # instalación de Azure CLI, azd y dependencias
├── .env.example              # plantilla de configuración local
├── .gitignore
├── tsconfig.json
├── tsconfig.build.json
└── vitest.config.ts
```