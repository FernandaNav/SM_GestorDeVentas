import { Request, Response } from "express";
import { DashboardService } from "../services/dashboard.service";
import { supabase, isSupabaseConfigured } from "../config/supabase";

export class DashboardController {
  static async getSummary(_req: Request, res: Response): Promise<void> {
    try {
      const summary = await DashboardService.getSummary();
      res.json({
        ok: true,
        data: summary,
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: error.message || "Error al obtener resumen del dashboard",
      });
    }
  }

  static async getSellers(req: Request, res: Response): Promise<void> {
    try {
      const monthQuery = req.query.month as string;
      const month = monthQuery === "previous" || monthQuery === "Mes anterior" ? "previous" : "current";

      const sellersData = await DashboardService.getSellersPerformance(month);
      res.json({
        ok: true,
        data: sellersData,
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: error.message || "Error al obtener rendimiento de vendedores",
      });
    }
  }

  static async getSalesVsExpenses(_req: Request, res: Response): Promise<void> {
    try {
      const chartData = await DashboardService.getSalesVsExpenses();
      res.json({
        ok: true,
        data: chartData,
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: error.message || "Error al obtener datos de ventas vs gastos",
      });
    }
  }

  static async createSale(req: Request, res: Response): Promise<void> {
    try {
      const {
        cliente_nombre,
        cliente_nit,
        vendedor_nombre,
        producto_resumen,
        categoria,
        metodo_pago,
        total,
        comision_porcentaje,
        facturada,
      } = req.body;

      if (!vendedor_nombre || !producto_resumen || !total) {
        res.status(400).json({
          ok: false,
          error: "Los campos vendedor, producto y total son obligatorios",
        });
        return;
      }

      const totalNum = Number(total);
      const comPct = comision_porcentaje ? Number(comision_porcentaje) : 0;
      const comMonto = comPct > 0 ? (totalNum * comPct) / 100 : 0;
      const numeroDte = `SM-${String(Math.floor(100 + Math.random() * 900))}`;

      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from("sales")
          .insert({
            dte_number: numeroDte,
            client_name: cliente_nombre || "Consumidor Final",
            client_tax_id: cliente_nit || "CF",
            seller_name: vendedor_nombre,
            product_summary: producto_resumen,
            category: categoria || "Accesorio",
            payment_method: metodo_pago || "Efectivo",
            total: totalNum,
            commission_percentage: comPct || null,
            commission_amount: comMonto,
            commission_status: comPct > 0 ? "Asignada" : "Pendiente",
            is_invoiced: facturada ?? true,
          })
          .select()
          .single();

        if (error) {
          throw new Error(`Error en Supabase al guardar venta: ${error.message}`);
        }

        res.status(201).json({
          ok: true,
          message: "Venta registrada exitosamente",
          sale: data,
        });
        return;
      }

      res.status(201).json({
        ok: true,
        message: "Venta simulada registrada exitosamente (Modo Dev)",
        sale: {
          id: `dev-sale-${Date.now()}`,
          numero_dte: numeroDte,
          vendedor_nombre,
          producto_resumen,
          total: totalNum,
          fecha: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: error.message || "Error al registrar venta",
      });
    }
  }
}
