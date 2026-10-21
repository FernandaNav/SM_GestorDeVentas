import { useState } from "react";
import { Navigate, useLocation } from "react-router";
import type { Role } from "@shared/constants";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, Icon, UnstyledButton } from "@/components/ui";
import logo from "@/imports/solomotos-logo.png";
import { homePathFor } from "@/layout/navigation";

export default function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [selectedRole, setSelectedRole] = useState<Role>("Administrador");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Con sesión iniciada (o al terminar el login) va a la pantalla que intentaba abrir, o a su inicio
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? homePathFor(user.role)} replace />;
  }

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    setErrorMessage(null);
  };

  const handleLoginSubmit = async () => {
    if (!password) {
      setErrorMessage("Ingresa tu contraseña.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      await login(selectedRole, password);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "No se pudo iniciar sesión");
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-art">
        <div className="login-brand">
          <img className="brand-logo" src={logo} alt="SoloMotos" />
          <span>Sistema de Ventas</span>
        </div>
        <div className="login-message">
          <div className="login-line" />
          <div>
            Control simple.
            <br />
            Decisiones más rápidas.
          </div>
          <span>Ventas, taller y facturación en un solo lugar.</span>
        </div>
        <div className="login-city">Quetzaltenango, Guatemala</div>
      </div>
      <div className="login-panel">
        <Card className="login-card">
          <div className="login-title">Bienvenido</div>
          <div className="muted">Selecciona tu perfil e ingresa tu contraseña.</div>
          <div className="vertical-form">
            <div className="field">
              <span className="field-label">Perfil de acceso</span>
              <div className="login-role-seg">
                <UnstyledButton
                  className={selectedRole === "Administrador" ? "login-role-btn selected" : "login-role-btn"}
                  onClick={() => handleRoleSelect("Administrador")}
                >
                  <Icon name="settings" size="sm" />
                  <span>Administrador</span>
                </UnstyledButton>
                <UnstyledButton
                  className={selectedRole === "Empleado" ? "login-role-btn selected" : "login-role-btn"}
                  onClick={() => handleRoleSelect("Empleado")}
                >
                  <Icon name="users" size="sm" />
                  <span>Empleado</span>
                </UnstyledButton>
              </div>
            </div>
            <div className="field">
              <span className="field-label">Contraseña</span>
              <span className={`input-shell${errorMessage ? " has-error" : ""}`}>
                <Icon name="lock" size="sm" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  placeholder="••••••••"
                  autoFocus
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMessage(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleLoginSubmit()}
                />
                <button
                  type="button"
                  className="eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  <Icon name="eye" size="sm" />
                </button>
              </span>
              {errorMessage && <span className="field-error">{errorMessage}</span>}
              <div className="forgot-pw">
                <span className="muted small">¿Olvidaste tu contraseña? Contacta al administrador.</span>
              </div>
            </div>
            <Button onClick={handleLoginSubmit} disabled={loading}>
              {loading ? "Verificando..." : "Ingresar"}
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
