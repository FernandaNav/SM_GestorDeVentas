// TEMPORAL: reemplazar por API.
// Guarda ventas, gastos y órdenes de taller en el navegador para que las pantallas que
// todavía no están conectadas al backend sigan funcionando. Estos datos NO se comparten
// entre computadoras. Cada módulo deja de usar este contexto cuando conecta su API, y
// cuando ninguno lo use se borra la carpeta src/temporal completa.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { salesStorage, type ExpenseRecord, type SaleRecord, type WorkshopOrder } from "./localStore";

type LocalData = {
  sales: SaleRecord[];
  expenses: ExpenseRecord[];
  workshopOrders: WorkshopOrder[];
  addSale: (sale: SaleRecord) => void;
  updateSale: (sale: SaleRecord) => void;
  deleteSale: (id: string | number) => void;
  closePeriod: () => void;
  addExpense: (expense: ExpenseRecord) => void;
  deleteExpense: (id: string | number) => void;
  addWorkshopOrder: (order: WorkshopOrder) => void;
  updateWorkshopOrder: (order: WorkshopOrder) => void;
};

const LocalDataContext = createContext<LocalData | null>(null);

export function LocalDataProvider({ children }: { children: ReactNode }) {
  const [sales, setSales] = useState(salesStorage.getSales);
  const [expenses, setExpenses] = useState(salesStorage.getExpenses);
  const [workshopOrders, setWorkshopOrders] = useState(salesStorage.getWorkshopOrders);

  useEffect(() => salesStorage.saveSales(sales), [sales]);
  useEffect(() => salesStorage.saveExpenses(expenses), [expenses]);
  useEffect(() => salesStorage.saveWorkshopOrders(workshopOrders), [workshopOrders]);

  const value: LocalData = {
    sales,
    expenses,
    workshopOrders,
    addSale: (sale) => setSales((prev) => [sale, ...prev]),
    updateSale: (sale) => setSales((prev) => prev.map((s) => (s.id === sale.id ? sale : s))),
    deleteSale: (id) => setSales((prev) => prev.filter((s) => s.id !== id)),
    closePeriod: () => setSales((prev) => prev.map((s) => ({ ...s, locked: true }))),
    addExpense: (expense) => setExpenses((prev) => [expense, ...prev]),
    deleteExpense: (id) => setExpenses((prev) => prev.filter((e) => e.id !== id)),
    addWorkshopOrder: (order) => setWorkshopOrders((prev) => [order, ...prev]),
    updateWorkshopOrder: (order) => setWorkshopOrders((prev) => prev.map((o) => (o.id === order.id ? order : o))),
  };

  return <LocalDataContext.Provider value={value}>{children}</LocalDataContext.Provider>;
}

export function useLocalData(): LocalData {
  const context = useContext(LocalDataContext);
  if (!context) throw new Error("useLocalData debe usarse dentro de <LocalDataProvider>");
  return context;
}
