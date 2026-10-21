import { supabase, isSupabaseConfigured } from "../config/supabase";

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

export class DashboardService {
  static async getSummary(): Promise<{
    kpis: DashboardKPIs;
    recentSales: RecentSaleRow[];
    isFallback: boolean;
  }> {
    if (isSupabaseConfigured) {
      try {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const { data: sales, error: salesErr } = await supabase
          .from("sales")
          .select("*")
          .order("date", { ascending: false });

        const { data: expenses } = await supabase
          .from("expenses")
          .select("*")
          .gte("date", startOfMonth);

        const { data: config } = await supabase
          .from("settings")
          .select("*")
          .eq("id", "global")
          .maybeSingle();

        if (!salesErr && sales) {
          const todaySalesList = sales.filter((s) => s.date >= startOfToday);
          const monthSalesList = sales.filter((s) => s.date >= startOfMonth);

          const totalToday = todaySalesList.reduce((acc, s) => acc + Number(s.total || 0), 0);
          const totalMonth = monthSalesList.reduce((acc, s) => acc + Number(s.total || 0), 0);
          const totalCommissions = monthSalesList.reduce((acc, s) => acc + Number(s.commission_amount || 0), 0);
          const pendingCommissions = monthSalesList.filter((s) => s.commission_status === "Pendiente" || s.commission_status === "Pending").length;

          const totalExpenses = (expenses || []).reduce((acc, g) => acc + Number(g.amount || 0), 0);
          const countExpenses = expenses?.length || 0;

          const issuedInvoices = monthSalesList.filter((s) => s.is_invoiced).length;
          const invoiceLimit = config?.monthly_invoice_limit || 200;
          const availableInvoices = Math.max(0, invoiceLimit - issuedInvoices);
          const invoicePercentage = invoiceLimit > 0 ? Math.min(100, Math.round((issuedInvoices / invoiceLimit) * 100)) : 0;

          const recentSales: RecentSaleRow[] = sales.slice(0, 5).map((s) => {
            const dateObj = new Date(s.date);
            const time = dateObj.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
            return {
              id: s.id,
              time,
              product: s.product_summary,
              category: s.category,
              seller: s.seller_name,
              paymentMethod: s.payment_method,
              amount: Number(s.total),
              commission: s.commission_amount ? `Q ${Number(s.commission_amount).toFixed(2)}` : "Pendiente",
              isInvoiced: Boolean(s.is_invoiced),
              invoiceStatus: s.is_invoiced ? "Facturada" : "No facturada",
            };
          });

          return {
            kpis: {
              todaySales: {
                value: totalToday,
                comparisonText: todaySalesList.length > 0 ? `${todaySalesList.length} ventas hoy` : "Sin ventas registradas hoy",
                isPositive: todaySalesList.length > 0,
                count: todaySalesList.length,
              },
              monthSales: {
                value: totalMonth,
                comparisonText: monthSalesList.length > 0 ? `${monthSalesList.length} ventas este mes` : "Sin ventas este mes",
                isPositive: monthSalesList.length > 0,
                count: monthSalesList.length,
              },
              monthCommissions: {
                value: totalCommissions,
                pendingCount: pendingCommissions,
                text: pendingCommissions > 0 ? `${pendingCommissions} comisión pendiente` : "Sin comisiones pendientes",
              },
              monthExpenses: {
                value: totalExpenses,
                count: countExpenses,
                text: `${countExpenses} gastos registrados`,
              },
              invoices: {
                issued: issuedInvoices,
                limit: invoiceLimit,
                available: availableInvoices,
                percentage: invoicePercentage,
              },
            },
            recentSales,
            isFallback: false,
          };
        }
      } catch (err) {
        console.warn("Notice querying Supabase in getSummary, returning clean initial state:", err);
      }
    }

    return {
      kpis: {
        todaySales: {
          value: 0,
          comparisonText: "Sin ventas registradas hoy",
          isPositive: false,
          count: 0,
        },
        monthSales: {
          value: 0,
          comparisonText: "Sin ventas este mes",
          isPositive: false,
          count: 0,
        },
        monthCommissions: {
          value: 0,
          pendingCount: 0,
          text: "0 comisiones registradas",
        },
        monthExpenses: {
          value: 0,
          count: 0,
          text: "0 gastos registrados",
        },
        invoices: {
          issued: 0,
          limit: 200,
          available: 200,
          percentage: 0,
        },
      },
      recentSales: [],
      isFallback: true,
    };
  }

  static async getSellersPerformance(monthPeriod: "current" | "previous" = "current"): Promise<SellersSummary> {
    const periodLabel = monthPeriod === "current" ? "Este mes" : "Mes anterior";

    if (isSupabaseConfigured) {
      try {
        const { data: sales } = await supabase.from("sales").select("seller_name, total");
        if (sales && sales.length > 0) {
          const groups: Record<string, { amount: number; count: number }> = {};
          for (const s of sales) {
            const seller = s.seller_name || "General";
            if (!groups[seller]) groups[seller] = { amount: 0, count: 0 };
            groups[seller].amount += Number(s.total || 0);
            groups[seller].count += 1;
          }

          const colors = ["bar-one", "bar-two", "bar-three"];
          const sellers: SellerPerformance[] = Object.entries(groups)
            .sort((a, b) => b[1].amount - a[1].amount)
            .map(([name, data], idx) => ({
              name,
              shortName: name.split(" ")[0],
              amount: data.amount,
              salesCount: data.count,
              colorClass: colors[idx % colors.length],
            }));

          const totalAmount = sellers.reduce((acc, s) => acc + s.amount, 0);
          const totalSales = sellers.reduce((acc, s) => acc + s.salesCount, 0);
          const averageTicket = totalSales > 0 ? totalAmount / totalSales : 0;

          return {
            period: periodLabel,
            sellers,
            totalAmount,
            totalSales,
            averageTicket,
          };
        }
      } catch (err) {
        console.warn("Failed to query sellers in Supabase, returning clean empty state:", err);
      }
    }

    return {
      period: periodLabel,
      sellers: [],
      totalAmount: 0,
      totalSales: 0,
      averageTicket: 0,
    };
  }

  static async getSalesVsExpenses(): Promise<SalesVsExpensesData> {
    if (isSupabaseConfigured) {
      try {
        const { data: sales } = await supabase.from("sales").select("total, date");
        const { data: expenses } = await supabase.from("expenses").select("amount, date");

        if ((sales && sales.length > 0) || (expenses && expenses.length > 0)) {
          const totalSales = (sales || []).reduce((acc, s) => acc + Number(s.total || 0), 0);
          const totalExpenses = (expenses || []).reduce((acc, g) => acc + Number(g.amount || 0), 0);
          return {
            labels: ["Inicio", "Actual"],
            points: [
              { label: "Inicio", sales: 0, expenses: 0 },
              { label: "Actual", sales: totalSales, expenses: totalExpenses },
            ],
          };
        }
      } catch (err) {
        console.warn("Failed to query sales vs expenses in Supabase:", err);
      }
    }

    return {
      labels: [],
      points: [],
    };
  }
}