import { Button } from "@/components/ui";

/**
 * Controles de página para tablas paginadas en el servidor (ver Page<T> en shared/schemas/common.ts).
 * Usa el estilo .pagination que ya trae la plantilla. No se muestra si todo cabe en una página.
 */
export default function Pagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  noun = "registros",
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Cómo se llaman los registros en el texto: "gastos", "cierres"... */
  noun?: string;
}) {
  if (totalPages <= 1) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);
  return (
    <div className="pagination">
      <span>
        Mostrando {first === last ? first : `${first}–${last}`} de {totalItems} {noun} · Página {page} de {totalPages}
      </span>
      <div>
        <Button variant="secondary" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Anterior
        </Button>
        <Button variant="secondary" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}