import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase, isSupabaseConfigured } from "../config/supabase";
import { AuthenticatedUser } from "../middlewares/auth.middleware";

const JWT_SECRET = process.env.JWT_SECRET || "solomotos_secret_jwt_key_2026_super_segura";

export interface LoginParams {
  email?: string;
  role?: "Administrador" | "Empleado";
  password?: string;
}

export interface UserResponse {
  id: string;
  nombre: string;
  email: string;
  rol: "Administrador" | "Empleado";
  activo: boolean;
  created_at?: string;
}

export class AuthService {
  static generateToken(user: UserResponse): string {
    const payload: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
  }

  static async login(params: LoginParams): Promise<{
    user: UserResponse;
    token: string;
    warning?: string;
  }> {
    const { email, role, password } = params;

    if (!password) {
      throw new Error("Debes ingresar una contraseña");
    }

    if (!isSupabaseConfigured) {
      const demoPasswords: Record<string, string> = {
        Administrador: "admin123",
        Empleado: "empleado123",
      };

      const selectedRole = role || (email?.toLowerCase().includes("admin") ? "Administrador" : "Empleado");

      if (password !== demoPasswords[selectedRole]) {
        throw new Error("Contraseña incorrecta. (Demo: admin123 o empleado123)");
      }

      const mockUser: UserResponse = {
        id: selectedRole === "Administrador" ? "dev-admin-uuid" : "dev-empleado-uuid",
        nombre: selectedRole === "Administrador" ? "Administrador (Modo Dev)" : "Empleado (Modo Dev)",
        email: selectedRole === "Administrador" ? "admin@solomotos.com" : "empleado@solomotos.com",
        rol: selectedRole,
        activo: true,
      };

      return {
        user: mockUser,
        token: this.generateToken(mockUser),
        warning:
          "Supabase aún no está configurado en el archivo .env. Has ingresado en modo desarrollo local.",
      };
    }

    let query = supabase.from("users").select("*").eq("is_active", true);

    if (email) {
      query = query.eq("email", email.trim().toLowerCase());
    } else if (role) {
      query = query.eq("role", role);
    } else {
      throw new Error("Debes especificar un correo o seleccionar un perfil de acceso");
    }

    const { data: users, error } = await query;

    if (error) {
      console.error("Error al consultar usuario en Supabase:", error);
      throw new Error(`Error en la base de datos: ${error.message}`);
    }

    if (!users || users.length === 0) {
      throw new Error("Usuario no encontrado o inactivo");
    }

    const user = users[0];

    if (role && user.role !== role) {
      throw new Error(`El usuario no tiene asignado el rol ${role}`);
    }

    let passwordMatches = false;
    if (user.password_hash) {
      passwordMatches = bcrypt.compareSync(password, user.password_hash);

      if (!passwordMatches && user.password_hash === password) {
        passwordMatches = true;
        const newHash = bcrypt.hashSync(password, 10);
        await supabase.from("users").update({ password_hash: newHash }).eq("id", user.id);
      }
    }

    if (!passwordMatches) {
      throw new Error("Contraseña incorrecta. Intenta de nuevo.");
    }

    const safeUser: UserResponse = {
      id: user.id,
      nombre: user.name || user.nombre,
      email: user.email,
      rol: user.role || user.rol,
      activo: user.is_active ?? user.activo ?? true,
      created_at: user.created_at,
    };

    const token = this.generateToken(safeUser);

    return { user: safeUser, token };
  }

  static async getUserById(id: string): Promise<UserResponse | null> {
    if (!isSupabaseConfigured) {
      return {
        id,
        nombre: id.includes("admin") ? "Administrador (Modo Dev)" : "Empleado (Modo Dev)",
        email: id.includes("admin") ? "admin@solomotos.com" : "empleado@solomotos.com",
        rol: id.includes("admin") ? "Administrador" : "Empleado",
        activo: true,
      };
    }

    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, is_active, created_at")
      .eq("id", id)
      .single();

    if (error || !data) return null;
    return {
      id: data.id,
      nombre: data.name,
      email: data.email,
      rol: data.role,
      activo: data.is_active,
      created_at: data.created_at,
    };
  }

  static async registerUser(data: {
    nombre: string;
    email: string;
    password: string;
    rol: "Administrador" | "Empleado";
  }): Promise<UserResponse> {
    if (!isSupabaseConfigured) {
      throw new Error("Configura Supabase en .env para registrar usuarios en la base de datos");
    }

    const password_hash = bcrypt.hashSync(data.password, 10);

    const { data: newUser, error } = await supabase
      .from("users")
      .insert({
        name: data.nombre,
        email: data.email.trim().toLowerCase(),
        password_hash,
        role: data.rol,
        is_active: true,
      })
      .select("id, name, email, role, is_active, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("Ya existe un usuario con ese correo electrónico");
      }
      throw new Error(`Error al crear usuario: ${error.message}`);
    }

    return {
      id: newUser.id,
      nombre: newUser.name,
      email: newUser.email,
      rol: newUser.role,
      activo: newUser.is_active,
      created_at: newUser.created_at,
    };
  }
}
