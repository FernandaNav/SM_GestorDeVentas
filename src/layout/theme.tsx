import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Accent = "orange" | "burgundy" | "navy";

export const ACCENTS: { id: Accent; label: string; note: string; swatch: string }[] = [
  { id: "orange", label: "Naranja", note: "Color actual", swatch: "#ef4b23" },
  { id: "burgundy", label: "Burgundy", note: "Rojo vino", swatch: "#8c1d3a" },
  { id: "navy", label: "Azul marino", note: "Azul oscuro", swatch: "#1f4e8c" },
];

type Theme = { dark: boolean; setDark: (dark: boolean) => void; accent: Accent; setAccent: (accent: Accent) => void };

const ThemeContext = createContext<Theme | null>(null);
const STORAGE_KEY = "solomotos.theme";

// Preferencia de cada computadora: se guarda en el navegador, no en la base de datos.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [saved] = useState(readSaved);
  const [dark, setDark] = useState(saved.dark);
  const [accent, setAccent] = useState<Accent>(saved.accent);

  useEffect(() => {
    // En <html> para que el color también llegue a la pantalla de login
    document.documentElement.dataset.accent = accent;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ dark, accent }));
    } catch {
      // sin almacenamiento: el tema simplemente no se recuerda
    }
  }, [dark, accent]);

  return <ThemeContext.Provider value={{ dark, setDark, accent, setAccent }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return context;
}

function readSaved(): { dark: boolean; accent: Accent } {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      dark: parsed.dark === true,
      accent: ACCENTS.some((a) => a.id === parsed.accent) ? parsed.accent : "orange",
    };
  } catch {
    return { dark: false, accent: "orange" };
  }
}
