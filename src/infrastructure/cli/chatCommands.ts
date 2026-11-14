/** Comandos que entiende el REPL, además del texto libre. */
export type ChatCommand =
  | { readonly kind: "prompt"; readonly text: string }
  | { readonly kind: "exit" }
  | { readonly kind: "clear" }
  | { readonly kind: "help" };

/** Ayuda que se muestra con `/ayuda`. Va a `stderr`. */
export const CHAT_HELP = `Comandos del REPL:
  /ayuda    Muestra esta ayuda
  /limpiar  Reinicia el hilo y olvida el contexto anterior
  /salir    Cierra la sesión

Cualquier otra línea se envía como prompt al modelo.
También puedes salir con Ctrl+D. Ctrl+C cancela el turno en curso y, en el
prompt, cierra la sesión con código 130.
`;

/**
 * Interpreta una línea del REPL.
 *
 * Recorta los extremos. Los comandos distinguen mayúsculas y deben ocupar la
 * línea completa; cualquier otro texto, incluido `/desconocido`, es un prompt.
 */
export function parseChatCommand(line: string): ChatCommand {
  const text = line.trim();

  switch (text) {
    case "/salir":
      return { kind: "exit" };
    case "/limpiar":
      return { kind: "clear" };
    case "/ayuda":
      return { kind: "help" };
    default:
      return { kind: "prompt", text };
  }
}
