import { createInterface as createLineReader } from "node:readline";
import { createInterface } from "node:readline/promises";

/** Pregunta por consola y devuelve la respuesta. */
export async function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) return readPipedLine(question);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

// Con la entrada redirigida (ej. `printf ... | pnpm db:seed-users`) se lee siempre del
// mismo lector: si se creara uno por pregunta, las líneas ya leídas se perderían.
let pipedLines: AsyncIterator<string> | undefined;
async function readPipedLine(question: string): Promise<string> {
  process.stdout.write(question);
  pipedLines ??= createLineReader({ input: process.stdin })[Symbol.asyncIterator]();
  const { value = "" } = await pipedLines.next();
  process.stdout.write("\n");
  return value.trim();
}

/**
 * Pregunta una contraseña sin mostrar lo que se escribe (ni asteriscos).
 * Lee tecla por tecla en modo "raw" de la terminal; Ctrl+C cancela el script.
 */
export function askHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  // Sin terminal interactiva no hay nada que ocultar
  if (!stdin.isTTY) return readPipedLine(question);

  stdout.write(question);
  return new Promise((resolve) => {
    let value = "";
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          finish();
          resolve(value.trim());
          return;
        }
        if (char === "\u0003") {
          finish();
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    stdin.on("data", onData);
  });
}

export async function askNewPassword(label: string): Promise<string> {
  for (;;) {
    const password = await askHidden(`Nueva contraseña para ${label} (no se verá al escribir): `);
    if (password.length < 8) {
      console.log("Debe tener al menos 8 caracteres.");
      continue;
    }
    const confirmation = await askHidden("Repite la contraseña: ");
    if (password === confirmation) return password;
    console.log("No coinciden, intenta de nuevo.");
  }
}
