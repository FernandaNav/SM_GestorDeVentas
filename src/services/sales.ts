export interface SaleItem {
  id: number;
  desc: string;
  cat: string;
  qty: number;
  price: number;
  commission: string;
}

export interface SaleRecord {
  id: string | number;
  time: string;
  timestamp: number;
  product: string;
  category: string;
  seller: string;
  paymentMethod: string;
  amount: number;
  commission: string;
  invoiced: boolean;
  locked: boolean;
  clientName?: string;
  clientId?: string;
  clientAddress?: string;
  observations?: string;
  items?: SaleItem[];
}

export interface ExpenseRecord {
  id: string | number;
  date: string;
  timestamp: number;
  description: string;
  category: string;
  amount: number;
}

export type WorkshopStatus = "Recibida" | "En reparación" | "Lista para entregar" | "Entregada";

export interface WorkshopOrder {
  id: string;
  client: string;
  phone: string;
  moto: string;
  work: string;
  mechanic: string;
  status: WorkshopStatus;
  cost: number;
  costType: "estimado" | "final" | "cobrado";
  log: { ts: string; event: string }[];
}

const SALES_STORAGE_KEY = "solomotos_sales_records";
const EXPENSES_STORAGE_KEY = "solomotos_expenses_records";
const WORKSHOP_STORAGE_KEY = "solomotos_workshop_orders";

export const salesStorage = {
  getSales(): SaleRecord[] {
    try {
      const data = localStorage.getItem(SALES_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveSales(sales: SaleRecord[]): void {
    try {
      localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(sales));
    } catch (error) {
      console.warn("Error saving sales to localStorage:", error);
    }
  },

  getExpenses(): ExpenseRecord[] {
    try {
      const data = localStorage.getItem(EXPENSES_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveExpenses(expenses: ExpenseRecord[]): void {
    try {
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(expenses));
    } catch (error) {
      console.warn("Error saving expenses to localStorage:", error);
    }
  },

  getWorkshopOrders(): WorkshopOrder[] {
    try {
      const data = localStorage.getItem(WORKSHOP_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveWorkshopOrders(orders: WorkshopOrder[]): void {
    try {
      localStorage.setItem(WORKSHOP_STORAGE_KEY, JSON.stringify(orders));
    } catch (error) {
      console.warn("Error saving workshop orders to localStorage:", error);
    }
  },
};
