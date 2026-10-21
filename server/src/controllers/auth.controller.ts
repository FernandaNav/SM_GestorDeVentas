import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";
import { AuthRequest } from "../middlewares/auth.middleware";
import { testSupabaseConnection, isSupabaseConfigured } from "../config/supabase";

export class AuthController {
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, role, password } = req.body;

      if (!password) {
        res.status(400).json({
          ok: false,
          error: "La contraseña es obligatoria",
        });
        return;
      }

      const result = await AuthService.login({ email, role, password });

      res.json({
        ok: true,
        message: "Inicio de sesión exitoso",
        data: result,
      });
    } catch (error: any) {
      res.status(401).json({
        ok: false,
        error: error.message || "Error al iniciar sesión",
      });
    }
  }

  static async getMe(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ ok: false, error: "No autenticado" });
        return;
      }

      const user = await AuthService.getUserById(req.user.id);
      if (!user) {
        res.status(404).json({ ok: false, error: "Usuario no encontrado" });
        return;
      }

      res.json({
        ok: true,
        user,
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: error.message || "Error al obtener perfil",
      });
    }
  }

  static async register(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { nombre, email, password, rol } = req.body;

      if (!nombre || !email || !password || !rol) {
        res.status(400).json({
          ok: false,
          error: "Todos los campos (nombre, email, password, rol) son requeridos",
        });
        return;
      }

      if (rol !== "Administrador" && rol !== "Empleado") {
        res.status(400).json({
          ok: false,
          error: "El rol debe ser 'Administrador' o 'Empleado'",
        });
        return;
      }

      const newUser = await AuthService.registerUser({ nombre, email, password, rol });

      res.status(201).json({
        ok: true,
        message: "Usuario creado exitosamente",
        user: newUser,
      });
    } catch (error: any) {
      res.status(400).json({
        ok: false,
        error: error.message || "Error al registrar usuario",
      });
    }
  }

  static async getStatus(_req: Request, res: Response): Promise<void> {
    const dbTest = await testSupabaseConnection();

    res.json({
      ok: true,
      configured: isSupabaseConfigured,
      database: dbTest,
      serverTime: new Date().toISOString(),
    });
  }

  static async seed(_req: Request, res: Response): Promise<void> {
    try {
      const seeded = await AuthService.seedDefaultUsers();
      res.json({
        ok: true,
        message: seeded
          ? "Usuarios iniciales creados exitosamente"
          : "La base de datos ya cuenta con usuarios registrados",
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: error.message,
      });
    }
  }
}
