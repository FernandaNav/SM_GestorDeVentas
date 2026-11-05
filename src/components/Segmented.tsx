import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { SegmentedControl } from "glisse";
import { Icon, type IconName } from "@/components/ui";

/**
 * Selector de opciones con liquid glass (SegmentedControl de glisse): la opción elegida
 * es una píldora de vidrio que se desliza y, al mantenerla presionada o arrastrarla, se
 * levanta como lente. Cada pestaña mide lo mismo: el ancho disponible entre el número de
 * opciones, sin bajar del ancho de la etiqueta más larga.
 */
export default function Segmented({
  options,
  value,
  onChange,
  icons,
  labels,
  ariaLabel,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  icons?: IconName[];
  /** Contenido a mostrar en vez del texto de cada opción (por ejemplo, con un contador). */
  labels?: ReactNode[];
  ariaLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tabWidth, setTabWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const fit = () => {
      const widest = Math.max(0, ...[...wrap.querySelectorAll<HTMLElement>(".lg-tab .lg-tab-text")].map((label) => label.scrollWidth));
      const next = Math.floor(Math.max(widest + 32, wrap.clientWidth / options.length));
      setTabWidth((current) => (current === next ? current : next));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [options.length]);

  const items = options.map((option, index) => ({
    value: option,
    label: (
      <span className="segmented-label">
        {icons?.[index] && <Icon name={icons[index]} size="sm" />}
        {labels?.[index] ?? option}
      </span>
    ),
  }));

  return (
    <div ref={wrapRef} className="segmented-wrap">
      <SegmentedControl
        className="app-segmented"
        aria-label={ariaLabel}
        items={items}
        value={value}
        onValueChange={onChange}
        style={tabWidth ? ({ "--lg-tab-width": `${tabWidth}px` } as CSSProperties) : undefined}
      />
    </div>
  );
}
