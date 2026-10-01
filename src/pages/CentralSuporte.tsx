import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Loader2, MessageSquare, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/ErrorState';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

type Ticket = {
  id: string;
  titulo: string;
  descricao: string;
  prioridade: string;
  status: string;
  sla_limite: string;
};

type TicketMessage = {
  id: string;
  mensagem: string;
  created_at: string;
};

const STATUS = ['aberto', 'em_atendimento', 'aguardando_cliente', 'resolvido', 'fechado'];
const PRIORIDADES = ['baixa', 'normal', 'alta', 'critica'];

export default function CentralSuporte() {
  const { profile, isPlatformAdmin, user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState('normal');
  const [selecionado, setSelecionado] = useState<Ticket | null>(null);
  const [mensagem, setMensagem] = useState('');
  const [criando, setCriando] = useState(false);
  const [respondendo, setRespondendo] = useState(false);
  const [statusAtualizando, setStatusAtualizando] = useState<string | null>(null);

  const tickets = useQuery({
    queryKey: ['support-tickets', user?.id ?? null, profile?.clinica_id ?? null, isPlatformAdmin],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Ticket[];
    },
  });

  const mensagens = useQuery({
    queryKey: ['support-messages', user?.id ?? null, profile?.clinica_id ?? null, selecionado?.id ?? null],
    enabled: !!user && !!selecionado,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('support_ticket_messages')
        .select('*')
        .eq('ticket_id', selecionado!.id)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as TicketMessage[];
    },
  });

  const criar = async () => {
    if (!user || !profile?.clinica_id || titulo.trim().length < 5 || descricao.trim().length < 10) return;
    setCriando(true);
    try {
      const { error } = await (supabase as any).from('support_tickets').insert({
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        prioridade,
        clinica_id: profile.clinica_id,
        solicitante_id: user.id,
        sla_limite: new Date().toISOString(),
      });
      if (error) throw error;
      setTitulo('');
      setDescricao('');
      setPrioridade('normal');
      await queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast.success('Chamado aberto.');
    } catch (error) {
      toast.error('Não foi possível abrir o chamado.', { description: mensagemDeErro(error) });
    } finally {
      setCriando(false);
    }
  };

  const responder = async () => {
    const texto = mensagem.trim();
    if (!texto || !selecionado || !user) return;
    setRespondendo(true);
    try {
      const { error } = await (supabase as any).from('support_ticket_messages').insert({
        ticket_id: selecionado.id,
        autor_id: user.id,
        mensagem: texto,
      });
      if (error) throw error;
      setMensagem('');
      await queryClient.invalidateQueries({ queryKey: ['support-messages'] });
      toast.success('Resposta enviada.');
    } catch (error) {
      toast.error('Não foi possível enviar a resposta.', { description: mensagemDeErro(error) });
    } finally {
      setRespondendo(false);
    }
  };

  const atualizarStatus = async (ticket: Ticket, novoStatus: string) => {
    setStatusAtualizando(ticket.id);
    try {
      const { error } = await (supabase as any)
        .from('support_tickets')
        .update({ status: novoStatus, resolvido_em: novoStatus === 'resolvido' ? new Date().toISOString() : null })
        .eq('id', ticket.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast.success('Status do chamado atualizado.');
    } catch (error) {
      toast.error('Não foi possível atualizar o chamado.', { description: mensagemDeErro(error) });
    } finally {
      setStatusAtualizando(null);
    }
  };

  const chamados = tickets.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MessageSquare aria-hidden="true" className="h-6 w-6" />Central de Suporte
        </h1>
        <p className="text-muted-foreground">Chamados, prioridade, SLA e histórico em um só lugar.</p>
      </header>

      {!isPlatformAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Abrir chamado</CardTitle>
            <CardDescription>Conte o que aconteceu e como podemos reproduzir o problema.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="support-title">Resumo do problema</Label>
              <Input id="support-title" value={titulo} onChange={(event) => setTitulo(event.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-description">Descrição</Label>
              <Textarea id="support-description" value={descricao} onChange={(event) => setDescricao(event.target.value)} maxLength={4000} />
              <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres · {descricao.length}/4000</p>
            </div>
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="support-priority">Prioridade</Label>
              <Select value={prioridade} onValueChange={setPrioridade}>
                <SelectTrigger id="support-priority"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORIDADES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={criar} disabled={criando || !profile?.clinica_id || titulo.trim().length < 5 || descricao.trim().length < 10}>
              {criando ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <Plus aria-hidden="true" className="mr-2 h-4 w-4" />}
              {criando ? 'Abrindo chamado…' : 'Abrir chamado'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fila de chamados</CardTitle>
            <CardDescription>{chamados.length} chamado(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {tickets.isLoading ? (
              <p role="status" className="py-4 text-sm text-muted-foreground">Carregando chamados…</p>
            ) : tickets.isError ? (
              <ErrorState compact title="Não foi possível carregar os chamados" error={tickets.error} onRetry={() => void tickets.refetch()} />
            ) : chamados.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <MessageSquare aria-hidden="true" className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="font-medium">Nenhum chamado por aqui</p>
                <p className="mt-1 text-sm text-muted-foreground">Os chamados da clínica aparecerão nesta lista.</p>
              </div>
            ) : chamados.map((ticket) => (
              <div key={ticket.id} className="rounded-lg border p-3">
                <button type="button" onClick={() => setSelecionado(ticket)} aria-pressed={selecionado?.id === ticket.id} className="w-full rounded text-left hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{ticket.titulo}</span>
                    <Badge variant={ticket.prioridade === 'critica' ? 'destructive' : 'outline'}>{ticket.prioridade}</Badge>
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock aria-hidden="true" className="h-3 w-3" />SLA {new Date(ticket.sla_limite).toLocaleString('pt-BR')}
                  </span>
                </button>
                {isPlatformAdmin && (
                  <Select value={ticket.status} onValueChange={(value) => void atualizarStatus(ticket, value)} disabled={statusAtualizando === ticket.id}>
                    <SelectTrigger className="mt-2 h-9" aria-label={`Status do chamado ${ticket.titulo}`}>
                      {statusAtualizando === ticket.id ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <SelectValue />}
                    </SelectTrigger>
                    <SelectContent>{STATUS.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selecionado?.titulo || 'Detalhes do chamado'}</CardTitle>
            {!selecionado && <CardDescription>Selecione um chamado para ver as mensagens.</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-3">
            {!selecionado ? (
              <p className="py-4 text-sm text-muted-foreground">As respostas e atualizações aparecerão aqui.</p>
            ) : (
              <>
                <p className="whitespace-pre-wrap text-sm">{selecionado.descricao}</p>
                <div aria-live="polite" className="max-h-72 space-y-2 overflow-auto rounded-md border p-3">
                  {mensagens.isLoading ? (
                    <p role="status" className="text-sm text-muted-foreground">Carregando mensagens…</p>
                  ) : mensagens.isError ? (
                    <ErrorState compact title="Não foi possível carregar as mensagens" error={mensagens.error} onRetry={() => void mensagens.refetch()} />
                  ) : mensagens.data?.length ? mensagens.data.map((item) => (
                    <div key={item.id} className="rounded-lg bg-muted p-2 text-sm">
                      <p className="whitespace-pre-wrap">{item.mensagem}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{new Date(item.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">Ainda não há mensagens neste chamado.</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="support-reply">Responder</Label>
                  <Textarea id="support-reply" value={mensagem} onChange={(event) => setMensagem(event.target.value)} maxLength={4000} />
                </div>
                <Button onClick={responder} disabled={respondendo || !mensagem.trim()}>
                  {respondendo ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <Send aria-hidden="true" className="mr-2 h-4 w-4" />}
                  {respondendo ? 'Enviando…' : 'Enviar resposta'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
