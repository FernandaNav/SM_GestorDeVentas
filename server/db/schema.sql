CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('Administrador', 'Empleado', 'Administrator', 'Employee')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'global',
    company_name VARCHAR(150) DEFAULT 'SoloMotos Quetzaltenango',
    tax_id VARCHAR(50) DEFAULT '8214573-6',
    address TEXT DEFAULT '7a. calle 4-63, zona 2, Quetzaltenango',
    phone VARCHAR(50) DEFAULT '+502 7765 4321',
    monthly_invoice_limit INTEGER DEFAULT 200,
    invoices_issued_month INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_number VARCHAR(50) NOT NULL,
    date TIMESTAMPTZ DEFAULT NOW(),
    client_name VARCHAR(150) NOT NULL,
    client_tax_id VARCHAR(50) DEFAULT 'CF',
    client_address TEXT DEFAULT 'Ciudad',
    seller_name VARCHAR(100) NOT NULL,
    product_summary VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'Accesorio',
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Efectivo',
    total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    commission_percentage NUMERIC(5, 2) DEFAULT 0.00,
    commission_amount NUMERIC(12, 2) DEFAULT 0.00,
    commission_status VARCHAR(20) DEFAULT 'Asignada' CHECK (commission_status IN ('Pendiente', 'Asignada', 'Pagada')),
    is_invoiced BOOLEAN DEFAULT true,
    is_locked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_seller ON sales(seller_name);
CREATE INDEX IF NOT EXISTS idx_sales_is_invoiced ON sales(is_invoiced);

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date TIMESTAMPTZ DEFAULT NOW(),
    description VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'Operativo',
    supplier VARCHAR(150),
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(50) DEFAULT 'Transferencia',
    receipt_number VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

CREATE TABLE IF NOT EXISTS workshop_orders (
    id VARCHAR(50) PRIMARY KEY,
    client_name VARCHAR(150) NOT NULL,
    phone VARCHAR(50),
    motorcycle VARCHAR(150) NOT NULL,
    work_description TEXT NOT NULL,
    mechanic_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Recibida',
    cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cost_type VARCHAR(20) DEFAULT 'estimado',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workshop_orders_status ON workshop_orders(status);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_orders ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "service_role_all_users" ON users;
    CREATE POLICY "service_role_all_users" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);
    
    DROP POLICY IF EXISTS "anon_read_users" ON users;
    CREATE POLICY "anon_read_users" ON users FOR SELECT TO anon, authenticated USING (true);

    DROP POLICY IF EXISTS "allow_all_settings" ON settings;
    CREATE POLICY "allow_all_settings" ON settings FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "allow_all_sales" ON sales;
    CREATE POLICY "allow_all_sales" ON sales FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "allow_all_expenses" ON expenses;
    CREATE POLICY "allow_all_expenses" ON expenses FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "allow_all_workshop_orders" ON workshop_orders;
    CREATE POLICY "allow_all_workshop_orders" ON workshop_orders FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
END $$;