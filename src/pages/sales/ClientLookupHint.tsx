import type { ClientLookup } from "@shared/schemas/sales";
import { Icon } from "@/components/ui";

const HINT_STYLE = { fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", margin: "4px 0" };

/** Aviso bajo el campo de NIT o CUI: buscando, o el cliente que se autocompletó. */
export default function ClientLookupHint({ loading, client, idType }: { loading: boolean; client: ClientLookup | null; idType: string }) {
  if (loading) {
    return (
      <div style={{ ...HINT_STYLE, color: "var(--color-primary)" }}>
        <Icon name="history" size="sm" />
        <span>Buscando cliente por {idType}...</span>
      </div>
    );
  }
  if (!client) return null;
  return (
    <div style={{ ...HINT_STYLE, color: "var(--color-success, #10b981)" }}>
      <Icon name="check" size="sm" />
      <span>
        Cliente registrado autocompletado: <strong>{client.name}</strong>
      </span>
    </div>
  );
}
