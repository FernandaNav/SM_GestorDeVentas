import { type ChangeEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Switch } from "glisse";

export type IconName =
  | "home"
  | "plus"
  | "history"
  | "wrench"
  | "coins"
  | "chart"
  | "receipt"
  | "users"
  | "lock"
  | "settings"
  | "search"
  | "bell"
  | "chevron"
  | "wallet"
  | "calendar"
  | "trending"
  | "file"
  | "cash"
  | "card"
  | "bank"
  | "download"
  | "print"
  | "edit"
  | "trash"
  | "check"
  | "bike"
  | "logout"
  | "mail"
  | "eye"
  | "moon"
  | "sun"
  | "phone";

const paths: Record<IconName, ReactNode> = {
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>,
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9 20v-6h6v6"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5l-8.8 8.8a2.1 2.1 0 0 0 3 3l8.8-8.8a4 4 0 0 0 5-5L18 9l-2.4-2.4L18 4.3a4 4 0 0 0-3.3 2Z"/>,
  coins: <><ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3 1.2 0 2.3-.2 3.2-.5M3 11v4c0 1.7 2.7 3 6 3"/><path d="M13 10.2c.8-.1 1.5-.2 2-.2 3.3 0 6 1.3 6 3s-2.7 3-6 3-6-1.3-6-3M9 13v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4"/></>,
  chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
  receipt: <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3Zm4 5h6M9 12h6"/>,
  users: <><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4.5a4 4 0 0 1 0 7.5M18 15a6 6 0 0 1 4 6"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  wallet: <><path d="M4 6h15a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13v3"/><path d="M16 12h5"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  trending: <path d="m3 17 6-6 4 4 8-9M15 6h6v6"/>,
  file: <><path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h6"/></>,
  cash: <><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9H5v1M18 15h1v-1"/></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></>,
  bank: <><path d="m3 10 9-6 9 6M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M3 20h18"/></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></>,
  print: <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></>,
  edit: <><path d="M12 20h9"/><path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z"/></>,
  trash: <><path d="M3 6h18M8 6V3h8v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  bike: <><circle cx="6" cy="17" r="4"/><circle cx="18" cy="17" r="4"/><path d="m6 17 4-8h5l3 8M9 11h7l2-3h3M11 17h3"/></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3M15 4h5v16h-5"/></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></>,
};

export function Icon({ name, size = "md" }: { name: IconName; size?: "sm" | "md" | "lg" }) {
  return <svg className={`icon icon-${size}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function Button({ children, variant = "primary", icon, onClick, type = "button", className = "", disabled = false }: { children: ReactNode; variant?: "primary" | "secondary" | "danger" | "ghost"; icon?: IconName; onClick?: () => void; type?: "button" | "submit"; className?: string; disabled?: boolean }) {
  return <button className={`btn btn-${variant} ${className}`} type={type} onClick={onClick} disabled={disabled}>{icon && <Icon name={icon} size="sm" />}<span>{children}</span></button>;
}

export function UnstyledButton({ children, className, onClick }: { children: ReactNode; className: string; onClick?: () => void }) {
  return <button type="button" className={className} onClick={onClick}>{children}</button>;
}

export function IconButton({ icon, label, onClick }: { icon: IconName; label: string; onClick?: () => void }) {
  return <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}><Icon name={icon} size="sm" /></button>;
}

export function TextInput({ label, value, placeholder, onChange, readOnly, error, icon, type = "text" }: { label?: string; value?: string; placeholder?: string; onChange?: (value: string) => void; readOnly?: boolean; error?: string; icon?: IconName; type?: string }) {
  return <label className="field">{label && <span className="field-label">{label}</span>}<span className={`input-shell ${error ? "has-error" : ""}`}>{icon && <Icon name={icon} size="sm" />}<input type={type} value={value} placeholder={placeholder} onChange={(e: ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)} readOnly={readOnly} /></span>{error && <span className="field-error">{error}</span>}</label>;
}

export type SelectOption = string | { value: string; label: string };

type SelectProps = {
  label?: string;
  value?: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
  /** Versión chica para celdas de tabla (categoría de cada producto). */
  compact?: boolean;
  /** Nombre para lectores de pantalla cuando no hay etiqueta visible. */
  ariaLabel?: string;
};

type ListPosition = { left: number; minWidth: number; maxHeight: number; top?: number; bottom?: number };

/**
 * Lista desplegable propia (en lugar del <select> del navegador) para que se abra al hacer clic
 * en cualquier parte de la caja, flecha incluida, y se vea igual que el calendario de fechas.
 * La lista se dibuja fuera del contenedor (portal) para que no la corten las tablas ni los modales.
 */
export function Select({ label, value, options, onChange, compact = false, ariaLabel }: SelectProps) {
  const items = options.map((option) => (typeof option === "string" ? { value: option, label: option } : option));
  const selectedIndex = items.findIndex((item) => item.value === value);
  const selected = items[selectedIndex];

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<ListPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const listId = `${id}-list`;

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const wanted = Math.min(items.length * 36 + 12, 288);
    const openUp = below < Math.min(wanted, 160) && above > below;
    setPosition({
      left: rect.left,
      minWidth: rect.width,
      maxHeight: Math.max(120, Math.min(288, openUp ? above : below)),
      ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    });
  }, [items.length]);

  const openList = (index = selectedIndex) => {
    place();
    setActive(Math.max(0, index));
    setOpen(true);
  };
  const close = (focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };
  const choose = (index: number) => {
    const item = items[index];
    if (!item) return;
    close(true);
    if (item.value !== value) onChange?.(item.value);
  };

  // Se cierra al hacer clic afuera, al desplazar la página o al cambiar el tamaño de la ventana
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScroll = (event: Event) => {
      if (listRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // Que no se salga por la derecha de la pantalla y que la opción marcada quede a la vista
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !list || !position) return;
    const overflow = list.getBoundingClientRect().right - (window.innerWidth - 8);
    if (overflow > 0) list.style.left = `${Math.max(8, position.left - overflow)}px`;
  }, [open, position]);
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = items.length - 1;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => Math.min(last, i + 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        return;
      case "Home":
        event.preventDefault();
        setActive(0);
        return;
      case "End":
        event.preventDefault();
        setActive(last);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        return;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      case "Tab":
        close();
        return;
    }
    // Escribir una letra salta a la primera opción que empieza con ella, como en el select normal
    if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLocaleLowerCase("es");
      const next = items.findIndex((item, i) => i > active && item.label.toLocaleLowerCase("es").startsWith(letter));
      const first = items.findIndex((item) => item.label.toLocaleLowerCase("es").startsWith(letter));
      if (next >= 0 || first >= 0) setActive(next >= 0 ? next : first);
    }
  };

  // Las variables de color del modo oscuro viven en .app-shell, por eso la lista se dibuja ahí
  const portalTarget = triggerRef.current?.closest(".app-shell") ?? document.body;

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      className={`select-shell select-trigger${compact ? " compact" : ""}${open ? " is-open" : ""}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-label={label ? undefined : ariaLabel}
      aria-labelledby={label ? `${labelId} ${valueId}` : undefined}
      aria-activedescendant={open ? `${id}-option-${active}` : undefined}
      onClick={() => (open ? close() : openList())}
      onKeyDown={onKeyDown}
    >
      {/* Las opciones ocultas hacen que la caja mida lo de la opción más larga, como el select normal */}
      <span className="select-value-stack">
        <span id={valueId} className={`select-value${selected ? "" : " is-placeholder"}`}>{selected?.label ?? (value || "Seleccionar")}</span>
        {items.map((item) => (
          <span key={item.value} className="select-sizer" aria-hidden="true">{item.label}</span>
        ))}
      </span>
      <Icon name="chevron" size="sm" />
    </button>
  );

  const list =
    open && position
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            className={`select-popover${compact ? " compact" : ""}`}
            style={{ left: position.left, top: position.top, bottom: position.bottom, minWidth: position.minWidth, maxHeight: position.maxHeight }}
            // Dentro de un modal, que el clic en la lista no cuente como clic afuera del modal
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {items.map((item, index) => (
              <li
                key={item.value}
                id={`${id}-option-${index}`}
                data-index={index}
                role="option"
                aria-selected={index === selectedIndex}
                className={`${index === selectedIndex ? "selected" : ""}${index === active ? " active" : ""}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}
              >
                <span>{item.label}</span>
                {index === selectedIndex && <Icon name="check" size="sm" />}
              </li>
            ))}
            {items.length === 0 && <li className="select-empty">Sin opciones</li>}
          </ul>,
          portalTarget,
        )
      : null;

  if (compact && !label) return <>{trigger}{list}</>;
  return (
    <div className="field">
      {label && <span id={labelId} className="field-label" onClick={() => triggerRef.current?.focus()}>{label}</span>}
      {trigger}
      {list}
    </div>
  );
}

export function TextArea({ label, value, placeholder, onChange }: { label?: string; value?: string; placeholder?: string; onChange?: (value: string) => void }) {
  return <label className="field">{label && <span className="field-label">{label}</span>}<textarea value={value} placeholder={placeholder} onChange={(e) => onChange?.(e.target.value)} /></label>;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <label className="toggle-row"><Switch checked={checked} onCheckedChange={onChange} /><span>{label}</span></label>;
}

/** Interruptor de liquid glass (glisse) con su etiqueta. Se mueve al instante y vuelve atrás si onChange falla. */
export function GlassToggle({ checked, onChange, label, title, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void | Promise<void>; label: string; title?: string; disabled?: boolean }) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  useEffect(() => setOptimistic(null), [checked]);
  const shown = optimistic ?? checked;
  const handleChange = (next: boolean) => {
    setOptimistic(next);
    Promise.resolve(onChange(next)).finally(() => setOptimistic(null));
  };
  return <label className={`person-toggle ${shown ? "on" : ""}`} title={title}><Switch checked={shown} onCheckedChange={handleChange} disabled={disabled} /><span className="toggle-label">{label}</span></label>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "success" | "neutral" | "danger" | "warning" | "info" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

/** Aviso de error de un formulario. */
export function FormError({ message }: { message: string }) {
  return <div className="cf-warning form-error" role="alert"><Icon name="bell" size="sm" /><span>{message}</span></div>;
}

export function Modal({ open, title, children, onClose, onConfirm, confirmLabel = "Confirmar", confirmDisabled = false }: { open: boolean; title: string; children: ReactNode; onClose: () => void; onConfirm: () => void; confirmLabel?: string; confirmDisabled?: boolean }) {
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="modal-scrim" aria-hidden="true" /><div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}><div className="modal-title">{title}</div><div className="modal-body">{children}</div><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={onConfirm} disabled={confirmDisabled}>{confirmLabel}</Button></div></div></div>;
}
