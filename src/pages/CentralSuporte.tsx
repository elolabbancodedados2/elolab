import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Clock, Loader2, MessageSquare, Plus, Send, Building2, UserRound, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ErrorState } from '@/components/ErrorState';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

type Ticket = {
  id: string;
  clinica_id: string;
  clinica_nome: string;
  solicitante_id: string;
  solicitante_nome: string;
  solicitante_email: string | null;
  categoria: string;
  titulo: string;
  descricao: string;
  prioridade: string;
  status: string;
  sla_limite: string;
  primeira_resposta_em: string | null;
};

type TicketMessage = {
  id: string;
  autor_id: string;
  autor_nome: string;
  interno: boolean;
  mensagem: string;
  created_at: string;
};

const STATUS = ['aberto', 'em_atendimento', 'aguardando_cliente', 'resolvido', 'fechado'];
const PRIORIDADES = ['baixa', 'normal', 'alta', 'critica'];
const CATEGORIAS = ['duvida', 'incidente', 'financeiro', 'integracao', 'seguranca'];
const statusLabel: Record<string, string> = { aberto: 'Aberto', em_atendimento: 'Em atendimento', aguardando_cliente: 'Aguardando cliente', resolvido: 'Resolvido', fechado: 'Fechado' };
const prioridadeLabel: Record<string, string> = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', critica: 'Crítica' };
const categoriaLabel: Record<string, string> = { duvida: 'Dúvida', incidente: 'Incidente', financeiro: 'Financeiro', integracao: 'Integração', seguranca: 'Segurança' };

function formatarData(value: string | null | undefined) {
  if (!value) return 'Data indisponível';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export default function CentralSuporte() {
  const { profile, isPlatformAdmin, user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState('normal');
  const [categoria, setCategoria] = useState('duvida');
  const [selecionado, setSelecionado] = useState<Ticket | null>(null);
  const [mensagem, setMensagem] = useState('');
  const [notaInterna, setNotaInterna] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [filtroPrioridade, setFiltroPrioridade] = useState('all');
  const [pagina, setPagina] = useState(0);
  const [criando, setCriando] = useState(false);
  const [respondendo, setRespondendo] = useState(false);
  const [statusAtualizando, setStatusAtualizando] = useState<string | null>(null);
  const createLock = useRef(false);
  const replyLock = useRef(false);
  const statusLocks = useRef(new Set<string>());
  const supportScope = useRef(`${user?.id ?? ''}:${profile?.clinica_id ?? ''}:${isPlatformAdmin}`);

  useEffect(() => {
    const nextScope = `${user?.id ?? ''}:${profile?.clinica_id ?? ''}:${isPlatformAdmin}`;
    if (supportScope.current === nextScope) return;
    supportScope.current = nextScope;
    setSelecionado(null);
    setMensagem('');
    setNotaInterna(false);
    setTitulo('');
    setDescricao('');
  }, [user?.id, profile?.clinica_id, isPlatformAdmin]);

  useEffect(() => {
    setPagina(0);
  }, [busca, filtroPrioridade, filtroStatus]);

  const tickets = useQuery({
    queryKey: ['support-tickets', user?.id ?? null, profile?.clinica_id ?? null, isPlatformAdmin, pagina],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      const inicio = pagina * 100;
      const { data, error, count } = await (supabase as any)
        .from('support_tickets')
        .select('id,clinica_id,solicitante_id,categoria,titulo,descricao,prioridade,status,sla_limite,primeira_resposta_em,created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(inicio, inicio + 99);
      if (error) throw error;
      const rows = data ?? [];
      const clinicIds = [...new Set(rows.map((row: any) => row.clinica_id))];
      const requesterIds = [...new Set(rows.map((row: any) => row.solicitante_id))];
      const [clinicsResult, profilesResult] = await Promise.all([
        clinicIds.length ? (supabase as any).from('clinicas').select('id,nome').in('id', clinicIds) : Promise.resolve({ data: [], error: null }),
        requesterIds.length ? (supabase as any).from('profiles').select('id,nome,email').in('id', requesterIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (clinicsResult.error) throw clinicsResult.error;
      if (profilesResult.error) throw profilesResult.error;
      const clinicNames = new Map((clinicsResult.data ?? []).map((clinic: any) => [clinic.id, clinic.nome]));
      const requesters = new Map<string, any>((profilesResult.data ?? []).map((profile: any) => [profile.id, profile]));
      const items = rows.map((row: any) => ({
        ...row,
        clinica_nome: clinicNames.get(row.clinica_id) || 'Clínica sem nome',
        solicitante_nome: requesters.get(row.solicitante_id)?.nome || 'Solicitante indisponível',
        solicitante_email: requesters.get(row.solicitante_id)?.email || null,
      })) as Ticket[];
      return { items, total: count ?? inicio + items.length };
    },
  });

  const mensagens = useQuery({
    queryKey: ['support-messages', user?.id ?? null, profile?.clinica_id ?? null, selecionado?.id ?? null],
    enabled: !!user && !!selecionado,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('support_ticket_messages')
        .select('id,autor_id,mensagem,interno,created_at')
        .eq('ticket_id', selecionado!.id)
        .order('created_at');
      if (error) throw error;
      const rows = data ?? [];
      const authorIds = [...new Set(rows.map((row: any) => row.autor_id))];
      const { data: profiles, error: profilesError } = authorIds.length
        ? await (supabase as any).from('profiles').select('id,nome').in('id', authorIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;
      const authorNames = new Map((profiles ?? []).map((profile: any) => [profile.id, profile.nome]));
      return rows.map((row: any) => ({ ...row, autor_nome: authorNames.get(row.autor_id) || 'Usuário' })) as TicketMessage[];
    },
  });

  const criar = async () => {
    if (createLock.current || !user || !profile?.clinica_id || titulo.trim().length < 5 || descricao.trim().length < 10) return;
    const operationScope = supportScope.current;
    createLock.current = true;
    setCriando(true);
    try {
      const { error } = await (supabase as any).from('support_tickets').insert({
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        prioridade,
        categoria,
        clinica_id: profile.clinica_id,
        solicitante_id: user.id,
      });
      if (error) throw error;
      if (supportScope.current === operationScope) {
        setTitulo('');
        setDescricao('');
        setPrioridade('normal');
        setCategoria('duvida');
        setPagina(0);
      }
      await queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast.success('Chamado aberto.');
    } catch (error) {
      toast.error('Não foi possível abrir o chamado.', { description: mensagemDeErro(error) });
    } finally {
      createLock.current = false;
      setCriando(false);
    }
  };

  const responder = async () => {
    const texto = mensagem.trim();
    if (replyLock.current || !texto || !selecionado || !user) return;
    const operationScope = supportScope.current;
    const ticketId = selecionado.id;
    replyLock.current = true;
    setRespondendo(true);
    try {
      const { error } = await (supabase as any).from('support_ticket_messages').insert({
        ticket_id: selecionado.id,
        autor_id: user.id,
        mensagem: texto,
        interno: isPlatformAdmin && notaInterna,
      });
      if (error) throw error;
      if (supportScope.current === operationScope && selecionado?.id === ticketId) {
        setMensagem('');
        setNotaInterna(false);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['support-messages'] }),
        queryClient.invalidateQueries({ queryKey: ['support-tickets'] }),
      ]);
      toast.success('Resposta enviada.');
    } catch (error) {
      toast.error('Não foi possível enviar a resposta.', { description: mensagemDeErro(error) });
    } finally {
      replyLock.current = false;
      setRespondendo(false);
    }
  };

  const atualizarStatus = async (ticket: Ticket, novoStatus: string) => {
    if (statusLocks.current.size > 0) return;
    const operationScope = supportScope.current;
    statusLocks.current.add(ticket.id);
    setStatusAtualizando(ticket.id);
    try {
      const { data, error } = await (supabase as any)
        .from('support_tickets')
        .update({ status: novoStatus, resolvido_em: novoStatus === 'resolvido' || novoStatus === 'fechado' ? new Date().toISOString() : null })
        .eq('id', ticket.id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('O chamado não foi encontrado ou não pode mais ser atualizado.');
      if (supportScope.current === operationScope) {
        setSelecionado((current) => current?.id === ticket.id ? { ...current, status: novoStatus } : current);
      }
      await queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast.success('Status do chamado atualizado.');
    } catch (error) {
      toast.error('Não foi possível atualizar o chamado.', { description: mensagemDeErro(error) });
    } finally {
      statusLocks.current.delete(ticket.id);
      setStatusAtualizando(null);
    }
  };

  const chamados = tickets.data?.items ?? [];
  const totalChamados = tickets.data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalChamados / 100));
  useEffect(() => {
    if (pagina >= totalPaginas) setPagina(Math.max(0, totalPaginas - 1));
  }, [pagina, totalPaginas]);
  const chamadosVisiveis = useMemo(() => {
    const term = busca.trim().toLocaleLowerCase('pt-BR');
    const priorityOrder: Record<string, number> = { critica: 0, alta: 1, normal: 2, baixa: 3 };
    return chamados.filter(ticket => {
      if (filtroStatus !== 'all' && ticket.status !== filtroStatus) return false;
      if (filtroPrioridade !== 'all' && ticket.prioridade !== filtroPrioridade) return false;
      if (!term) return true;
      return `${ticket.titulo} ${ticket.descricao} ${ticket.clinica_nome} ${ticket.solicitante_nome} ${ticket.solicitante_email || ''} ${ticket.categoria}`.toLocaleLowerCase('pt-BR').includes(term);
    }).sort((a, b) => {
      const aDue = new Date(a.sla_limite).getTime();
      const bDue = new Date(b.sla_limite).getTime();
      const aOverdue = !a.primeira_resposta_em && Number.isFinite(aDue) && aDue < Date.now() && !['resolvido', 'fechado'].includes(a.status);
      const bOverdue = !b.primeira_resposta_em && Number.isFinite(bDue) && bDue < Date.now() && !['resolvido', 'fechado'].includes(b.status);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      const priorityDiff = (priorityOrder[a.prioridade] ?? 4) - (priorityOrder[b.prioridade] ?? 4);
      if (priorityDiff) return priorityDiff;
      if (Number.isFinite(aDue) && Number.isFinite(bDue) && aDue !== bDue) return aDue - bDue;
      return new Date(b.sla_limite).getTime() - new Date(a.sla_limite).getTime();
    });
  }, [busca, chamados, filtroPrioridade, filtroStatus]);

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
              <p className="text-xs text-muted-foreground">Mínimo de 5 caracteres · {titulo.length}/120</p>
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
                <SelectContent>{PRIORIDADES.map((item) => <SelectItem key={item} value={item}>{prioridadeLabel[item]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="support-category">Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger id="support-category"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map((item) => <SelectItem key={item} value={item}>{categoriaLabel[item]}</SelectItem>)}</SelectContent>
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
            <CardDescription>{chamadosVisiveis.length} de {chamados.length} nesta página · {totalChamados} no total · atrasados e prioritários aparecem primeiro em cada página</CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              <div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={busca} onChange={event => setBusca(event.target.value)} className="pl-9" placeholder="Buscar nesta página" aria-label="Buscar chamados nesta página" /></div>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}><SelectTrigger className="w-44" aria-label="Filtrar chamados por status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem>{STATUS.map(status => <SelectItem key={status} value={status}>{statusLabel[status]}</SelectItem>)}</SelectContent></Select>
              <Select value={filtroPrioridade} onValueChange={setFiltroPrioridade}><SelectTrigger className="w-40" aria-label="Filtrar chamados por prioridade"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas prioridades</SelectItem>{PRIORIDADES.map(priority => <SelectItem key={priority} value={priority}>{prioridadeLabel[priority]}</SelectItem>)}</SelectContent></Select>
              <Button variant="outline" size="icon" aria-label="Atualizar chamados" onClick={() => void tickets.refetch()} disabled={tickets.isFetching}><RefreshCw className={`h-4 w-4 ${tickets.isFetching ? 'animate-spin' : ''}`} /></Button>
            </div>
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
            ) : chamadosVisiveis.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center"><p className="font-medium">Nenhum chamado corresponde aos filtros</p><Button className="mt-2" size="sm" variant="ghost" onClick={() => { setBusca(''); setFiltroStatus('all'); setFiltroPrioridade('all'); }}>Limpar filtros</Button></div>
            ) : chamadosVisiveis.map((ticket) => {
              const prazo = new Date(ticket.sla_limite).getTime();
              const slaVencido = !ticket.primeira_resposta_em && Number.isFinite(prazo) && prazo < Date.now() && !['resolvido', 'fechado'].includes(ticket.status);
              return <div key={ticket.id} className="rounded-lg border p-3">
                <button type="button" onClick={() => { setSelecionado(ticket); setNotaInterna(false); }} aria-pressed={selecionado?.id === ticket.id} className="w-full rounded text-left hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{ticket.titulo}</span>
                    <Badge variant={ticket.prioridade === 'critica' ? 'destructive' : 'outline'}>{prioridadeLabel[ticket.prioridade] || ticket.prioridade}</Badge>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {isPlatformAdmin && <span className="flex items-center gap-1"><Building2 aria-hidden="true" className="h-3 w-3" />{ticket.clinica_nome}</span>}
                    <span className="flex items-center gap-1"><UserRound aria-hidden="true" className="h-3 w-3" />{ticket.solicitante_nome}{isPlatformAdmin && ticket.solicitante_email ? ` · ${ticket.solicitante_email}` : ''}</span>
                    <span className="flex items-center gap-1"><Clock aria-hidden="true" className="h-3 w-3" />{ticket.primeira_resposta_em ? `Primeira resposta ${formatarData(ticket.primeira_resposta_em)}` : `SLA ${formatarData(ticket.sla_limite)}`}</span>
                  </span>
                  {slaVencido && <Badge className="mt-2" variant="destructive">SLA vencido</Badge>}
                  <span className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{categoriaLabel[ticket.categoria] || ticket.categoria}</Badge>
                    {!isPlatformAdmin && <Badge variant={ticket.status === 'resolvido' || ticket.status === 'fechado' ? 'outline' : 'secondary'}>{statusLabel[ticket.status] || ticket.status}</Badge>}
                  </span>
                </button>
                {isPlatformAdmin && (
                  <Select value={ticket.status} onValueChange={(value) => void atualizarStatus(ticket, value)} disabled={statusAtualizando !== null}>
                    <SelectTrigger className="mt-2 h-9" aria-label={`Status do chamado ${ticket.titulo}`}>
                      {statusAtualizando === ticket.id ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <SelectValue />}
                    </SelectTrigger>
                    <SelectContent>{STATUS.map((status) => <SelectItem key={status} value={status}>{statusLabel[status]}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>;
            })}
            {!tickets.isLoading && !tickets.isError && totalChamados > 100 && (
              <div className="flex items-center justify-between gap-3 border-t pt-3">
                <Button variant="outline" size="sm" onClick={() => setPagina((atual) => Math.max(0, atual - 1))} disabled={pagina === 0 || tickets.isFetching}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" />Anterior
                </Button>
                <span className="text-xs text-muted-foreground">Página {pagina + 1} de {totalPaginas}</span>
                <Button variant="outline" size="sm" onClick={() => setPagina((atual) => Math.min(totalPaginas - 1, atual + 1))} disabled={pagina + 1 >= totalPaginas || tickets.isFetching}>
                  Próxima<ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            )}
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
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{categoriaLabel[selecionado.categoria] || selecionado.categoria} · {prioridadeLabel[selecionado.prioridade] || selecionado.prioridade}</span>
                  {isPlatformAdmin && <span>{selecionado.clinica_nome} · {selecionado.solicitante_nome}{selecionado.solicitante_email ? ` (${selecionado.solicitante_email})` : ''}</span>}
                  <span>{selecionado.primeira_resposta_em ? `Primeira resposta: ${formatarData(selecionado.primeira_resposta_em)}` : `Prazo da primeira resposta: ${formatarData(selecionado.sla_limite)}`}</span>
                </div>
                <div aria-live="polite" className="max-h-72 space-y-2 overflow-auto rounded-md border p-3">
                  {mensagens.isLoading ? (
                    <p role="status" className="text-sm text-muted-foreground">Carregando mensagens…</p>
                  ) : mensagens.isError ? (
                    <ErrorState compact title="Não foi possível carregar as mensagens" error={mensagens.error} onRetry={() => void mensagens.refetch()} />
                  ) : mensagens.data?.length ? mensagens.data.map((item) => (
                    <div key={item.id} className={`rounded-lg p-2 text-sm ${item.interno ? 'border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20' : 'bg-muted'}`}>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-medium">{item.autor_nome}</span>
                        {item.interno && <Badge variant="outline">Nota interna · só plataforma</Badge>}
                      </div>
                      <p className="whitespace-pre-wrap">{item.mensagem}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{formatarData(item.created_at)}</p>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">Ainda não há mensagens neste chamado.</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="support-reply">Responder</Label>
                  <Textarea id="support-reply" value={mensagem} onChange={(event) => setMensagem(event.target.value)} maxLength={4000} />
                  <p className="text-xs text-muted-foreground">{mensagem.length}/4000</p>
                </div>
                {isPlatformAdmin && <label className="flex min-h-11 items-center gap-2 text-sm">
                  <Checkbox checked={notaInterna} onCheckedChange={(value) => setNotaInterna(value === true)} />
                  Nota interna, visível somente à plataforma
                </label>}
                <Button onClick={responder} disabled={respondendo || !mensagem.trim() || mensagem.trim().length > 4000}>
                  {respondendo ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <Send aria-hidden="true" className="mr-2 h-4 w-4" />}
                  {respondendo ? 'Enviando…' : notaInterna && isPlatformAdmin ? 'Adicionar nota interna' : 'Enviar resposta'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
