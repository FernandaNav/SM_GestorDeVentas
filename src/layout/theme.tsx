import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = { dark: boolean; setDark: (dark: boolean) => void };

const ThemeContext = createContext<Theme | null>(null);
const STORAGE_KEY = "solomotos.theme";

// Preferencia de cada computadora: se guarda en el navegador, no en la base de datos.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [saved] = useState(readSaved);
  const [dark, setDark] = useState(saved.dark);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ dark }));
    } catch {
      // sin almacenamiento: el tema simplemente no se recuerda
    }
  }, [dark]);

  return <ThemeContext.Provider value={{ dark, setDark }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return context;
}

function readSaved(): { dark: boolean } {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { dark: parsed.dark === true };
  } catch {
    return { dark: false };
  }
}
