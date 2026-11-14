import { UsageError } from "../../domain/errors.js";
import type { ReasoningEffort } from "../../domain/model/CompletionChunk.js";

/** Prompt usado cuando no se pasa ninguno por línea de comandos. */
export const DEFAULT_PROMPT = "¿Qué es Microsoft Foundry?";

export const USAGE = `run-model — envía un prompt a un modelo de Azure AI Foundry

Uso:
  npm run dev                       Prompt por defecto
  npm run dev -- "tu prompt"        Prompt propio (solo texto, sin flags)
  npm run dev:json -- "tu prompt"   Salida JSON
  npm run dev:verbose               Eventos SSE crudos
  npm run chat                      Conversación multi-turno (REPL)
  npm run chat:json                 REPL con NDJSON
  npm run chat:verbose              REPL con eventos crudos
  npm run help                      Esta ayuda
  ./run.ps1 [opciones] [prompt]     Cualquier combinación de flags
  ./run.ps1 --chat [opciones]       REPL con cualquier combinación de flags

Opciones:
  -v, --verbose         Muestra cada evento SSE en stderr (una sola vez)
      --json            Emite un objeto JSON (disparo único) o NDJSON (chat)
      --chat            Inicia el modo conversacional; no admite prompt posicional
      --effort <nivel>  Esfuerzo de razonamiento: low | medium | high (por defecto: medium)
  -h, --help            Muestra esta ayuda

Comandos del REPL:
  /ayuda                Muestra la ayuda de comandos
  /limpiar              Reinicia el hilo y olvida el contexto
  /salir                Cierra la sesión

Variables de entorno obligatorias:
  AZURE_OPENAI_ENDPOINT    URL base del recurso (…/openai/v1)
  AZURE_OPENAI_DEPLOYMENT  Nombre del deployment (no del modelo)

Ejemplos:
  npm run dev -- "¿Qué es Microsoft Foundry?"
  ./run.ps1 --verbose "explica RAG en una frase"
  ./run.ps1 --json "hola" | ConvertFrom-Json
  npm run chat
  @("mi color favorito es el azul", "¿cuál es mi color favorito?", "/salir") |
    ./run.ps1 --chat --effort low`;

export interface CliOptions {
  readonly prompt: string;
  readonly verbose: boolean;
  readonly json: boolean;
  readonly chat: boolean;
  readonly effort: ReasoningEffort;
  readonly help: boolean;
}

const EFFORTS: readonly ReasoningEffort[] = ["low", "medium", "high"];

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return (EFFORTS as readonly string[]).includes(value);
}

/**
 * Parsea los argumentos del proceso.
 * @throws {UsageError} ante flags desconocidos o valores inválidos.
 */
export function parseArgs(argv: readonly string[]): CliOptions {
  let verbose = false;
  let json = false;
  let chat = false;
  let help = false;
  let effort: ReasoningEffort = "medium";
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === undefined) {
      continue;
    }

    switch (arg) {
      case "-v":
      case "--verbose":
        verbose = true;
        break;
      case "--json":
        json = true;
        break;
      case "--chat":
        chat = true;
        break;
      case "-h":
      case "--help":
        help = true;
        break;
      case "--effort": {
        const value = argv[index + 1];

        if (value === undefined) {
          throw new UsageError(
            "La opción --effort requiere un valor: low, medium o high.",
          );
        }

        if (!isReasoningEffort(value)) {
          throw new UsageError(
            `Valor inválido para --effort: "${value}". Usa low, medium o high.`,
          );
        }

        effort = value;
        index += 1;
        break;
      }
      default:
        if (arg.startsWith("-") && arg !== "-") {
          throw new UsageError(`Opción desconocida: "${arg}". Usa --help para ver las opciones.`);
        }

        positional.push(arg);
    }
  }

  if (chat && !help && positional.length > 0) {
    throw new UsageError(
      "El modo --chat no acepta prompt posicional. Escribe los turnos dentro del REPL.",
    );
  }

  return {
    prompt: positional.length === 0 ? DEFAULT_PROMPT : positional.join(" ").trim(),
    verbose,
    json,
    chat,
    effort,
    help,
  };
}