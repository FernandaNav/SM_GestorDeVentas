-- Búsqueda de clientes por NIT o CUI sin importar guiones, espacios ni mayúsculas (RNF 3.1).
-- La expresión debe ser igual a la de sales.repository.ts para que PostgreSQL use el índice.
CREATE INDEX clients_normalized_tax_id_idx ON clients (regexp_replace(upper(tax_id), '[^0-9A-Z]', '', 'g'));
