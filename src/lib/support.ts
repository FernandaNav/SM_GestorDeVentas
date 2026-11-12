import type { Role } from "@shared/constants";

/** Correo del equipo que da mantenimiento al sistema. */
export const SUPPORT_EMAIL = "soporte.gestorventas@gmail.com";

/**
 * Enlace que abre Gmail con un correo listo para soporte. El correo ya trae el perfil, la
 * pantalla y la hora, para entender el problema sin tener que preguntarlo.
 * Se arma al hacer clic (no al dibujar la página) para que la hora sea la del momento.
 */
export function supportMailUrl({ role, page }: { role?: Role; page?: string } = {}): string {
  const subject = role ? `Soporte SoloMotos · ${role}` : "Soporte SoloMotos";
  const sentAt = new Date().toLocaleString("es-GT", { dateStyle: "long", timeStyle: "short" });
  const body = [
    "Describe qué pasó o qué necesitas:",
    "",
    "",
    "",
    "— Datos para el equipo de soporte —",
    role && `Perfil: ${role}`,
    page && `Pantalla: ${page}`,
    `Fecha y hora: ${sentAt}`,
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");

  const query = [
    ["view", "cm"],
    ["fs", "1"],
    ["to", SUPPORT_EMAIL],
    ["su", subject],
    ["body", body],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `https://mail.google.com/mail/?${query}`;
}
