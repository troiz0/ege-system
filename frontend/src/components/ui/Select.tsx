import { CustomSelect, type CustomSelectOption } from './CustomSelect';

interface SelectProps {
  label?: string;
  error?: string;
  options: CustomSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function Select({ label, error, className = '', ...props }: SelectProps) {
  return (
    <div className="w-full">
      {label && <label className="field-label">{label}</label>}
      <CustomSelect className={className} {...props} />
      {error && <p className="mt-1 font-mono text-xs text-red-400">{error}</p>}
    </div>
  );
}

export type { CustomSelectOption };
