"""Smoke test de paridad con la implementación TypeScript (spec 001).

No replica la arquitectura hexagonal: sirve para comprobar que el mismo
deployment responde igual desde Python. Ver INSTRUCTIONS.md §10.

Uso:
    python run_model.py
    python run_model.py "¿Qué es Microsoft Foundry?"
    python run_model.py --effort low "di hola"     (el flag se ignora aquí)

Códigos de salida: mismos que el CLI (0, 1, 2, 3, 4, 5).
"""

from __future__ import annotations

import os
import sys

from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from dotenv import load_dotenv
from openai import APIStatusError, OpenAI

DEFAULT_PROMPT = "¿Qué es Microsoft Foundry?"
DEFAULT_SCOPE = "https://ai.azure.com/.default"

EXIT_OK = 0
EXIT_UNEXPECTED = 1
EXIT_USAGE = 2
EXIT_AUTH = 3
EXIT_NOT_FOUND = 4
EXIT_RATE_LIMIT = 5


def configure_output() -> None:
    """Garantiza UTF-8 incluso si la consola usa una code page limitada.

    Sin esto, una respuesta en español con guiones tipográficos o comillas
    angulares puede fallar con UnicodeEncodeError en Windows.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)

        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")


def read_required(name: str) -> str:
    value = (os.getenv(name) or "").strip()

    if not value:
        print(
            f"error: falta la variable de entorno {name}. "
            "Añádela a tu .env (ver INSTRUCTIONS.md).",
            file=sys.stderr,
        )
        raise SystemExit(EXIT_USAGE)

    return value


def parse_prompt(argv: list[str]) -> str:
    """Toma los argumentos que no son flags como prompt."""
    positional = [arg for arg in argv if not arg.startswith("-")]

    return " ".join(positional).strip() or DEFAULT_PROMPT


def main(argv: list[str]) -> int:
    configure_output()
    load_dotenv()

    endpoint = read_required("AZURE_OPENAI_ENDPOINT")
    deployment = read_required("AZURE_OPENAI_DEPLOYMENT")
    scope = (os.getenv("AZURE_OPENAI_SCOPE") or DEFAULT_SCOPE).strip()

    prompt = parse_prompt(argv)

    client = OpenAI(
        base_url=endpoint,
        api_key=get_bearer_token_provider(DefaultAzureCredential(), scope),
    )

    try:
        stream = client.responses.create(
            model=deployment,
            input=prompt,
            store=False,
            stream=True,
        )

        for event in stream:
            if event.type == "response.output_text.delta":
                print(event.delta, end="", flush=True)

        print()
        return EXIT_OK
    except APIStatusError as error:
        status = error.status_code

        if status in (401, 403):
            print(
                "error: credencial inválida o sin permisos. "
                "Ejecuta: az login (y revisa el rol Cognitive Services OpenAI User).",
                file=sys.stderr,
            )
            return EXIT_AUTH

        if status == 404:
            print(
                f'error: no existe el deployment "{deployment}" en "{endpoint}".',
                file=sys.stderr,
            )
            return EXIT_NOT_FOUND

        if status == 429:
            print(
                "error: límite de tasa alcanzado. Espera unos segundos y reintenta.",
                file=sys.stderr,
            )
            return EXIT_RATE_LIMIT

        print(f"error: fallo del proveedor (HTTP {status}): {error}", file=sys.stderr)
        return EXIT_UNEXPECTED
    except Exception as error:  # noqa: BLE001 - smoke test
        if "Credential" in type(error).__name__ or "Authentication" in type(error).__name__:
            print("error: no se pudo obtener credencial. Ejecuta: az login", file=sys.stderr)
            return EXIT_AUTH

        print(f"error: {error}", file=sys.stderr)
        return EXIT_UNEXPECTED


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))