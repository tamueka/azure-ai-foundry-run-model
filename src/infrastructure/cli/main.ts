import { RunModelUseCase } from "../../application/RunModelUseCase.js";
import { AppError } from "../../domain/errors.js";
import { AzureOpenAiAdapter } from "../azure/AzureOpenAiAdapter.js";
import { Config } from "../config/Config.js";
import { ConsoleLogger } from "../logging/ConsoleLogger.js";
import { USAGE, parseArgs, type CliOptions } from "./args.js";

const EXIT_OK = 0;
const EXIT_UNEXPECTED = 1;
const EXIT_INTERRUPTED = 130;

/**
 * Composition root: único punto donde se instancian implementaciones concretas.
 * También es el adaptador de entrada: lee argumentos, conecta señales y elige
 * el código de salida.
 */
async function run(): Promise<number> {
  let cli: CliOptions | null = null;
  let controller: AbortController | null = null;

  try {
    cli = parseArgs(process.argv.slice(2));

    if (cli.help) {
      process.stdout.write(`${USAGE}\n`);
      return EXIT_OK;
    }

    const sink = new ConsoleLogger({ verbose: cli.verbose, json: cli.json });
    const config = Config.fromEnv(process.env);
    const useCase = new RunModelUseCase(new AzureOpenAiAdapter(config), sink);

    controller = new AbortController();
    const onInterrupt = (): void => {
      controller?.abort();
    };
    process.once("SIGINT", onInterrupt);

    try {
      const completion = await useCase.execute(
        { prompt: cli.prompt, effort: cli.effort, verbose: cli.verbose },
        { signal: controller.signal },
      );

      if (cli.json) {
        process.stdout.write(`${JSON.stringify(completion, null, 2)}\n`);
      } else {
        process.stdout.write("\n");
      }

      return EXIT_OK;
    } finally {
      process.removeListener("SIGINT", onInterrupt);
    }
  } catch (error) {
    const sink = new ConsoleLogger({
      verbose: cli?.verbose ?? false,
      json: cli?.json ?? false,
    });

    if (controller?.signal.aborted === true || isAbortError(error)) {
      sink.error("Petición cancelada por el usuario.");
      return EXIT_INTERRUPTED;
    }

    if (error instanceof AppError) {
      sink.error(error.message, error);
      return error.exitCode;
    }

    sink.error("Error inesperado.", error);
    return EXIT_UNEXPECTED;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`error: fallo no controlado: ${String(error)}\n`);
    process.exitCode = EXIT_UNEXPECTED;
  });