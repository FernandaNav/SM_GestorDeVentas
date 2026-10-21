import { useState } from "react";
import { DatePicker, MonthPicker, startOfDay, startOfMonth } from "@/components/dates";
import { Badge, Button, Card, Icon, IconButton, Select, TextArea, TextInput } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";
import type { ExpenseRecord } from "@/temporal/localStore";

export default function Expenses({
  expenses,
  onAddExpense,
  onDeleteExpense,
}: {
  expenses: ExpenseRecord[];
  onAddExpense: (expense: ExpenseRecord) => void;
  onDeleteExpense: (id: string | number) => void;
}) {
  const [expenseDate, setExpenseDate] = useState(() => startOfDay(new Date()));
  const [expenseMonth, setExpenseMonth] = useState(() => startOfMonth(new Date()));
  const [amountInput, setAmountInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("Servicios");
  const [descriptionInput, setDescriptionInput] = useState("");

  const handleSaveExpense = () => {
    const numericAmount = parseFloat(amountInput);
    if (!numericAmount || numericAmount <= 0 || !descriptionInput.trim()) return;

    const newExpense: ExpenseRecord = {
      id: Date.now(),
      date: expenseDate.toLocaleDateString("es-GT", { day: "2-digit", month: "short" }),
      timestamp: expenseDate.getTime(),
      description: descriptionInput.trim(),
      category: categoryInput,
      amount: numericAmount,
    };

    onAddExpense(newExpense);
    setAmountInput("");
    setDescriptionInput("");
  };

  const totalMonthExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);

  return (
    <div className="split-layout">
      <Card className="form-card">
        <div className="card-title">Registrar compra o gasto</div>
        <div className="muted small">Agrega una compra o gasto operativo.</div>
        <div className="vertical-form">
          <DatePicker label="Fecha" value={expenseDate} onChange={setExpenseDate} max={new Date()} />
          <TextInput
            label="Monto"
            placeholder="Q 0.00"
            value={amountInput}
            onChange={setAmountInput}
          />
          <Select
            label="Categoría"
            value={categoryInput}
            options={["Servicios", "Repuestos", "Renta", "Planilla", "Otros"]}
            onChange={setCategoryInput}
          />
          <TextArea
            label="Descripción"
            placeholder="Detalle del gasto"
            value={descriptionInput}
            onChange={setDescriptionInput}
          />
          <Button icon="plus" onClick={handleSaveExpense} disabled={!amountInput || !descriptionInput.trim()}>
            Guardar gasto
          </Button>
        </div>
      </Card>

      <Card>
        <div className="card-heading">
          <div>
            <div className="card-title">Gastos registrados</div>
            <div className="muted small">
              Total: {formatQuetzales(totalMonthExpenses)}
            </div>
          </div>
          <MonthPicker value={expenseMonth} onChange={setExpenseMonth} />
        </div>

        {expenses.length === 0 ? (
          <div className="empty-state-box">
            <div className="empty-state-icon">
              <Icon name="receipt" />
            </div>
            <div className="empty-state-title">No hay gastos registrados</div>
            <div className="empty-state-desc">Ingresa un gasto en el formulario de la izquierda para registrarlo.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th>Monto</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td><strong>{row.description}</strong></td>
                    <td><Badge>{row.category}</Badge></td>
                    <td><strong>{formatQuetzales(row.amount)}</strong></td>
                    <td>
                      <div className="row-actions">
                        <IconButton
                          icon="trash"
                          label="Eliminar"
                          onClick={() => onDeleteExpense(row.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
