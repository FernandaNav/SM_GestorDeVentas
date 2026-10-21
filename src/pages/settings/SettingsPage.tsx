import { useState } from "react";
import { Button, Card, Icon, TextArea, TextInput } from "@/components/ui";
import logo from "@/imports/solomotos-logo.png";
import { type Accent, ACCENTS } from "@/layout/theme";

export default function Settings({
  dark,
  onSetDark,
  accent,
  onSetAccent,
}: {
  dark: boolean;
  onSetDark: (d: boolean) => void;
  accent: Accent;
  onSetAccent: (a: Accent) => void;
}) {
  const commissionCategories = [
    { label: "Accesorio", key: "Accesorio", default: "2.5" },
    { label: "Repuesto", key: "Repuesto", default: "2.5" },
    { label: "Moto nueva", key: "Moto nueva", default: "" },
    { label: "Moto usada", key: "Moto usada", default: "" },
    { label: "Otro", key: "Otro", default: "" },
  ];
  const [categoryCommissions, setCategoryCommissions] = useState<Record<string, string>>(
    Object.fromEntries(commissionCategories.map((c) => [c.key, c.default]))
  );

  return (
    <div className="settings-layout">
      <div className="screen-stack">
        <Card className="form-card">
          <div className="card-heading">
            <div>
              <div className="card-title">Comisiones por categoría</div>
              <div className="muted small">Porcentaje sugerido por categoría (opcional). Se aplica al registrar una venta.</div>
            </div>
            <Icon name="coins" />
          </div>
          <div className="settings-rows">
            {commissionCategories.map((c) => (
              <div key={c.key}>
                <strong>{c.label}</strong>
                <TextInput
                  value={categoryCommissions[c.key]}
                  placeholder="Sin definir"
                  onChange={(v) => setCategoryCommissions({ ...categoryCommissions, [c.key]: v })}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card className="form-card">
          <div className="card-title">Control de facturación</div>
          <TextInput label="Límite mensual de facturas" value="200" />
          <div className="notice">
            <Icon name="file" size="sm" />
            <span>Incluye facturas de ventas y de taller. Recibirás una alerta al alcanzar el 80% del límite.</span>
          </div>
        </Card>

        <Card className="form-card">
          <div className="card-title">Apariencia</div>
          <div className="muted small" style={{ marginBottom: "1.25rem" }}>Selecciona el tema visual del sistema.</div>
          <div className="theme-selector">
            <button type="button" className={`theme-option${!dark ? " active" : ""}`} onClick={() => onSetDark(false)}>
              <div className="theme-preview light-preview"><div /><div /><div /></div>
              <div className="theme-option-label"><Icon name="sun" size="sm" /><span>Claro</span></div>
            </button>
            <button type="button" className={`theme-option${dark ? " active" : ""}`} onClick={() => onSetDark(true)}>
              <div className="theme-preview dark-preview"><div /><div /><div /></div>
              <div className="theme-option-label"><Icon name="moon" size="sm" /><span>Oscuro</span></div>
            </button>
          </div>
          <div className="field-label" style={{ margin: "1.5rem 0 0.35rem" }}>Color principal</div>
          <div className="muted small" style={{ marginBottom: "0.9rem" }}>Se aplica a botones, menú, gráficas y al inicio de sesión.</div>
          <div className="accent-selector">
            {ACCENTS.map((a) => (
              <button
                type="button"
                key={a.id}
                className={`accent-option${accent === a.id ? " active" : ""}`}
                onClick={() => onSetAccent(a.id)}
              >
                <span className="accent-swatch" style={{ background: a.swatch }}>
                  {accent === a.id && <Icon name="check" size="sm" />}
                </span>
                <span>
                  <span>{a.label}</span>
                  <small>{a.note}</small>
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card className="form-card">
        <div className="card-title">Datos de la empresa</div>
        <div className="logo-uploader">
          <img className="brand-logo" src={logo} alt="SoloMotos" />
          <div>
            <strong>Logo de la empresa</strong>
            <span>PNG o JPG, máximo 2 MB</span>
            <Button variant="secondary">Cambiar logo</Button>
          </div>
        </div>
        <div className="vertical-form">
          <TextInput label="Nombre comercial" value="SoloMotos Quetzaltenango" />
          <TextInput label="NIT" value="8214573-6" />
          <TextArea label="Dirección" value="7a. calle 4-63, zona 2, Quetzaltenango" />
          <TextInput label="Teléfono" value="+502 7765 4321" />
          <Button icon="check">Guardar configuración</Button>
        </div>
      </Card>
    </div>
  );
}
