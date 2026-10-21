export interface DashboardKPIs {
  todaySales: {
    value: number;
    comparisonText: string;
    isPositive: boolean;
    count: number;
  };
  monthSales: {
    value: number;
    comparisonText: string;
    isPositive: boolean;
    count: number;
  };
  monthCommissions: {
    value: number;
    pendingCount: number;
    text: string;
  };
  monthExpenses: {
    value: number;
    count: number;
    text: string;
  };
  invoices: {
    issued: number;
    limit: number;
    available: number;
    percentage: number;
  };
}

export interface RecentSaleRow {
  id: string;
  time: string;
  product: string;
  category: string;
  seller: string;
  paymentMethod: string;
  amount: number;
  commission: string;
  isInvoiced: boolean;
  invoiceStatus: "Facturada" | "No facturada";
}

export interface DashboardSummary {
  kpis: DashboardKPIs;
  recentSales: RecentSaleRow[];
  isFallback: boolean;
}

export interface SellerPerformance {
  name: string;
  shortName: string;
  amount: number;
  salesCount: number;
  colorClass: string;
}

export interface SellersSummary {
  period: string;
  sellers: SellerPerformance[];
  totalAmount: number;
  totalSales: number;
  averageTicket: number;
}

export interface SalesVsExpensesPoint {
  label: string;
  sales: number;
  expenses: number;
}

export interface SalesVsExpensesData {
  labels: string[];
  points: SalesVsExpensesPoint[];
}

export interface CreateSalePayload {
  clientName?: string;
  clientNit?: string;
  clientAddress?: string;
  sellerName: string;
  productSummary: string;
  category: string;
  paymentMethod: string;
  total: number;
  commissionPercentage?: number;
  isInvoiced: boolean;
  observations?: string;
}

export const dashboardService = {
  async getSummary(): Promise<DashboardSummary | null> {
    try {
      const response = await fetch("/api/dashboard/summary");
      if (!response.ok) return null;
      const json = await response.json();
      return json.data as DashboardSummary;
    } catch (error) {
      console.warn("Could not connect to /api/dashboard/summary:", error);
      return null;
    }
  },

  async getSellers(monthPeriod: "current" | "previous" = "current"): Promise<SellersSummary | null> {
    try {
      const response = await fetch(`/api/dashboard/sellers?month=${monthPeriod}`);
      if (!response.ok) return null;
      const json = await response.json();
      return json.data as SellersSummary;
    } catch (error) {
      console.warn("Could not connect to /api/dashboard/sellers:", error);
      return null;
    }
  },

  async getSalesVsExpenses(): Promise<SalesVsExpensesData | null> {
    try {
      const response = await fetch("/api/dashboard/sales-vs-expenses");
      if (!response.ok) return null;
      const json = await response.json();
      return json.data as SalesVsExpensesData;
    } catch (error) {
      console.warn("Could not connect to /api/dashboard/sales-vs-expenses:", error);
      return null;
    }
  },

  async createSale(payload: CreateSalePayload): Promise<any> {
    try {
      const response = await fetch("/api/dashboard/sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_nombre: payload.clientName,
          cliente_nit: payload.clientNit,
          vendedor_nombre: payload.sellerName,
          producto_resumen: payload.productSummary,
          categoria: payload.category,
          metodo_pago: payload.paymentMethod,
          total: payload.total,
          comision_porcentaje: payload.commissionPercentage,
          facturada: payload.isInvoiced,
        }),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.warn("Could not send sale to /api/dashboard/sale:", error);
      return null;
    }
  },
};
