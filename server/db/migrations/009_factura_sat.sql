-- Factura de la SAT registrada a mano (noviembre de 2026).
-- La tienda no va a usar un certificador FEL: emite sus facturas gratis en la app de la SAT y
-- aquí se anota la serie y el número de cada una. Se guardan en fel_documents, que ya existía
-- (una fila por venta) y no se había usado. Estar aparte de la venta permite registrar el número
-- después, aunque el período de la venta ya esté cerrado (el cierre protege montos, no esto).

-- Una misma factura de la SAT no puede quedar en dos ventas (sin importar mayúsculas en la serie)
CREATE UNIQUE INDEX fel_documents_series_number_key
  ON fel_documents (upper(series), number)
  WHERE status <> 'anulado' AND series IS NOT NULL AND number IS NOT NULL;
