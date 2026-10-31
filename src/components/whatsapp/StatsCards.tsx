import { Smartphone, MessageSquare, Users, Activity, CalendarPlus, CheckCircle2, UserX, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WhatsAppStats, WhatsAppSession } from './types';

interface StatsCardsProps {
  sessions: WhatsAppSession[];
  stats?: WhatsAppStats;
}

export function StatsCards({ sessions, stats }: StatsCardsProps) {
  const activeSessions = sessions.filter(s => s.status === 'connected').length;
  const cards = [
    { label: 'Sessões Ativas', value: activeSessions, icon: Smartphone, color: 'text-foreground', surface: 'bg-secondary', destaque: false },
    { label: 'Mensagens Hoje', value: stats?.messages, icon: MessageSquare, color: 'text-primary', surface: 'bg-primary/10' },
    { label: 'Conversas Hoje', value: stats?.conversations, icon: Users, color: 'text-info', surface: 'bg-info/10' },
    { label: 'Ações do Agente Hoje', value: stats?.actions, icon: Activity, color: 'text-primary', surface: 'bg-primary/10' },
    { label: 'Agendamentos pela IA hoje', value: stats?.ai_bookings, icon: CalendarPlus, color: 'text-success', surface: 'bg-success/10' },
    { label: 'Confirmadas na agenda hoje', value: stats?.confirmed_today, icon: CheckCircle2, color: 'text-success', surface: 'bg-success/10' },
    { label: 'Faltas na agenda hoje', value: stats?.no_shows_today, icon: UserX, color: 'text-warning', surface: 'bg-warning/10' },
    { label: 'Falhas de envio hoje', value: stats?.delivery_failures, icon: AlertTriangle, color: 'text-destructive', surface: 'bg-destructive/10' },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, color, surface, destaque }) => (
          <div
            key={label}
            className={cn(
              'flex min-h-[88px] items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-xs',
              destaque && 'border-transparent bg-gradient-primary text-white',
            )}
          >
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', surface)}>
              <Icon aria-hidden="true" className={cn('h-5 w-5', color)} />
            </div>
            <div className="min-w-0">
              <p className={cn('text-[11px] leading-tight', destaque ? 'text-white/80' : 'text-muted-foreground')}>{label}</p>
              <p className={cn('text-2xl font-bold tabular-nums', destaque ? 'text-white' : 'text-foreground')}>{value ?? 0}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Hoje em America/Sao_Paulo. Agendamentos pela IA: criados hoje com registro confirmado. Confirmações e faltas: status atual das consultas da clínica marcadas para hoje. Falhas: mensagens de saída e notificações WhatsApp com erro registradas hoje.</p>
    </div>
  );
}
