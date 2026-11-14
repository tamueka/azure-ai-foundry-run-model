# Contrato — REPL `chat`

Normativo. Define la interfaz observable del modo conversacional: invocación,
comandos, canales, formato NDJSON, códigos de salida y cancelación.

---

## 1. Sinopsis

```
run-model --chat [opciones]
npm run chat
```

- `--chat` inicia el REPL y **no** acepta prompt posicional.
- Sin `--chat`, el programa conserva el comportamiento de un disparo único de la
  spec 001.

## 2. Invocación

| Invocación | Efecto |
|---|---|
| `npm run chat` | REPL con `--effort medium` |
| `npm run chat:json` | REPL con NDJSON en `stdout` |
| `npm run chat:verbose` | REPL con eventos crudos en `stderr` |
| `.\run.ps1 --chat` | REPL y permite cualquier combinación de flags |
| `.\run.ps1 --chat --effort low` | Fija el esfuerzo de todos los turnos |
| `.\run.ps1 --chat --verbose` | Eventos crudos por turno |
| `.\run.ps1 --chat --json` | NDJSON por turno |
| `.\run.ps1 --chat --json --verbose` | NDJSON en `stdout` y eventos en `stderr` |

> npm 12 valida los flags incluso después de `--`; para combinar flags se usa
> `.\run.ps1 --chat ...`.

## 3. Opciones

| Flag | Tipo | Por defecto | Descripción |
|---|---|---|---|
| `--chat` | booleano | `false` | Inicia el REPL multi-turno |
| `--verbose` / `-v` | booleano | `false` | Emite cada evento SSE crudo en `stderr`, una vez, con `[turno N]` |
| `--json` | booleano | `false` | Emite una línea NDJSON por turno en `stdout` |
| `--effort <nivel>` | `low\|medium\|high` | `medium` | Esfuerzo de razonamiento de todos los turnos |
| `--help` / `-h` | booleano | — | Muestra la ayuda y sale con `0` |

## 4. Comandos del REPL

| Comando | Efecto | ¿Petición? |
|---|---|---|
| `/ayuda` | Muestra los comandos en `stderr` | No |
| `/limpiar` | Reinicia el hilo; el siguiente turno no envía `previous_response_id` | No |
| `/salir` | Cierra la sesión con exit `0` | No |
| `Ctrl+D` | Cierra la entrada y sale con exit `0` | No |
| Cualquier otro texto | Se envía como prompt del siguiente turno | Sí |

- Los comandos se reconocen tras recortar espacios y distinguen mayúsculas.
- Una línea vacía o solo espacios no genera petición: se informa del error de
  prompt y la sesión continúa.
- Un prompt de más de 8000 caracteres no genera petición.

## 5. Salida

### 5.1 Modo humano (por defecto)

- `stdout`: solo el texto visible del modelo, en streaming.
- `stderr`: banner, prompt `tú> `, ayuda, estado, errores y eventos verbose.
- Al terminar cada turno se escribe un salto de línea en `stdout`.

### 5.2 Modo `--verbose`

Cada evento se escribe **una sola vez** en `stderr`, agrupado por turno:

```
[turno 1] [14] response.output_text.delta  "\n"
[turno 1] [15] response.output_text.delta  "Microsoft"
```

### 5.3 Modo `--json` (NDJSON)

`stdout` contiene **exactamente una** línea JSON por turno, sin texto adicional.

Turno correcto:

```json
{"turn":1,"responseId":"resp_00b1...","text":"...","usage":{"inputTokens":16,"outputTokens":188,"reasoningTokens":64,"totalTokens":204}}
```

Turno fallido:

```json
{"turn":2,"error":{"code":5,"message":"Se alcanzó el límite de tasa del modelo. Espera unos segundos y reintenta."}}
```

- `turn` empieza en `1` y es único por intento, incluidos los fallidos.
- `code` es el código de salida asociado al error (`1`..`5`, `130` para
  cancelación).
- El fallo de un turno **no** cambia el código de salida final.
- Prompts, banner, ayuda y diagnóstico van a `stderr`.

## 6. Códigos de salida

| Código | Significado |
|---|---|
| `0` | Sesión cerrada con `/salir`, `Ctrl+D` o fin de entrada |
| `1` | Fallo fatal no controlado del REPL |
| `2` | Configuración o uso inválido al arrancar |
| `130` | `Ctrl+C` en el prompt |

Los errores de un turno no terminan el proceso y no fijan el código final.

## 7. Cancelación

- `Ctrl+C` con un turno en curso: aborta **solo** ese turno, informa y vuelve al
  prompt. La sesión y el hilo anterior siguen vivos.
- `Ctrl+C` en el prompt: cierra el REPL con exit `130`.
- `Ctrl+C` no debe producir `unhandledRejection` ni stack trace.
- La cancelación de un turno no modifica el `previous_response_id`.

## 8. Garantías

1. `stdout` solo contiene datos: texto o NDJSON.
2. Ningún evento se imprime dos veces.
3. El primer turno nunca envía `previous_response_id`.
4. `/limpiar` es la única operación que olvida el hilo.
5. Un error de turno no cierra la sesión.
6. La configuración se valida antes de abrir el REPL.
7. Sin secretos en el repositorio.

## 9. Ejemplos

```powershell
# Conversación básica
npm run chat

# Dos turnos con entrada redirigida
@("Mi color favorito es el azul", "¿Cuál es mi color favorito?", "/salir") |
  .\run.ps1 --chat --effort low

# NDJSON para scripts
@("di hola", "/salir") |
  .\run.ps1 --chat --json 1> chat.ndjson 2> chat.err

# Eventos del protocolo por turno
.\run.ps1 --chat --verbose
```
