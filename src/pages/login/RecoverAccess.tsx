import { useState } from "react";
import { recoverPasswordSchema } from "@shared/schemas/auth";
import { authApi } from "@/api/auth";
import { ApiError } from "@/api/client";
import RecoveryCodeBox from "@/components/RecoveryCodeBox";
import { Button, TextInput } from "@/components/ui";
import { issuesToErrors } from "@/lib/validation";

/**
 * El Administrador olvidó su contraseña: con su código de recuperación pone una nueva.
 * El código se gasta, así que al terminar se muestra el código nuevo para guardarlo.
 */
export default function RecoverAccess({ onDone, onContactSupport }: { onDone: () => void; onContactSupport: () => void }) {
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nextCode, setNextCode] = useState<string | null>(null);

  const handleSubmit = async () => {
    setFormError(null);
    const parsed = recoverPasswordSchema.safeParse({ code, newPassword });
    const fieldErrors: Record<string, string> = parsed.success ? {} : issuesToErrors(parsed.error.issues);
    if (newPassword && confirmPassword !== newPassword) fieldErrors.confirm = "Las contraseñas no coinciden";
    setErrors(fieldErrors);
    if (!parsed.success || fieldErrors.confirm) return;

    setSaving(true);
    try {
      const { recoveryCode } = await authApi.recover(parsed.data);
      setNextCode(recoveryCode);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "No se pudo cambiar la contraseña");
    } finally {
      setSaving(false);
    }
  };

  if (nextCode) {
    return (
      <>
        <div className="login-title">Contraseña cambiada</div>
        <div className="muted">Este es tu nuevo código de recuperación. El que usaste ya no sirve.</div>
        <div className="vertical-form">
          <RecoveryCodeBox code={nextCode} />
          <Button onClick={onDone}>Ya lo guardé, iniciar sesión</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="login-title">Recuperar acceso</div>
      <div className="muted">Escribe el código de recuperación del Administrador y tu nueva contraseña.</div>
      <div className="vertical-form">
        <TextInput label="Código de recuperación" value={code} onChange={setCode} placeholder="XXXX-XXXX-XXXX" icon="lock" error={errors.code} />
        <TextInput label="Nueva contraseña" type="password" value={newPassword} onChange={setNewPassword} error={errors.newPassword} />
        <TextInput label="Repite la contraseña" type="password" value={confirmPassword} onChange={setConfirmPassword} error={errors.confirm} />
        {formError && <div className="cf-warning">{formError}</div>}
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Guardando..." : "Cambiar contraseña"}
        </Button>
        <div className="login-help" style={{ alignItems: "center", textAlign: "center" }}>
          <button type="button" className="picker-link" onClick={onDone}>
            Volver al inicio de sesión
          </button>
          <span className="muted small">
            ¿No tienes el código?{" "}
            <button type="button" className="picker-link" onClick={onContactSupport}>
              Escríbenos
            </button>
          </span>
        </div>
      </div>
    </>
  );
}
