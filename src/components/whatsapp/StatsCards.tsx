import { Card, CardContent } from '@/components/ui/card';
import { Smartphone, MessageSquare, Users, Activity } from 'lucide-react';
import { WhatsAppStats, WhatsAppSession } from './types';

interface StatsCardsProps {
  sessions: WhatsAppSession[];
  stats?: WhatsAppStats;
}

export function StatsCards({ sessions, stats }: StatsCardsProps) {
  const activeSessions = sessions.filter(s => s.status === 'connected').length;

  return (
    <div className="space-y-3">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Card className="border-border bg-card shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-brand/10 p-3 text-brand">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sessões Ativas</p>
              <p className="text-2xl font-bold">{activeSessions}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-border bg-card shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-brand/10 p-3 text-brand">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Mensagens Hoje</p>
              <p className="text-2xl font-bold">{stats?.messages || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-border bg-card shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-brand/10 p-3 text-brand">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Conversas Hoje</p>
              <p className="text-2xl font-bold">{stats?.conversations || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-border bg-card shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-brand/10 p-3 text-brand">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ações do Agente Hoje</p>
              <p className="text-2xl font-bold">{stats?.actions || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      {([
        ['Agendamentos pela IA hoje', stats?.ai_bookings],
        ['Confirmadas na agenda hoje', stats?.confirmed_today],
        ['Faltas na agenda hoje', stats?.no_shows_today],
        ['Falhas de envio hoje', stats?.delivery_failures],
      ] as const).map(([label, count]) => (
        <Card key={label}>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{count ?? 0}</p>
          </CardContent>
        </Card>
      ))}
    </div>
    <p className="text-xs text-muted-foreground">Hoje em America/Sao_Paulo. Agendamentos pela IA: criados hoje com registro confirmado. Confirmações e faltas: status atual das consultas da clínica marcadas para hoje. Falhas: mensagens de saída e notificações WhatsApp com erro registradas hoje.</p>
    </div>
  );
}
