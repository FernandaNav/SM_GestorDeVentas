import { Icon, type IconName } from "@/components/ui";

export default function EmptyState({ icon, title, text, minHeight }: { icon: IconName; title: string; text: string; minHeight?: number }) {
  return (
    <div className="empty-state-box" style={minHeight ? { minHeight } : undefined}>
      <div className="empty-state-icon">
        <Icon name={icon} />
      </div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-desc">{text}</div>
    </div>
  );
}
