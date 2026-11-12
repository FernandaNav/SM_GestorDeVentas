import { useState } from "react";
import { Button } from "@/components/ui";

/** Muestra un código de recuperación recién creado, con botón para copiarlo. */
export default function RecoveryCodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Sin permiso para copiar: el código se puede seleccionar y copiar a mano
    }
  };

  return (
    <div className="recovery-box">
      <div className="recovery-code">{code}</div>
      <Button variant="secondary" icon={copied ? "check" : "file"} onClick={handleCopy}>
        {copied ? "Copiado" : "Copiar código"}
      </Button>
      <div className="muted small">Guárdalo ahora, en papel o en un lugar seguro: no se volverá a mostrar.</div>
    </div>
  );
}
