import { createInterface } from "node:readline/promises";

/** Pregunta por consola. Para contraseñas la respuesta no se muestra en pantalla. */
export async function ask(question: string, { hidden = false } = {}): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // Reemplaza lo que se escribe por nada mientras se lee la respuesta
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (text) => {
      if (text.includes(question)) process.stdout.write(text);
    };
  }
  const answer = await rl.question(question);
  rl.close();
  if (hidden) process.stdout.write("\n");
  return answer.trim();
}

export async function askNewPassword(label: string): Promise<string> {
  for (;;) {
    const password = await ask(`Nueva contraseña para ${label}: `, { hidden: true });
    if (password.length < 8) {
      console.log("Debe tener al menos 8 caracteres.");
      continue;
    }
    const confirmation = await ask("Repite la contraseña: ", { hidden: true });
    if (password === confirmation) return password;
    console.log("No coinciden, intenta de nuevo.");
  }
}
