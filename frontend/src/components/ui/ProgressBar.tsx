

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  color?: 'cyan' | 'green' | 'orange' | 'red' | 'gold';
  size?: 'sm' | 'md' | 'lg';
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showPercentage = true,
  color = 'cyan',
  size = 'md',
}: ProgressBarProps) {
  const percentage = Math.min((value / max) * 100, 100);

  const colorClasses = {
    cyan: 'bg-[#d4ff00]',
    green: 'bg-[#d4ff00]',
    orange: 'bg-amber-400',
    red: 'bg-red-400',
    gold: 'bg-[#d4ff00]',
  };

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="flex items-center justify-between mb-2 text-sm">
          {label && <span className="text-zinc-300">{label}</span>}
          {showPercentage && (
            <span className="text-zinc-400 font-mono">{Math.round(percentage)}%</span>
          )}
        </div>
      )}
      <div className={`w-full overflow-hidden bg-white/[0.06] ${sizeClasses[size]}`}>
        <div
          className={`${colorClasses[color]} ${sizeClasses[size]} rounded-none transition-all duration-500 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
