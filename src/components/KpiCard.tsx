import { Card, Icon, type IconName } from "@/components/ui";

export default function KpiCard({
  icon,
  label,
  value,
  foot,
  tone = "dark",
}: {
  icon: IconName;
  label: string;
  value: string;
  foot: string;
  tone?: string;
}) {
  return (
    <Card className="kpi-card">
      <div className={`kpi-icon tone-${tone}`}>
        <Icon name={icon} />
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className={`kpi-foot ${foot.startsWith("+") ? "positive" : ""}`}>{foot}</div>
    </Card>
  );
}
