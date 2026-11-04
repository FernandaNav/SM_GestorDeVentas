import { useState } from "react";
import { EXPENSE_AREAS, EXPENSE_CATEGORIES, type ExpenseArea, type ExpenseCategory } from "@shared/constants";
import { expenseInputSchema, type Expense } from "@shared/schemas/expenses";
import { ApiError } from "@/api/client";
import { expensesApi } from "@/api/expenses";
import Pagination from "@/components/Pagination";
import Segmented from "@/components/Segmented";
import { DatePicker, endOfMonth, fmtDay, MonthPicker, startOfDay, startOfMonth } from "@/components/dates";
import { Badge, Button, Card, Icon, IconButton, Modal, Select, TextArea, TextInput } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { formatQuetzales } from "@/lib/format";
import { issuesToErrors } from "@/lib/validation";

/** Date → "AAAA-MM-DD" con la fecha local (no UTC) */
const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** "AAAA-MM-DD" → Date local, para mostrarla */
const fromIsoDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const PAGE_SIZE = 20;
const AREA_FILTERS = ["Todas", ...EXPENSE_AREAS];

export default function ExpensesPage() {
  // ─── formulario ───────────────────────────────────────────────────────────
  const [expenseDate, setExpenseDate] = useState(() => startOfDay(new Date()));
  const [amount, setAmount] = useState("");
  const [area, setArea] = useState<ExpenseArea>("Tienda");
  const [category, setCategory] = useState<ExpenseCategory>("Servicios");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Con un gasto aquí, el formulario lo edita en vez de registrar uno nuevo
  const [editing, setEditing] = useState<Expense | null>(null);

  // ─── lista: mes, filtro por área y página ─────────────────────────────────
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [areaFilter, setAreaFilter] = useState("Todas");
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<Expense | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const range = { from: toIsoDate(month), to: toIsoDate(endOfMonth(month)) };
  const filterArea = areaFilter === "Todas" ? undefined : (areaFilter as ExpenseArea);
  const { data, loading, error, refetch } = useApiQuery(`expenses:${range.from}:${areaFilter}:${page}`, () =>
    expensesApi.list(range, page, filterArea, PAGE_SIZE),
  );
  const expenses = data?.items ?? [];

  // Al cambiar de mes o de área se vuelve a la primera página
  const changeMonth = (value: Date) => {
    setMonth(value);
    setPage(1);
  };
  const changeAreaFilter = (value: string) => {
    setAreaFilter(value);
    setPage(1);
  };

  const resetForm = () => {
    setEditing(null);
    setExpenseDate(startOfDay(new Date()));
    setAmount("");
    setArea("Tienda");
    setCategory("Servicios");
    setDescription("");
    setErrors({});
  };

  const startEdit = (expense: Expense) => {
    setEditing(expense);
    setExpenseDate(fromIsoDate(expense.spentOn));
    setAmount(String(expense.amount));
    setArea(expense.area);
    setCategory(expense.category);
    setDescription(expense.description);
    setErrors({});
  };

  const handleSave = async () => {
    const parsed = expenseInputSchema.safeParse({
      spentOn: toIsoDate(expenseDate),
      amount: amount.trim() === "" ? undefined : Number(amount.replace(/[Q,\s]/g, "")),
      area,
      category,
      description,
    });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      if (editing) await expensesApi.update(editing.id, parsed.data);
      else await expensesApi.create(parsed.data);
      resetForm();
      // Se muestra el gasto recién guardado: su mes, la primera página y sin un filtro que lo esconda
      const savedMonth = startOfMonth(expenseDate);
      const hiddenByFilter = filterArea !== undefined && filterArea !== parsed.data.area;
      const alreadyVisible = page === 1 && savedMonth.getTime() === month.getTime() && !hiddenByFilter;
      if (alreadyVisible) {
        await refetch();
      } else {
        setMonth(savedMonth);
        setPage(1);
        if (hiddenByFilter) setAreaFilter("Todas");
      }
    } catch (err) {
      if (err instanceof ApiError) setErrors({ ...err.fields, _form: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setActionError(null);
    try {
      await expensesApi.remove(toDelete.id);
      if (editing?.id === toDelete.id) resetForm();
      // Si era el único gasto de la página, se regresa a la anterior en vez de dejarla vacía
      if (expenses.length === 1 && page > 1) setPage(page - 1);
      else await refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "No se pudo eliminar");
    }
    setToDelete(null);
  };

  return (
    <div className="split-layout">
      <Card className="form-card">
        <div className="card-title">{editing ? "Editar gasto" : "Registrar compra o gasto"}</div>
        <div className="muted small">{editing ? "Corrige los datos y guarda los cambios." : "Agrega una compra o gasto operativo."}</div>
        <div className="vertical-form">
          <div className="field">
            <span className="field-label">Área</span>
            <Segmented options={[...EXPENSE_AREAS]} value={area} onChange={(value) => setArea(value as ExpenseArea)} />
            {errors.area && <span className="field-error">{errors.area}</span>}
          </div>
          <DatePicker label="Fecha" value={expenseDate} onChange={setExpenseDate} max={new Date()} />
          {errors.spentOn && <span className="field-error">{errors.spentOn}</span>}
          <TextInput label="Monto" placeholder="Q 0.00" value={amount} onChange={setAmount} error={errors.amount} />
          <Select
            label="Categoría"
            value={category}
            options={[...EXPENSE_CATEGORIES]}
            onChange={(value) => setCategory(value as ExpenseCategory)}
          />
          <TextArea label="Descripción" placeholder="Detalle del gasto" value={description} onChange={setDescription} />
          {errors.description && <span className="field-error">{errors.description}</span>}
          {errors._form && <span className="field-error">{errors._form}</span>}
          <Button icon={editing ? "check" : "plus"} onClick={handleSave} disabled={saving || !amount || !description.trim()}>
            {saving ? "Guardando..." : editing ? "Guardar cambios" : "Guardar gasto"}
          </Button>
          {editing && (
            <Button variant="secondary" onClick={resetForm} disabled={saving}>
              Cancelar edición
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <div className="card-heading">
          <div>
            <div className="card-title">Gastos registrados</div>
            <div className="muted small">
              Total del mes: <strong>{formatQuetzales(data?.summary.total ?? 0)}</strong> · Tienda{" "}
              {formatQuetzales(data?.summary.byArea.Tienda ?? 0)} · Taller {formatQuetzales(data?.summary.byArea.Taller ?? 0)}
            </div>
          </div>
          <MonthPicker value={month} onChange={changeMonth} />
        </div>

        <div style={{ margin: "0.75rem 0 1rem" }}>
          <Segmented options={AREA_FILTERS} value={areaFilter} onChange={changeAreaFilter} />
        </div>

        {(error || actionError) && <div className="cf-warning">{actionError ?? error?.message}</div>}

        {!loading && expenses.length === 0 && !error ? (
          <div className="empty-state-box">
            <div className="empty-state-icon">
              <Icon name="receipt" />
            </div>
            <div className="empty-state-title">
              {filterArea ? `No hay gastos de ${filterArea} en este mes` : "No hay gastos en este mes"}
            </div>
            <div className="empty-state-desc">Ingresa un gasto en el formulario de la izquierda para registrarlo.</div>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Descripción</th>
                    <th>Área</th>
                    <th>Categoría</th>
                    <th>Monto</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((row) => (
                    <tr key={row.id}>
                      <td>{fmtDay(fromIsoDate(row.spentOn))}</td>
                      <td>
                        <strong>{row.description}</strong>
                      </td>
                      <td>
                        <Badge tone={row.area === "Taller" ? "info" : "neutral"}>{row.area}</Badge>
                      </td>
                      <td>
                        <Badge>{row.category}</Badge>
                      </td>
                      <td>
                        <strong>{formatQuetzales(row.amount)}</strong>
                      </td>
                      <td>
                        <div className="row-actions">
                          <IconButton icon="edit" label="Editar" onClick={() => startEdit(row)} />
                          <IconButton icon="trash" label="Eliminar" onClick={() => setToDelete(row)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && (
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                totalItems={data.totalItems}
                totalPages={data.totalPages}
                onPageChange={setPage}
                noun="gastos"
              />
            )}
          </>
        )}
      </Card>

      <Modal
        open={toDelete !== null}
        title="¿Eliminar este gasto?"
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        confirmLabel="Eliminar"
      >
        {toDelete && (
          <div className="confirm-box">
            <div>
              <span>Descripción</span>
              <strong>{toDelete.description}</strong>
            </div>
            <div>
              <span>Área</span>
              <strong>{toDelete.area}</strong>
            </div>
            <div>
              <span>Monto</span>
              <strong>{formatQuetzales(toDelete.amount)}</strong>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}