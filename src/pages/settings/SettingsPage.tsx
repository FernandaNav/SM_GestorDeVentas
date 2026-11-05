import { useEffect, useState } from "react";
import { ROLES, type Role } from "@shared/constants";
import { changePasswordSchema } from "@shared/schemas/auth";
import { categoryCommissionSchema, categoryCreateSchema, settingsInputSchema } from "@shared/schemas/settings";
import { categoriesApi } from "@/api/categories";
import { ApiError } from "@/api/client";
import { settingsApi } from "@/api/settings";
import { Badge, Button, Card, Icon, Select, TextArea, TextInput } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import logo from "@/imports/solomotos-logo.png";
import { issuesToErrors } from "@/lib/validation";

type Errors = Record<string, string>;
type Status = { ok?: string; error?: string };

export default function SettingsPage({ dark, onSetDark }: { dark: boolean; onSetDark: (d: boolean) => void }) {
  // Sin recarga automática: si no, lo que se está escribiendo se reemplazaría cada 10 s
  const { data: settings, refetch: refetchSettings } = useApiQuery("settings", settingsApi.get, { poll: false });
  const { data: categoriesData, refetch: refetchCategories } = useApiQuery("settings:categories", categoriesApi.list, {
    poll: false,
  });
  const categories = categoriesData ?? [];

  // ─── datos de la empresa y control de facturación ─────────────────────────
  const [form, setForm] = useState({
    companyName: "",
    taxId: "",
    address: "",
    phone: "",
    monthlyInvoiceLimit: "",
    invoiceAlertPercent: "",
  });
  const [formErrors, setFormErrors] = useState<Errors>({});
  const [formStatus, setFormStatus] = useState<Status>({});
  const [savingForm, setSavingForm] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setForm({
      companyName: settings.companyName,
      taxId: settings.taxId,
      address: settings.address,
      phone: settings.phone ?? "",
      monthlyInvoiceLimit: String(settings.monthlyInvoiceLimit),
      invoiceAlertPercent: String(settings.invoiceAlertPercent),
    });
  }, [settings]);

  const setField = (field: keyof typeof form) => (value: string) => setForm({ ...form, [field]: value });

  const handleSaveSettings = async () => {
    setFormStatus({});
    const parsed = settingsInputSchema.safeParse({
      ...form,
      monthlyInvoiceLimit: form.monthlyInvoiceLimit.trim() === "" ? undefined : Number(form.monthlyInvoiceLimit),
      invoiceAlertPercent: form.invoiceAlertPercent.trim() === "" ? undefined : Number(form.invoiceAlertPercent),
    });
    if (!parsed.success) {
      setFormErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setFormErrors({});
    setSavingForm(true);
    try {
      await settingsApi.update(parsed.data);
      await refetchSettings();
      setFormStatus({ ok: "Configuración guardada" });
    } catch (err) {
      if (err instanceof ApiError) setFormErrors(err.fields);
      setFormStatus({ error: err instanceof ApiError ? err.message : "No se pudo guardar" });
    } finally {
      setSavingForm(false);
    }
  };

  // ─── comisiones por categoría (RNF 7.1) ───────────────────────────────────
  const [rates, setRates] = useState<Record<number, string>>({});
  const [rateErrors, setRateErrors] = useState<Record<number, string>>({});
  const [ratesStatus, setRatesStatus] = useState<Status>({});
  const [savingRates, setSavingRates] = useState(false);

  useEffect(() => {
    if (!categoriesData) return;
    // Conserva lo que se está escribiendo; solo llena las categorías que aún no tienen valor en pantalla
    setRates((prev) =>
      Object.fromEntries(categoriesData.map((c) => [c.id, prev[c.id] ?? c.defaultCommissionRate?.toString() ?? ""])),
    );
  }, [categoriesData]);

  const handleSaveRates = async () => {
    setRatesStatus({});
    const errors: Record<number, string> = {};
    const changes: { id: number; rate: number | null }[] = [];

    for (const category of categories) {
      const text = (rates[category.id] ?? "").trim().replace("%", "");
      const parsed = categoryCommissionSchema.safeParse({ defaultCommissionRate: text === "" ? null : Number(text) });
      if (!parsed.success) {
        errors[category.id] = parsed.error.issues[0].message;
        continue;
      }
      if (parsed.data.defaultCommissionRate !== category.defaultCommissionRate) {
        changes.push({ id: category.id, rate: parsed.data.defaultCommissionRate });
      }
    }
    setRateErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (changes.length === 0) {
      setRatesStatus({ ok: "No hay cambios que guardar" });
      return;
    }

    setSavingRates(true);
    try {
      for (const change of changes) await settingsApi.updateCommission(change.id, change.rate);
      setRates((prev) => ({ ...prev, ...Object.fromEntries(changes.map((change) => [change.id, change.rate?.toString() ?? ""])) }));
      await refetchCategories();
      setRatesStatus({ ok: "Comisiones guardadas. Se aplican a las ventas nuevas." });
    } catch (err) {
      setRatesStatus({ error: err instanceof ApiError ? err.message : "No se pudo guardar" });
    } finally {
      setSavingRates(false);
    }
  };

  // ─── agregar y activar categorías ─────────────────────────────────────────
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryRate, setNewCategoryRate] = useState("");
  const [newCategoryErrors, setNewCategoryErrors] = useState<Errors>({});
  const [categoryStatus, setCategoryStatus] = useState<Status>({});
  const [savingCategory, setSavingCategory] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const handleAddCategory = async () => {
    setCategoryStatus({});
    const rateText = newCategoryRate.trim().replace("%", "");
    const parsed = categoryCreateSchema.safeParse({ name: newCategoryName, defaultCommissionRate: rateText === "" ? null : Number(rateText) });
    if (!parsed.success) {
      setNewCategoryErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setNewCategoryErrors({});
    setSavingCategory(true);
    try {
      const created = await settingsApi.createCategory(parsed.data);
      setNewCategoryName("");
      setNewCategoryRate("");
      await refetchCategories();
      setCategoryStatus({ ok: `Categoría "${created.name}" agregada. Ya se puede elegir en ventas y en taller.` });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setNewCategoryErrors(err.fields);
      setCategoryStatus({ error: err instanceof ApiError ? err.message : "No se pudo agregar" });
    } finally {
      setSavingCategory(false);
    }
  };

  const handleToggleCategory = async (id: number, isActive: boolean) => {
    setCategoryStatus({});
    setTogglingId(id);
    try {
      const updated = await settingsApi.setCategoryActive(id, isActive);
      await refetchCategories();
      setCategoryStatus({
        ok: isActive
          ? `"${updated.name}" vuelve a estar disponible`
          : `"${updated.name}" ya no se ofrece en ventas nuevas; las ventas pasadas la conservan`,
      });
    } catch (err) {
      setCategoryStatus({ error: err instanceof ApiError ? err.message : "No se pudo actualizar" });
    } finally {
      setTogglingId(null);
    }
  };

  // ─── contraseñas ──────────────────────────────────────────────────────────
  const [passwordRole, setPasswordRole] = useState<Role>("Empleado");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<Errors>({});
  const [passwordStatus, setPasswordStatus] = useState<Status>({});
  const [savingPassword, setSavingPassword] = useState(false);

  const handleChangePassword = async () => {
    setPasswordStatus({});
    const parsed = changePasswordSchema.safeParse({ role: passwordRole, newPassword });
    if (!parsed.success) {
      setPasswordErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErrors({ confirm: "Las contraseñas no coinciden" });
      return;
    }
    setPasswordErrors({});
    setSavingPassword(true);
    try {
      await settingsApi.changePassword(parsed.data.role, parsed.data.newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus({ ok: `Contraseña de ${parsed.data.role} actualizada` });
    } catch (err) {
      setPasswordStatus({ error: err instanceof ApiError ? err.message : "No se pudo cambiar" });
    } finally {
      setSavingPassword(false);
    }
  };

  const statusLine = (status: Status) =>
    status.error ? <div className="cf-warning">{status.error}</div> : status.ok ? <div className="muted small">✓ {status.ok}</div> : null;

  return (
    <div className="settings-layout">
      <div className="screen-stack">
        <Card className="form-card">
          <div className="card-heading">
            <div>
              <div className="card-title">Categorías y comisiones</div>
              <div className="muted small">
                Porcentaje que se aplica solo al registrar una venta. Vacío = se asigna a mano en cada venta (motos). Las
                categorías no se eliminan: al desactivarlas dejan de ofrecerse, pero las ventas pasadas las conservan.
              </div>
            </div>
            <Icon name="coins" />
          </div>
          <div className="settings-rows">
            {categories.map((category) => (
              <div key={category.id} className={category.isActive ? "" : "category-inactive"}>
                <div className="category-name">
                  <strong>{category.name}</strong>
                  {!category.isActive && <Badge tone="neutral">Inactiva</Badge>}
                </div>
                <div className="category-controls">
                  <TextInput
                    value={rates[category.id] ?? ""}
                    placeholder="Sin definir"
                    onChange={(value) => setRates({ ...rates, [category.id]: value })}
                    error={rateErrors[category.id]}
                  />
                  <button
                    type="button"
                    className={`person-toggle ${category.isActive ? "on" : ""}`}
                    onClick={() => handleToggleCategory(category.id, !category.isActive)}
                    disabled={togglingId === category.id}
                    title={category.isActive ? "Activa: haz clic para desactivarla" : "Inactiva: haz clic para activarla"}
                  >
                    <span />
                    <span className="toggle-label">{category.isActive ? "Activa" : "Inactiva"}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          {statusLine(ratesStatus)}
          <Button icon="check" onClick={handleSaveRates} disabled={savingRates}>
            {savingRates ? "Guardando..." : "Guardar comisiones"}
          </Button>

          <div className="category-add">
            <div className="field-label">Agregar categoría</div>
            <div className="category-add-row">
              <TextInput placeholder="Ej. Llantas, Lubricantes" value={newCategoryName} onChange={setNewCategoryName} error={newCategoryErrors.name} />
              <TextInput
                placeholder="Comisión % (opcional)"
                value={newCategoryRate}
                onChange={setNewCategoryRate}
                error={newCategoryErrors.defaultCommissionRate}
              />
              <Button icon="plus" variant="secondary" onClick={handleAddCategory} disabled={savingCategory}>
                {savingCategory ? "Agregando..." : "Agregar"}
              </Button>
            </div>
          </div>
          {statusLine(categoryStatus)}
        </Card>

        <Card className="form-card">
          <div className="card-title">Control de facturación</div>
          <div className="vertical-form">
            <TextInput
              label="Límite mensual de facturas"
              value={form.monthlyInvoiceLimit}
              onChange={setField("monthlyInvoiceLimit")}
              error={formErrors.monthlyInvoiceLimit}
            />
            <TextInput
              label="Avisar al llegar al (%)"
              value={form.invoiceAlertPercent}
              onChange={setField("invoiceAlertPercent")}
              error={formErrors.invoiceAlertPercent}
            />
            <div className="notice">
              <Icon name="file" size="sm" />
              <span>
                Incluye facturas de ventas y de taller. Recibirás una alerta al alcanzar el {form.invoiceAlertPercent || "80"}% del
                límite.
              </span>
            </div>
            <Button icon="check" onClick={handleSaveSettings} disabled={savingForm || !settings}>
              {savingForm ? "Guardando..." : "Guardar límite"}
            </Button>
          </div>
        </Card>

        <Card className="form-card">
          <div className="card-title">Contraseñas</div>
          <div className="muted small">No hay recuperación por correo: el administrador cambia la contraseña de cada cuenta.</div>
          <div className="vertical-form">
            <Select
              label="Cuenta"
              value={passwordRole}
              options={[...ROLES]}
              onChange={(value) => setPasswordRole(value as Role)}
            />
            <TextInput
              label="Nueva contraseña"
              type="password"
              value={newPassword}
              onChange={setNewPassword}
              error={passwordErrors.newPassword}
            />
            <TextInput
              label="Repite la contraseña"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              error={passwordErrors.confirm}
            />
            {statusLine(passwordStatus)}
            <Button icon="lock" onClick={handleChangePassword} disabled={savingPassword || !newPassword}>
              {savingPassword ? "Guardando..." : "Cambiar contraseña"}
            </Button>
          </div>
        </Card>

        <Card className="form-card">
          <div className="card-title">Apariencia</div>
          <div className="muted small" style={{ marginBottom: "1.25rem" }}>
            Selecciona el tema visual del sistema.
          </div>
          <div className="theme-selector">
            <button type="button" className={`theme-option${!dark ? " active" : ""}`} onClick={() => onSetDark(false)}>
              <div className="theme-preview light-preview">
                <div />
                <div />
                <div />
              </div>
              <div className="theme-option-label">
                <Icon name="sun" size="sm" />
                <span>Claro</span>
              </div>
            </button>
            <button type="button" className={`theme-option${dark ? " active" : ""}`} onClick={() => onSetDark(true)}>
              <div className="theme-preview dark-preview">
                <div />
                <div />
                <div />
              </div>
              <div className="theme-option-label">
                <Icon name="moon" size="sm" />
                <span>Oscuro</span>
              </div>
            </button>
          </div>
        </Card>
      </div>

      <Card className="form-card">
        <div className="card-title">Datos de la empresa</div>
        <div className="muted small">Aparecen en la factura personalizada.</div>
        <div className="logo-uploader">
          <img className="brand-logo" src={logo} alt="SoloMotos" />
          <div>
            <strong>Logo de la empresa</strong>
            <span>El logo actual se usa en la factura.</span>
          </div>
        </div>
        <div className="vertical-form">
          <TextInput label="Nombre comercial" value={form.companyName} onChange={setField("companyName")} error={formErrors.companyName} />
          <TextInput label="NIT" value={form.taxId} onChange={setField("taxId")} error={formErrors.taxId} />
          <TextArea label="Dirección" value={form.address} onChange={setField("address")} />
          {formErrors.address && <span className="field-error">{formErrors.address}</span>}
          <TextInput label="Teléfono (opcional)" value={form.phone} onChange={setField("phone")} error={formErrors.phone} />
          {statusLine(formStatus)}
          <Button icon="check" onClick={handleSaveSettings} disabled={savingForm || !settings}>
            {savingForm ? "Guardando..." : "Guardar configuración"}
          </Button>
        </div>
      </Card>
    </div>
  );
}