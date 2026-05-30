import type { LucideIcon } from 'lucide-react';
import { cn } from '@myklintown/ui';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  delta?: { value: string; positive?: boolean };
  accent?: 'blue' | 'green' | 'teal' | 'warning' | 'danger';
  className?: string;
}

const ACCENT_BG: Record<NonNullable<StatCardProps['accent']>, string> = {
  blue: 'bg-brand-blue/10 text-brand-blue',
  green: 'bg-brand-green/10 text-brand-green',
  teal: 'bg-brand-teal/10 text-brand-teal',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
};

export function StatCard({
  icon: Icon,
  label,
  value,
  delta,
  accent = 'blue',
  className,
}: StatCardProps) {
  return (
    <div className={cn('card-soft p-5', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-body-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-h1-sm font-bold text-foreground">{value}</p>
        </div>
        <span className={cn('grid h-10 w-10 place-content-center rounded-lg', ACCENT_BG[accent])}>
          <Icon size={20} />
        </span>
      </div>
      {delta && (
        <p
          className={cn(
            'mt-3 text-small font-medium',
            delta.positive ? 'text-brand-green' : 'text-danger',
          )}
        >
          {delta.positive ? '↑' : '↓'} {delta.value}
        </p>
      )}
    </div>
  );
}
