// Fondo animado del panel oscuro del login: rayitas que cruzan como velocidad, un brillo
// naranja que "respira" y una línea punteada de carretera. Es solo decoración.
const STREAK_COUNT = 26;

// Se calculan una sola vez al cargar la página: cada rayita con su altura, largo y ritmo
const STREAKS = Array.from({ length: STREAK_COUNT }, (_, index) => ({
  id: index,
  light: Math.random() < 0.35,
  // Entre el logo y "Quetzaltenango, Guatemala", para no tacharlos
  top: `${18 + Math.random() * 66}%`,
  width: `${140 + Math.random() * 420}px`,
  duration: `${1.6 + Math.random() * 2.6}s`,
  // Negativo: cada rayita arranca a medio camino y no aparecen todas juntas al cargar
  delay: `${-Math.random() * 4}s`,
}));

export default function LoginSpeedLines() {
  return (
    <div className="login-fx" aria-hidden="true">
      <div className="login-glow" />
      {STREAKS.map((streak) => (
        <span
          key={streak.id}
          className={streak.light ? "login-streak light" : "login-streak"}
          style={{ top: streak.top, width: streak.width, animationDuration: streak.duration, animationDelay: streak.delay }}
        />
      ))}
      <div className="login-road" />
    </div>
  );
}
