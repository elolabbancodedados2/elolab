import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, User, Search, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { WhatsAppConversation } from './types';
import { Button } from '@/components/ui/button';

interface ConversationsTabProps {
  conversations: WhatsAppConversation[];
  onStatusChange: (conversationId: string, status: string) => void;
  isUpdating: boolean;
}

export function ConversationsTab({ conversations, onStatusChange, isUpdating }: ConversationsTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  const filtered = useMemo(() => {
    return conversations.filter(c => {
      const name = c.pacientes?.nome || c.remote_jid || '';
      if (search && !name.toLowerCase().includes(search.toLowerCase()) && !c.remote_jid.includes(search)) return false;
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      return true;
    });
  }, [conversations, search, statusFilter]);

  const stats = useMemo(() => ({
    ativas: conversations.filter(c => c.status === 'ativo').length,
    aguardando: conversations.filter(c => c.status === 'aguardando_humano').length,
    encerradas: conversations.filter(c => c.status === 'encerrado').length,
  }), [conversations]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ativo': return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case 'aguardando_humano': return <Clock className="h-3 w-3 text-amber-500" />;
      case 'em_atendimento_humano': return <User className="h-3 w-3 text-blue-500" />;
      case 'encerrado': return <AlertCircle className="h-3 w-3 text-muted-foreground" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ativo':
        return <Badge className="bg-green-500/10 text-green-700 border-green-200 text-[10px]">Ativa</Badge>;
      case 'aguardando_humano':
        return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200 text-[10px]">Aguardando humano</Badge>;
      case 'em_atendimento_humano':
        return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200 text-[10px]">Com atendente</Badge>;
      case 'encerrado':
        return <Badge variant="outline" className="text-[10px]">Encerrada</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats resumo */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Ativas', value: stats.ativas, color: 'text-green-600 bg-green-500/10', filter: 'ativo' },
          { label: 'Aguardando', value: stats.aguardando, color: 'text-amber-600 bg-amber-500/10', filter: 'aguardando_humano' },
          { label: 'Encerradas', value: stats.encerradas, color: 'text-muted-foreground bg-muted', filter: 'encerrado' },
        ].map(s => (
          <button
            key={s.label}
            onClick={() => setStatusFilter(statusFilter === s.filter ? 'todos' : s.filter)}
            className={`rounded-xl border p-3 text-center transition-all hover:shadow-sm ${statusFilter === s.filter ? 'ring-2 ring-primary/30 border-primary/40' : ''}`}
          >
            <p className={`text-xl font-bold tabular-nums ${s.color.split(' ')[0]}`}>{s.value}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou número..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhuma conversa encontrada</h3>
            <p className="text-muted-foreground text-sm">
              {search ? 'Tente alterar os filtros de busca' : 'As conversas aparecerão aqui quando os pacientes entrarem em contato'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              {filtered.length} conversa{filtered.length !== 1 ? 's' : ''}
              {statusFilter !== 'todos' && ` (${statusFilter})`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <div className="divide-y">
                {filtered.map((conv, i) => {
                  const phone = conv.remote_jid.replace('@s.whatsapp.net', '');
                  const name = conv.pacientes?.nome || phone;
                  const timeAgo = formatDistanceToNow(new Date(conv.ultima_mensagem_at), { addSuffix: true, locale: ptBR });

                  return (
                    <motion.div
                      key={conv.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
                    >
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                        {conv.status === 'ativo' && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{name}</p>
                          {getStatusIcon(conv.status)}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {phone !== name ? phone : 'WhatsApp'}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 space-y-1">
                        {getStatusBadge(conv.status)}
                        <p className="text-[10px] text-muted-foreground">{timeAgo}</p>
                        <div className="flex justify-end gap-1 pt-1">
                          {conv.status === 'aguardando_humano' && (
                            <Button size="sm" variant="outline" disabled={isUpdating} onClick={() => onStatusChange(conv.id, 'em_atendimento_humano')}>
                              Assumir
                            </Button>
                          )}
                          {conv.status === 'em_atendimento_humano' && (
                            <Button size="sm" variant="outline" disabled={isUpdating} onClick={() => onStatusChange(conv.id, 'ativo')}>
                              Devolver à IA
                            </Button>
                          )}
                          {conv.status !== 'encerrado' && (
                            <Button size="sm" variant="ghost" disabled={isUpdating} onClick={() => onStatusChange(conv.id, 'encerrado')}>
                              Encerrar
                            </Button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
