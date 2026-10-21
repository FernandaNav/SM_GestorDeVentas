import { Icon, type IconName, UnstyledButton } from "@/components/ui";

export default function Segmented({
  options,
  value,
  onChange,
  icons,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  icons?: IconName[];
}) {
  return (
    <div className="segmented">
      {options.map((option, index) => (
        <UnstyledButton
          key={option}
          className={value === option ? "selected" : ""}
          onClick={() => onChange(option)}
        >
          {icons && <Icon name={icons[index]} size="sm" />}
          <span>{option}</span>
        </UnstyledButton>
      ))}
    </div>
  );
}
