# Contrato — CLI `run-model`

Normativo. Define la interfaz observable del programa: argumentos, variables de
entorno, formatos de salida y códigos de salida.

---

## 1. Sinopsis

```
run-model [opciones] [prompt]
```

- `prompt` es **posicional y opcional**. Si se omite, se usa
  `¿Qué es Microsoft Foundry?`.
- El prompt debe ir entre comillas si contiene espacios.

## 2. Opciones

| Flag | Alias | Tipo | Por defecto | Descripción |
|---|---|---|---|---|
| `--verbose` | `-v` | booleano | `false` | Emite cada evento SSE crudo en `stderr`, una sola vez |
| `--json` | — | booleano | `false` | Emite un único objeto JSON en `stdout` |
| `--effort <nivel>` | — | `low\|medium\|high` | `medium` | Esfuerzo de razonamiento del modelo |
| `--help` | `-h` | booleano | — | Muestra ayuda y sale con `0` |

### Reglas de parsing

- Las opciones pueden aparecer antes o después del prompt.
- `--json` y `--verbose` son compatibles: el JSON va a `stdout` y los eventos a
  `stderr`.
- Un flag desconocido es error de uso (`exit 2`) con el flag en el mensaje.
- `--effort` sin valor válido es error de uso (`exit 2`).
- El prompt vacío o solo espacios es error de uso (`exit 2`).

## 3. Variables de entorno

| Variable | Obligatoria | Ejemplo | Descripción |
|---|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | Sí | `https://mi-recurso.services.ai.azure.com/openai/v1` | Base URL compatible con OpenAI |
| `AZURE_OPENAI_DEPLOYMENT` | Sí | `gpt-5-mini` | **Nombre del deployment**, no del modelo |
| `AZURE_OPENAI_SCOPE` | No | `https://ai.azure.com/.default` | Scope OAuth; el valor por defecto es el correcto para Foundry |
| `AZURE_OPENAI_TIMEOUT_MS` | No | `60000` | Timeout por petición; por defecto `60000` |

- Valores vacíos (`""`) se consideran **ausentes**.
- La validación ocurre **antes** de cualquier petición de red (fail-fast).

## 4. Salida

### 4.1 Modo humano (por defecto)

`stdout`: únicamente el texto de la respuesta, a medida que llega.

`stderr`: mensajes de estado y, si hay error, el diagnóstico.

```
Microsoft Foundry es la plataforma de IA de Microsoft.
Integra modelos, agentes y herramientas en un solo lugar.
```

### 4.2 Modo `--verbose`

`stderr`: una línea por evento, con `sequence_number` y tipo.

```
[14] response.output_text.delta       "\n"
[15] response.output_text.delta       "Microsoft"
```

Los eventos **nunca** se duplican ni se mezclan con el texto de `stdout`.

### 4.3 Modo `--json`

`stdout`: **exactamente un** documento JSON, sin texto adicional, sin ANSI.

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

- Si hay error, **no** se emite JSON parcial: se escribe el diagnóstico en
  `stderr` y se devuelve el código correspondiente.

## 5. Códigos de salida

| Código | Significado | Acción esperada |
|---|---|---|
| `0` | Éxito | — |
| `1` | Error inesperado o del proveedor (5xx, red) | Reintentar / revisar red |
| `2` | Configuración o uso inválido | Corregir `.env` o flags |
| `3` | Autenticación o autorización (401/403) | `az login`, revisar rol |
| `4` | Recurso no encontrado (deployment/modelo) | Revisar `AZURE_OPENAI_DEPLOYMENT` |
| `5` | Límite de tasa (429) | Esperar y reintentar |
| `130` | Interrumpido por el usuario (`Ctrl+C`) | — |

## 6. Cancelación

- `Ctrl+C` dispara `AbortController.abort()` sobre la petición en curso.
- El proceso debe terminar en menos de **1 segundo** (AC-7).
- No se permite `unhandledRejection` ni stack trace por cancelación.
- El mensaje de cancelación va a `stderr`; `stdout` no se contamina.

## 7. Ejemplos

> npm 12 valida los flags incluso después de `--`, así que `npm run dev -- --json`
> falla con `EUNKNOWNCONFIG`. Usa `.\run.ps1` para combinaciones de flags.

```powershell
# Ejecución básica (prompt por defecto)
npm run dev

# Prompt propio (solo texto: npm no rechaza posicionales)
npm run dev -- "¿Qué es Microsoft Foundry?"

# Ver el protocolo de streaming
.\run.ps1 --verbose "explica RAG en una frase"

# Consumir desde PowerShell
.\run.ps1 --json "¿Qué es Microsoft Foundry?" | ConvertFrom-Json | Select-Object -ExpandProperty text

# Separar canales
.\run.ps1 --json "hola" 1> out.json 2> err.txt
```

## 8. Garantías

1. `stdout` solo contiene datos (texto o JSON), nunca diagnóstico.
2. Ningún evento se imprime dos veces.
3. Los códigos de salida son estables y documentados (tabla §5).
4. La ausencia de configuración nunca produce una petición de red.
