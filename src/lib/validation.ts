/** Convierte los errores de un esquema zod en { "campo.anidado": "mensaje" } para el formulario. */
export const issuesToErrors = (issues: { path: (string | number)[]; message: string }[]): Record<string, string> =>
  Object.fromEntries(issues.map((issue) => [issue.path.join("."), issue.message]));
