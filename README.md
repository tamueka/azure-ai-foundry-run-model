# run-model — CLI de Azure AI Foundry

[![Repositorio](https://img.shields.io/badge/GitHub-azure--ai--foundry--run--model-181717?logo=github)](https://github.com/tamueka/azure-ai-foundry-run-model)
[![Release](https://img.shields.io/badge/release-v0.1.0-blue)](https://github.com/tamueka/azure-ai-foundry-run-model/releases/tag/v0.1.0)

CLI de terminal que envía un prompt a un deployment de **Azure AI Foundry**
(`gpt-5-mini`) y muestra la respuesta en streaming. Proyecto del curso de IA de
Microsoft, construido con **Spec-Driven Development (SDD)**, arquitectura
**hexagonal lite** y principios **SOLID**. Toda la documentación, los mensajes y
los ejemplos están en español.

> **Empieza por este README.** El detalle operativo, los problemas comunes y la
> paridad con Python están en [`INSTRUCTIONS.md`](INSTRUCTIONS.md).

- Respuesta en streaming **sin duplicados**.
- Eventos SSE crudos solo con `--verbose`.
- Salida JSON limpia con `--json`, lista para scripts.
- Errores accionables y **códigos de salida estables**.
- Autenticación con **Entra ID** (`az login`), sin API keys.
- **52 tests offline**: sin red y sin gastar tokens.

---

## Requisitos

| Requisito | Versión probada | Comprobación |
|---|---|---|
| Windows | 11 | — |
| Node.js | v26.4.0 (mínimo 20) | `node --version` |
| npm | 12.2.1 | `npm --version` |
| Azure CLI | 2.91.0 | `az version` |
| Sesión de Azure | — | `az account show` |
| Python (opcional) | 3.14 | `python --version` |

Necesitas acceso al recurso de AI Foundry con el rol
**Cognitive Services OpenAI User**.

---

## Inicio rápido

Desde la carpeta del proyecto:

```powershell
# 1. Dependencias
npm install

# 2. Sesión de Azure
az login
az account set --subscription <tu-suscripción>

# 3. Configuración local
Copy-Item .env.example .env
# Edita .env con tu endpoint y el nombre del deployment

# 4. Verificación sin red ni coste
npm run typecheck
npm test

# 5. Ejecución real
npm run dev
```

`.env` es local y está ignorado por Git. La plantilla `.env.example` solo
contiene marcadores; **no hay secretos en el repositorio**.

---

## Uso

| Comando | Qué hace |
|---|---|
| `npm run dev` | Prompt por defecto: `¿Qué es Microsoft Foundry?` |
| `npm run dev -- "tu prompt"` | Prompt propio (solo texto, sin flags) |
| `npm run dev:json -- "tu prompt"` | Salida JSON para scripts |
| `npm run dev:verbose` | Eventos SSE crudos en `stderr` |
| `npm run help` | Ayuda y opciones |
| `.\run.ps1 [flags] [prompt]` | **Cualquier** combinación de flags |
| `npm run typecheck` | Verificación de tipos en modo `strict` |
| `npm test` | 52 tests offline |
| `npm run test:watch` | Tests en modo vigilancia |
| `npm run build` | Compila a `dist/` |
| `npm start -- "tu prompt"` | Ejecuta la versión compilada |

### ⚠️ npm 12 y los flags

npm 12 valida los flags **incluso después de `--`**, así que esto **falla**:

```powershell
npm run dev -- --json "hola"        # error EUNKNOWNCONFIG
```

Alternativas válidas:

```powershell
npm run dev:json -- "hola"          # flag incluido en el script npm
.\run.ps1 --json "hola"             # lanzador que no interpreta argumentos
```

### Ejemplos

```powershell
# Pregunta propia
npm run dev -- "explica RAG en una frase"

# Protocolo de streaming, una línea por evento
.\run.ps1 --verbose --effort low "di hola"

# Consumir el resultado desde PowerShell
.\run.ps1 --json "¿Qué es Microsoft Foundry?" |
  ConvertFrom-Json |
  Select-Object -ExpandProperty text

# Separar datos de diagnóstico
.\run.ps1 --json "hola" 1> salida.json 2> errores.txt
```

---

## Salida JSON

`--json` escribe **exactamente un** documento en `stdout`; el diagnóstico va a
`stderr`.

```json
{
  "responseId": "resp_00b1...",
  "text": "Microsoft Foundry es la plataforma de IA de Microsoft.\nIntegra modelos, agentes y herramientas.",
  "usage": {
    "inputTokens": 16,
    "outputTokens": 188,
    "reasoningTokens": 64,
    "totalTokens": 204
  }
}
```

---

## Variables de entorno

| Variable | Obligatoria | Por defecto | Descripción |
|---|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | Sí | — | Base URL `…/openai/v1` |
| `AZURE_OPENAI_DEPLOYMENT` | Sí | — | Nombre del **deployment**, no del modelo |
| `AZURE_OPENAI_SCOPE` | No | `https://ai.azure.com/.default` | Scope OAuth |
| `AZURE_OPENAI_TIMEOUT_MS` | No | `60000` | Timeout por petición, en ms |

- Los valores vacíos se consideran ausentes.
- La configuración se valida **antes** de cualquier petición de red.
- Para cambiar de modelo, crea otro deployment en Foundry y actualiza
  `AZURE_OPENAI_DEPLOYMENT`.

---

## Códigos de salida

| Código | Significado | Qué hacer |
|---|---|---|
| `0` | Éxito | — |
| `1` | Error inesperado o del proveedor | Reintentar; revisar red |
| `2` | Configuración o uso inválido | Revisar `.env` o flags |
| `3` | Autenticación/autorización (401/403) | `az login`; revisar rol |
| `4` | Deployment inexistente (404) | Revisar `AZURE_OPENAI_DEPLOYMENT` |
| `5` | Límite de tasa (429) | Esperar y reintentar |
| `130` | Cancelado con `Ctrl+C` | — |

---

## Arquitectura

Hexagonal lite en tres capas, con dependencias **hacia dentro**:

```
┌──────────────────────────────────────────────┐
│              infrastructure                  │
│   config · azure · logging · cli             │
│   (adaptadores y composition root)           │
└──────────────────┬───────────────────────────┘
                   │ implementa / invoca
┌──────────────────▼───────────────────────────┐
│              application                     │
│   RunModelUseCase                            │
└──────────────────┬───────────────────────────┘
                   │ depende solo de puertos
┌──────────────────▼───────────────────────────┐
│              domain                          │
│   Prompt · Completion · Chunks · Ports       │
│   (sin I/O, sin SDKs, sin console)           │
└──────────────────────────────────────────────┘
```

- `src/domain/` no conoce `openai`, `@azure/identity` ni la consola; lo impone
  `tests/architecture/layers.test.ts`.
- `src/application/` solo depende de los puertos `LlmPort` y `EventSink`.
- `src/infrastructure/cli/main.ts` es el **único composition root**.
- Cambiar de proveedor = nuevo adaptador de `LlmPort`, sin tocar el dominio.

---

## Estructura del repositorio

```
.
├── src/
│   ├── domain/                 # Prompt, Completion, chunks, puertos y errores
│   ├── application/            # RunModelUseCase
│   └── infrastructure/         # Config, Azure, logger y CLI
├── tests/
│   ├── domain/                 # Prompt y CompletionAccumulator
│   ├── application/            # Caso de uso con FakeLlmPort
│   ├── infrastructure/         # Config, parseArgs y mapeo de errores
│   ├── architecture/           # Regla de dependencia del dominio
│   ├── parity/                 # Paridad del prompt TS/Python
│   └── fakes/                  # Dobles de prueba
├── specs/                      # SDD: fuente de verdad del comportamiento
│   └── 001-run-model-cli/
│       ├── spec.md             # QUÉ y POR QUÉ
│       ├── plan.md             # CÓMO
│       ├── tasks.md            # Orden de implementación verificado
│       └── contracts/          # CLI y puerto LLM (normativos)
├── run.ps1                     # Lanzador que reenvía flags sin interpretarlos
├── run_model.py                # Smoke test de paridad en Python
├── requirements.txt            # Dependencias del smoke test Python
├── .env.example                # Plantilla de configuración local
├── INSTRUCTIONS.md             # Runbook detallado en Windows 11
├── tsconfig.json
├── tsconfig.build.json
└── vitest.config.ts
```

---

## Documentación

| Documento | Contenido |
|---|---|
| [`INSTRUCTIONS.md`](INSTRUCTIONS.md) | Runbook completo: puesta en marcha, comandos, problemas comunes y Python |
| [`specs/README.md`](specs/README.md) | Convención y flujo de Spec-Driven Development |
| [`specs/001-run-model-cli/spec.md`](specs/001-run-model-cli/spec.md) | Requisitos, criterios de aceptación y no-objetivos |
| [`specs/001-run-model-cli/plan.md`](specs/001-run-model-cli/plan.md) | Arquitectura, decisiones, SOLID y riesgos |
| [`specs/001-run-model-cli/tasks.md`](specs/001-run-model-cli/tasks.md) | Tareas T1–T19 con su verificación y registro de cierre |
| [`specs/001-run-model-cli/contracts/cli.md`](specs/001-run-model-cli/contracts/cli.md) | Contrato observable del CLI |
| [`specs/001-run-model-cli/contracts/llm-port.md`](specs/001-run-model-cli/contracts/llm-port.md) | Contrato del puerto `LlmPort` |

La spec es la **fuente de verdad**: si el código y la documentación divergen,
manda la spec.

---

## Pruebas

```powershell
npm run typecheck     # strict, sin any implícito
npm test              # 52 tests, 8 archivos, sin red
npm run build         # emite dist/
```

Los tests no hacen red: el caso de uso se prueba con `FakeLlmPort`. Por eso
`npm test` no consume tokens y funciona sin credenciales.

| Nivel | Qué cubre |
|---|---|
| Dominio | `Prompt` (límites y normalización), `CompletionAccumulator` |
| Aplicación | Texto único, defaults, `--verbose`, razonamiento oculto, abort, errores |
| Infraestructura | `Config.fromEnv` y `parseArgs` |
| Arquitectura | El dominio no importa SDKs, red ni consola |
| Paridad | El prompt por defecto coincide en TypeScript y Python |

---

## Versión Python (paridad)

Smoke test equivalente para comprobar el mismo deployment desde Python:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run_model.py "¿Qué es Microsoft Foundry?"
```

`run_model.py` lee `.env` con `python-dotenv`, usa Entra ID y fuerza UTF-8 en la
salida. No replica la arquitectura hexagonal: es solo una prueba de paridad.
Un test (`tests/parity/defaultPrompt.test.ts`) verifica que el prompt por defecto
sea el mismo en TypeScript y en Python.

---

## Seguridad

- Autenticación con **Entra ID**, sin API keys en código ni en disco.
- `.env` está ignorado por Git; `.env.example` solo contiene marcadores.
- El endpoint, el deployment y los identificadores de Azure no se versionan.
- No se registran tokens ni cabeceras de autorización.

---

## Problemas comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `Falta la variable de entorno AZURE_OPENAI_ENDPOINT` | No se cargó `.env` | Usa los scripts npm o `.\run.ps1` |
| `AADSTS50020` / `AADSTS700016` | Sesión en otro tenant | `az login --tenant <tenant>` |
| `No hay una sesión válida de Azure` (exit 3) | Token no disponible | `az logout`, `az login` |
| `No existe el deployment ...` (exit 4) | Nombre incorrecto | Revisa `AZURE_OPENAI_DEPLOYMENT` |
| `EUNKNOWNCONFIG` de npm | npm 12 valida flags | Usa `.\run.ps1` o `dev:json` / `dev:verbose` |
| `UnicodeEncodeError` en Python | Code page de Windows | Ya corregido: `run_model.py` fuerza UTF-8 |

Más detalle en [`INSTRUCTIONS.md` §8](INSTRUCTIONS.md#8-problemas-comunes).

---

## Estado del proyecto

| Campo | Valor |
|---|---|
| Repositorio | [tamueka/azure-ai-foundry-run-model](https://github.com/tamueka/azure-ai-foundry-run-model) |
| Release | [v0.1.0](https://github.com/tamueka/azure-ai-foundry-run-model/releases/tag/v0.1.0) |
| Spec | [001 — CLI `run-model`](specs/001-run-model-cli/spec.md) |
| Estado | **Implementada** (v1.1) |
| Tests | **52/52** |
| Criterios manuales pendientes | AC-5 (mensaje específico de 403) y AC-7 (`Ctrl+C` → exit 130); AC-4 verificado con credencial inválida simulada |

Proyecto educativo del curso de IA de Microsoft.