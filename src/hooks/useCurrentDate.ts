import { useEffect, useState } from "react";

/** Fecha actual; se refresca cada minuto para que cambie sola al pasar la medianoche. */
export function useCurrentDate() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  useEffect(() => {
    const timerId = setInterval(() => setCurrentDate(new Date()), 60_000);
    return () => clearInterval(timerId);
  }, []);
  return currentDate;
}
