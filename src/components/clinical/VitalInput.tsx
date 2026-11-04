import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function VitalInput({ icon: Icon, label, value, onChange, placeholder, unit, color, inputMode = 'decimal', disabled = false }: {
  disabled?: boolean;
  icon: React.ElementType; label: string; value: string;
  onChange: (v: string) => void; placeholder?: string; unit?: string; color?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  const inputId = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId} className="flex items-center gap-1.5 text-xs">
        <Icon className={cn('h-3.5 w-3.5', color || 'text-muted-foreground')} />
        {label}
      </Label>
      <div className="relative">
        <Input
          id={inputId}
          disabled={disabled}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          className="pr-10 text-sm"
        />
        {unit && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-medium">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
