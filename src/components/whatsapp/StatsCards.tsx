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
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Card className="border-[#d6e7f6] bg-gradient-to-br from-[#f2f8ff] to-white shadow-sm shadow-[#133453]/[0.03]">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-[#e5f1ff] p-3 text-[#1766a8]">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sessões Ativas</p>
              <p className="text-2xl font-bold">{activeSessions}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-[#d7e8fb] bg-gradient-to-br from-[#f5faff] to-white shadow-sm shadow-[#133453]/[0.03]">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-[#e7f4fb] p-3 text-[#287b9b]">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Mensagens Hoje</p>
              <p className="text-2xl font-bold">{stats?.messages || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-[#d7efe9] bg-gradient-to-br from-[#f2fbf8] to-white shadow-sm shadow-[#133453]/[0.03]">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-[#e1f5ee] p-3 text-[#168064]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Conversas Hoje</p>
              <p className="text-2xl font-bold">{stats?.conversations || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-[#e7ddf7] bg-gradient-to-br from-[#faf7ff] to-white shadow-sm shadow-[#133453]/[0.03]">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-[#efe7fb] p-3 text-[#7450a8]">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ações do Agente</p>
              <p className="text-2xl font-bold">{stats?.actions || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
