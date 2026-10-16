import { memo } from 'react';
import { Users, Building2, Baby, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PatientStatsProps {
  total: number | string;
  comConvenio: number | string;
  menores: number | string;
  comAlergias: number | string;
}

export const PatientStats = memo(function PatientStats({ total, comConvenio, menores, comAlergias }: PatientStatsProps) {
  const cards = [
    { label: 'Total', value: total, icon: Users, escuro: true, iconClass: 'bg-white/15 text-[#2ED5E7]', valueClass: 'text-[#2ED5E7]' },
    { label: 'Com convênio', value: comConvenio, icon: Building2, escuro: false, iconClass: 'bg-[#1080CA]/10 text-[#1080CA]', valueClass: 'text-foreground' },
    { label: 'Menores', value: menores, icon: Baby, escuro: false, iconClass: 'bg-warning/10 text-warning-foreground', valueClass: 'text-foreground' },
    { label: 'Com alergias', value: comAlergias, icon: Heart, escuro: false, iconClass: 'bg-destructive/10 text-destructive', valueClass: 'text-foreground' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, escuro, iconClass, valueClass }) => (
        <div
          key={label}
          className={cn(
            'flex items-center gap-3 rounded-2xl border px-4 py-3.5 shadow-xs',
            escuro ? 'border-transparent bg-[#111111] text-white' : 'border-border/60 bg-card',
          )}
        >
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', iconClass)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className={cn('text-xs', escuro ? 'text-white/70' : 'text-muted-foreground')}>{label}</p>
            <p className={cn('text-xl font-bold tabular-nums', valueClass)}>{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
});
