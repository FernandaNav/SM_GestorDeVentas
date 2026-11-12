-- Código de recuperación del Administrador: si olvida su contraseña, la cambia desde el login con
-- este código de un solo uso. Se guarda cifrado (bcrypt), igual que las contraseñas.
ALTER TABLE users
  ADD COLUMN recovery_code_hash       text,
  ADD COLUMN recovery_code_created_at timestamptz;
