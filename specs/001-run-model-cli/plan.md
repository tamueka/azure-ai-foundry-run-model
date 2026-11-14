# Plan técnico — Spec 001 `run-model-cli`

Documento derivado de `spec.md`. Describe **cómo** se implementan los
requisitos, no qué se requiere.

---

## 1. Estilo arquitectónico

**Hexagonal "lite"**: tres capas y una regla de dependencia estricta.

```
        ┌──────────────────────────────────────────┐
        │           infrastructure (adapters)      │
        │  config · azure · logging · cli          │
        └───────────────┬──────────────────────────┘
                        │ implementa / invoca
        ┌───────────────▼──────────────────────────┐
        │           application (use case)         │
        │           RunModelUseCase                │
        └───────────────┬──────────────────────────┘
                        │ depende solo de puertos
        ┌───────────────▼──────────────────────────┐
        │              domain (núcleo)             │
        │  Prompt · Completion · Chunk · Ports     │
        └──────────────────────────────────────────┘
```

**Regla de dependencia:** las flechas solo apuntan hacia dentro.

| Capa | Puede importar | Prohibido |
|---|---|---|
| `domain` | solo `domain` y librería estándar | `openai`, `@azure/*`, `node:fs`, `console` |
| `application` | `domain` | `infrastructure`, SDKs |
| `infrastructure` | todo | — (es la capa de composición) |

Se verifica automáticamente con `tests/architecture/layers.test.ts`: el dominio
no puede importar SDKs, red, sistema de archivos, consola ni capas externas.

### Adaptadores

| Tipo | Adaptador | Puerto |
|---|---|---|
| Entrada (driving) | `cli/args.ts` + `cli/main.ts` | invoca el caso de uso |
| Salida (driven) | `azure/AzureOpenAiAdapter.ts` | `LlmPort` |
| Salida (driven) | `logging/ConsoleLogger.ts` | `EventSink` |
| Salida (test) | `tests/fakes/FakeLlmPort.ts` | `LlmPort` |

`main.ts` es el **único** archivo con `new` de infraestructura (composition root).

---

## 2. Estructura de archivos

```
src/
  domain/
    model/Prompt.ts             # Value Object; valida 1..8000 caracteres
    model/CompletionChunk.ts    # unión discriminada
    model/Completion.ts         # entidad + CompletionAccumulator
    ports/LlmPort.ts            # contrato de streaming (ver contracts/llm-port.md)
    ports/EventSink.ts          # contrato de salida
    errors.ts                   # AppError + ConfigError/AuthError/NotFoundError/RateLimitError/ProviderError
  application/
    RunModelUseCase.ts          # orquesta validación → stream → acumulación
  infrastructure/
    config/Config.ts            # Config.fromEnv(env)
    azure/AzureOpenAiAdapter.ts # SDK → dominio
    logging/ConsoleLogger.ts    # EventSink sobre stdout/stderr
    cli/args.ts                 # parseArgs(argv)
    cli/main.ts                 # composition root + señales
tests/
  domain/Prompt.test.ts
  domain/CompletionAccumulator.test.ts
  application/RunModelUseCase.test.ts
  infrastructure/Config.test.ts
  infrastructure/args.test.ts
  infrastructure/AzureOpenAiAdapter.test.ts   # mapeo de errores
  architecture/layers.test.ts     # regla de dependencia del dominio
  parity/defaultPrompt.test.ts    # paridad TS/Python del prompt por defecto
  fakes/FakeLlmPort.ts
  fakes/RecordingEventSink.ts
```

---

## 3. Decisiones de diseño

| # | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| D1 | `AzureOpenAiAdapter` implementa `LlmPort` y traduce eventos del SDK a `CompletionChunk` | Usar tipos del SDK en el dominio | Evita que el dominio dependa de `openai` y permite cambiar de proveedor |
| D2 | Autenticación con `DefaultAzureCredential` + `getBearerTokenProvider` | API key en `.env` | Sin secretos en disco; reutiliza `az login` |
| D3 | Ejecutar TS con `tsx` | Compilar a `dist/` en cada iteración | Menor fricción en Windows; `build` sigue disponible |
| D4 | `vitest` para tests | `node:test` | Mejor DX, sin configuración, soporta TS nativo |
| D5 | Sin `dotenv`: `--env-file=.env` | `dotenv` como dependencia | Node ≥20 lo trae de serie; menos dependencias |
| D6 | `Config.fromEnv` **sin** valores por defecto para endpoint/deployment | Fallback silencioso al recurso del autor | Fail-fast (AC-2); portabilidad |
| D7 | Errores de dominio con `exitCode` propio | Mapear códigos en el CLI | Un solo lugar de verdad |
| D8 | `--json` escribe en `stdout`; logs y eventos en `stderr` | Todo por `stdout` | Permite `| ConvertFrom-Json` (AC-8, AC-10) |
| D9 | `CompletionAccumulator` como clase pura del dominio | Acumular en el caso de uso | Testeable sin puertos |
| D10 | `FakeLlmPort` genera chunks desde un guion | Mocks con `vi.fn` | Tests legibles y reutilizables |

---

## 4. Contratos

- **Entrada/salida del CLI**: `contracts/cli.md` (flags, env, formatos, exit codes).
- **Puerto LLM**: `contracts/llm-port.md` (semántica e invariantes).

Ambos son normativos: si el código y el contrato divergen, el contrato manda y
se abre una corrección de spec.

---

## 5. Aplicación de SOLID

| Principio | Materialización concreta |
|---|---|
| **SRP** | `Prompt` valida; `RunModelUseCase` orquesta; `AzureOpenAiAdapter` traduce protocolo; `ConsoleLogger` formatea; `main.ts` compone |
| **OCP** | Nuevo proveedor (OpenAI directo, Ollama, fake) = nuevo adaptador; ni el caso de uso ni el dominio cambian |
| **LSP** | `FakeLlmPort` y `AzureOpenAiAdapter` respetan las mismas invariantes de `llm-port.md` (orden, terminación única, errores tipados) |
| **ISP** | Dos puertos pequeños (`LlmPort`, `EventSink`) en lugar de una interfaz monolítica |
| **DIP** | `RunModelUseCase` recibe `LlmPort` y `EventSink` por constructor; nunca importa implementaciones |

---

## 6. Flujo de una ejecución

```
main.ts
  ├─ parseArgs(process.argv)            → CliOptions
  ├─ Config.fromEnv(process.env)        → Config | ConfigError (exit 2)
  ├─ new DefaultAzureCredential()       (perezoso; falla al pedir token)
  ├─ new AzureOpenAiAdapter(cfg, sink)  implements LlmPort
  ├─ new RunModelUseCase(port, sink)
  ├─ process.on('SIGINT', abort)
  └─ useCase.execute({ prompt, effort }, signal)
        ├─ Prompt.create(text)                  → InvalidPromptError (exit 2)
        ├─ llm.stream(req, { signal })          → AsyncIterable<CompletionChunk>
        ├─ sink.text(delta) / sink.event(raw)   → stdout / stderr
        └─ accumulator.build()                  → Completion
  └─ salida humana o JSON (según CliOptions) → exit 0
```

---

## 7. Estrategia de pruebas

| Nivel | Qué se prueba | Red | Coste |
|---|---|---|---|
| Dominio | `Prompt` (límites), `CompletionAccumulator` (orden, uso) | No | 0 |
| Aplicación | Caso de uso con `FakeLlmPort`: texto, verbose, abort, error | No | 0 |
| Infraestructura | `Config.fromEnv`, `parseArgs` y mapeo de errores del adaptador | No | 0 |
| Arquitectura | El dominio no importa SDKs, red, consola ni capas externas | No | 0 |
| Paridad | `DEFAULT_PROMPT` idéntico en TypeScript y Python | No | 0 |
| Manual | Ejecución real contra Azure | Sí | Tokens reales |

El smoke test contra Azure **no** forma parte de `npm test` (AC-9 exige offline).

---

## 8. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `DefaultAzureCredential` elige una credencial incorrecta (p. ej. VS Code con otro tenant) | 401 confuso | Mensaje de error que nombra `az login --tenant`; documentado en runbook |
| El SDK `openai@6` evoluciona (campos `obfuscation`, `encrypted_content`) | Ruptura de tipos | El dominio usa `CompletionChunk`; solo el adaptador conoce el SDK |
| `AZURE_OPENAI_ENDPOINT` ausente en `.env` | AC-2 bloquea la ejecución | `.env.example` documenta las variables; `Copy-Item .env.example .env` |
| Windows: rutas y PowerShell | Fricción | Scripts npm en una línea; sin `&&` en docs para PowerShell 5 |
| Coste por ejecución | Gasto inesperado | `--effort low` documentado; tests offline por defecto |

---

## 9. Cambios en archivos existentes

| Archivo | Cambio |
|---|---|
| `run_model.js` | Se **elimina** (sustituido por `src/`) |
| `package.json` | Añade `devDependencies` y scripts; conserva `openai` y `@azure/identity` |
| `.env` | Configuración local ignorada por Git; se añade `.env.example` como plantilla |
| `README.md` | Visión general, inicio rápido, comandos y enlaces a la documentación |
| `INSTRUCTIONS.md` | Runbook en español: puesta en marcha, problemas y paridad Python |
| `.gitignore` | Ignora dependencias, `dist`, entornos Python, `.env` y artefactos |

---

## 10. Criterio de finalización

La spec se considera cerrada cuando AC-1..AC-10 están revisados y
`npm run typecheck && npm test` pasa en un clon limpio sin credenciales. Los AC
que requieren una identidad o interacción no disponibles se registran como
manual aceptado en `tasks.md`.