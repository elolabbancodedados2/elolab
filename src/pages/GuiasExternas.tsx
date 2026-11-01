import { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus, Search, Eye, ArrowRight, CalendarPlus, X, Link2, FlaskConical, AlertTriangle, RefreshCw, Phone, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { LaboratorioSubnav } from '@/components/laboratorio/LaboratorioSubnav';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { cn } from '@/lib/utils';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { rotuloAutorizacao, situacaoAutorizacao, STATUS_GUIA_EM_ATENDIMENTO } from '@/lib/guiaExternaAutorizacao';

const FORMATADOR_DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function formatarDataHoraSaoPaulo(value?: string | null): string {
  if (!value) return '—';
  const instante = new Date(value);
  if (!Number.isFinite(instante.getTime())) return '—';
  return FORMATADOR_DATA_HORA.format(instante);
}

// Estados normais em neutro; "Cancelada" apagada. Âmbar e vermelho ficam para a autorização com problema.
const STATUS_LABEL: Record<string, { label: string; badge: string }> = {
  recebida: { label: 'Recebida', badge: 'border-border bg-card text-foreground' },
  em_analise: { label: 'Em análise', badge: 'border-border bg-secondary text-foreground' },
  agendada: { label: 'Agendada', badge: 'border-border bg-secondary text-foreground' },
  encaminhada_fila: { label: 'Na fila', badge: 'border-border bg-secondary text-foreground' },
  finalizada: { label: 'Finalizada', badge: 'border-transparent bg-primary text-primary-foreground' },
  cancelada: { label: 'Cancelada', badge: 'border-border bg-muted text-muted-foreground' },
};

const ORIGEM_LABEL: Record<string, string> = {
  manual: 'Manual',
  portal: 'Portal externo',
  email: 'E-mail',
  api: 'API',
};

type FiltroStatus = 'todos' | 'recebida' | 'em_analise' | 'agendada' | 'encaminhada_fila' | 'finalizada' | 'cancelada' | 'autorizacao';

const PILL_FILTERS: { key: FiltroStatus; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'recebida', label: 'Aguardando' },
  { key: 'em_analise', label: 'Em análise' },
  { key: 'agendada', label: 'Agendadas' },
  { key: 'encaminhada_fila', label: 'Na fila' },
  { key: 'finalizada', label: 'Finalizadas' },
  { key: 'cancelada', label: 'Canceladas' },
  { key: 'autorizacao', label: 'Autorização vencendo ou vencida' },
];

function SeloAutorizacao({ guia, hoje }: { guia: any; hoje: string }) {
  if (!STATUS_GUIA_EM_ATENDIMENTO.has(guia.status)) return null;
  const { situacao, dias } = situacaoAutorizacao(guia.validade_autorizacao, hoje);
  const rotulo = rotuloAutorizacao(situacao, dias);
  if (!rotulo) return null;
  return (
    <Badge variant="outline" className={cn('gap-1 rounded-full text-xs', situacao === 'vencida' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-warning/40 bg-warning/10 text-warning-foreground')}>
      <ShieldAlert aria-hidden="true" className="h-3 w-3" />{rotulo}
    </Badge>
  );
}

export default function GuiasExternas() {
  const navigate = useNavigate();
  const location = useLocation();
  const openNew = () => navigate('/guias-externas/nova', { state: { guiaFilters: { search, filterStatus } } });
  const { profile } = useSupabaseAuth();
  const [search, setSearch] = useState(location.state?.guiaFilters?.search ?? '');
  const [filterStatus, setFilterStatus] = useState<FiltroStatus>(location.state?.guiaFilters?.filterStatus ?? 'todos');
  const openDetail = (id: string) => navigate(`/guias-externas/${id}`, { state: { guiaFilters: { search, filterStatus } } });
  const openPortal = () => navigate('/guias-externas/portal', { state: { guiaFilters: { search, filterStatus } } });
  const hoje = todaySaoPauloDateOnly();

  const { data: guias = [], isLoading, error: guiasError, refetch: refetchGuias } = useQuery({
    queryKey: ['guias_externas', profile?.clinica_id],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      return buscarEmBlocos<any>(() => (supabase as any)
        .from('guias_externas')
        .select('*')
        .eq('clinica_id', profile!.clinica_id)
        .order('data_recebimento', { ascending: false })
        .order('id', { ascending: true }));
    },
  });

  const autorizacaoComProblema = (g: any) => STATUS_GUIA_EM_ATENDIMENTO.has(g.status)
    && ['vencendo', 'vencida'].includes(situacaoAutorizacao(g.validade_autorizacao, hoje).situacao);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return (guias as any[]).filter((g) => {
      const matchSearch =
        !s ||
        g.paciente_nome?.toLowerCase().includes(s) ||
        g.medico_externo_nome?.toLowerCase().includes(s) ||
        g.convenio_nome?.toLowerCase().includes(s) ||
        g.numero_autorizacao?.toLowerCase().includes(s);
      const matchStatus = filterStatus === 'todos'
        || (filterStatus === 'autorizacao' ? autorizacaoComProblema(g) : g.status === filterStatus);
      return matchSearch && matchStatus;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guias, search, filterStatus, hoje]);

  const counts = useMemo(() => {
    const c = { total: 0, recebida: 0, em_analise: 0, agendada: 0, fila: 0, autorizacao: 0 };
    (guias as any[]).forEach((g) => {
      c.total++;
      if (g.status === 'recebida') c.recebida++;
      if (g.status === 'em_analise') c.em_analise++;
      if (g.status === 'agendada') c.agendada++;
      if (g.status === 'encaminhada_fila') c.fila++;
      if (autorizacaoComProblema(g)) c.autorizacao++;
    });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guias, hoje]);

  // Hero: guia mais antiga ainda aguardando ação.
  const guiaMaisUrgente = useMemo(() => {
    const pendentes = (guias as any[]).filter((g) => g.status === 'recebida' || g.status === 'em_analise');
    if (pendentes.length === 0) return null;
    return [...pendentes].sort((a, b) => new Date(a.data_recebimento ?? 0).getTime() - new Date(b.data_recebimento ?? 0).getTime())[0];
  }, [guias]);

  const temFiltro = search.trim() !== '' || filterStatus !== 'todos';
  const toggleFiltro = (key: FiltroStatus) => setFilterStatus((prev) => (prev === key ? 'todos' : key));
  const limpar = () => { setSearch(''); setFilterStatus('todos'); };

  const descricao = counts.total > 0
    ? `${counts.total} guia${counts.total === 1 ? '' : 's'} · ${counts.recebida + counts.em_analise} aguardando · ${counts.fila} na fila`
    : 'Receba pedidos de exames vindos de médicos e clínicas externas';

  const whatsDaGuia = (g: any) => linkWhatsApp(g.paciente_telefone, `Olá, ${g.paciente_nome}! Entramos em contato sobre sua guia de exames.`);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guias externas"
        description={descricao}
        icon={<FileText />}
        actions={
          <>
            <Button variant="outline" className="shrink-0 gap-1.5 rounded-full" onClick={openPortal}>
              <Link2 aria-hidden="true" className="h-4 w-4" /> Portal externo
            </Button>
            <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-full" onClick={() => void refetchGuias()} aria-label="Atualizar guias externas" title="Atualizar">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={openNew} className="shrink-0 gap-2 rounded-full">
              <Plus aria-hidden="true" className="h-4 w-4" /> Nova guia
            </Button>
          </>
        }
      />

      <LaboratorioSubnav />

      <section role="group" aria-label="Indicadores de guias externas">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {([
            { key: 'recebida' as FiltroStatus, icon: AlertTriangle, label: 'Aguardando', caption: 'recebidas sem ação', value: counts.recebida, problema: false },
            { key: 'em_analise' as FiltroStatus, icon: Eye, label: 'Em análise', caption: 'sendo avaliadas', value: counts.em_analise, problema: false },
            { key: 'agendada' as FiltroStatus, icon: CalendarPlus, label: 'Agendadas', caption: 'coleta marcada', value: counts.agendada, problema: false },
            { key: 'encaminhada_fila' as FiltroStatus, icon: ArrowRight, label: 'Na fila', caption: 'enviadas para coleta', value: counts.fila, problema: false },
            { key: 'autorizacao' as FiltroStatus, icon: ShieldAlert, label: 'Autorização', caption: 'vencendo ou vencida', value: counts.autorizacao, problema: counts.autorizacao > 0 },
          ]).map((s) => {
            const Icon = s.icon;
            const ativo = filterStatus === s.key;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={ativo}
                onClick={() => toggleFiltro(s.key)}
                className={cn(
                  'rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  ativo && 'border-transparent bg-primary text-primary-foreground',
                )}
              >
                <div className="flex min-h-[88px] items-center gap-3 p-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', ativo ? 'bg-primary-foreground/15' : s.problema ? 'bg-warning/10' : 'bg-secondary')}>
                    <Icon aria-hidden="true" className={cn('h-5 w-5', ativo ? 'text-primary-foreground' : s.problema ? 'text-warning-foreground' : 'text-foreground')} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="truncate text-xs font-semibold">{s.label}</h3>
                      <span className="text-2xl font-bold tabular-nums">{s.value}</span>
                    </div>
                    <p className={cn('truncate text-xs', ativo ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{s.caption}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {guiaMaisUrgente && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-foreground">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">Mais antiga aguardando ação</p>
                <p className="truncate text-lg font-bold text-foreground">{guiaMaisUrgente.paciente_nome}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {guiaMaisUrgente.medico_externo_nome && <span>{guiaMaisUrgente.medico_externo_nome}</span>}
                  {guiaMaisUrgente.convenio_nome && <span>· {guiaMaisUrgente.convenio_nome}</span>}
                  <span>· recebida {formatarDataHoraSaoPaulo(guiaMaisUrgente.data_recebimento)}</span>
                  <Badge variant="outline" className={cn('rounded-full text-xs', STATUS_LABEL[guiaMaisUrgente.status]?.badge)}>
                    {STATUS_LABEL[guiaMaisUrgente.status]?.label || guiaMaisUrgente.status}
                  </Badge>
                  <SeloAutorizacao guia={guiaMaisUrgente} hoje={hoje} />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {whatsDaGuia(guiaMaisUrgente) && (
                <Button asChild size="sm" variant="outline" className="min-h-11 gap-1.5 rounded-full text-xs">
                  <a href={whatsDaGuia(guiaMaisUrgente)!} target="_blank" rel="noopener noreferrer" aria-label={`Contatar ${guiaMaisUrgente.paciente_nome} via WhatsApp`}>
                    <Phone aria-hidden="true" className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                </Button>
              )}
              <Button size="sm" className="min-h-11 gap-1.5 rounded-full px-4 text-xs" onClick={() => openDetail(guiaMaisUrgente.id)}>
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /> Atender guia
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar guias externas" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Paciente, médico, convênio..." className="h-11 rounded-full pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PILL_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filterStatus === f.key}
              onClick={() => toggleFiltro(f.key)}
              className={cn(
                'min-h-11 rounded-full border px-3 text-xs transition-colors',
                filterStatus === f.key
                  ? 'border-transparent bg-primary text-primary-foreground shadow-sm'
                  : 'border-border/60 bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {temFiltro && (
          <Button variant="ghost" size="sm" className="min-h-11 gap-1.5 rounded-full text-muted-foreground" onClick={limpar}>
            <X aria-hidden="true" className="h-3.5 w-3.5" /> Limpar filtros
          </Button>
        )}
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {filtered.length} de {(guias as any[]).length} guia{(guias as any[]).length === 1 ? '' : 's'}
        </p>
      </div>

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardContent className="p-0">
          {guias.length >= LIMITE_BUSCA_EM_BLOCOS && (
            <div role="alert" className="m-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <p>A lista atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} guias. Guias mais antigas podem não aparecer; refine a busca ou o status.</p>
            </div>
          )}

          {isLoading ? (
            <div className="p-6"><Skeleton className="h-40 w-full" /></div>
          ) : guiasError ? (
            <div className="p-6"><ErrorState compact title="Não foi possível carregar as guias externas" error={guiasError} onRetry={() => void refetchGuias()} /></div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-16 text-center text-muted-foreground">
              <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
                <FileText className="h-7 w-7" />
              </span>
              <p className="font-medium text-foreground">{temFiltro ? 'Nenhuma guia corresponde aos filtros' : 'Nenhuma guia externa registrada'}</p>
              <p className="mt-1 text-sm">{temFiltro ? 'Altere ou limpe a busca e o status selecionado.' : 'Clique em "Nova guia" para começar.'}</p>
              {temFiltro
                ? <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={limpar}>Limpar filtros</Button>
                : <Button size="sm" className="mt-4 rounded-full" onClick={openNew}>Nova guia</Button>}
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border/60 md:hidden" aria-label="Guias externas">
                {filtered.map((g: any) => {
                  const waLink = whatsDaGuia(g);
                  return (
                    <li key={g.id} className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words font-medium">{g.paciente_nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {g.medico_externo_nome || 'Solicitante não informado'}{g.medico_externo_crm ? ` · CRM ${g.medico_externo_crm}/${g.medico_externo_uf || ''}` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {g.convenio_nome || 'Particular'}{g.numero_autorizacao ? ` · aut. ${g.numero_autorizacao}` : ''} · recebida {formatarDataHoraSaoPaulo(g.data_recebimento)}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn('shrink-0 rounded-full text-xs', STATUS_LABEL[g.status]?.badge)}>{STATUS_LABEL[g.status]?.label || g.status}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="outline" className="gap-1 rounded-full"><FlaskConical aria-hidden="true" className="h-3 w-3" />{Array.isArray(g.exames_solicitados) ? g.exames_solicitados.length : 0} exames</Badge>
                        <span>{ORIGEM_LABEL[g.origem] || g.origem}</span>
                        <SeloAutorizacao guia={g} hoje={hoje} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {waLink && (
                          <Button asChild size="sm" variant="outline" className="min-h-11 gap-1.5 rounded-full">
                            <a href={waLink} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp para ${g.paciente_nome}`}><Phone aria-hidden="true" className="h-4 w-4" />WhatsApp</a>
                          </Button>
                        )}
                        <Button size="sm" className="min-h-11 gap-1.5 rounded-full" onClick={() => openDetail(g.id)}>
                          <Eye aria-hidden="true" className="h-4 w-4" /> Abrir
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="m-1 hidden overflow-hidden rounded-xl border border-border/60 md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Médico externo</TableHead>
                      <TableHead>Convênio / autorização</TableHead>
                      <TableHead className="hidden lg:table-cell">Exames</TableHead>
                      <TableHead className="hidden xl:table-cell">Origem</TableHead>
                      <TableHead className="hidden lg:table-cell">Recebida</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((g: any) => {
                      const waLink = whatsDaGuia(g);
                      return (
                        <TableRow key={g.id} className="hover:bg-secondary/60">
                          <TableCell>
                            <p className="font-medium">{g.paciente_nome}</p>
                            {g.paciente_cpf && <p className="text-xs text-muted-foreground">{g.paciente_cpf}</p>}
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">{g.medico_externo_nome || '—'}</p>
                            {g.medico_externo_crm && <p className="text-xs text-muted-foreground">CRM {g.medico_externo_crm}/{g.medico_externo_uf || ''}</p>}
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">{g.convenio_nome || '—'}</p>
                            {g.numero_autorizacao && <p className="text-xs text-muted-foreground">#{g.numero_autorizacao}</p>}
                            <SeloAutorizacao guia={g} hoje={hoje} />
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <Badge variant="outline" className="gap-1 rounded-full">
                              <FlaskConical aria-hidden="true" className="h-3 w-3" />
                              {Array.isArray(g.exames_solicitados) ? g.exames_solicitados.length : 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden xl:table-cell"><Badge variant="secondary" className="rounded-full text-xs">{ORIGEM_LABEL[g.origem] || g.origem}</Badge></TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{formatarDataHoraSaoPaulo(g.data_recebimento)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('rounded-full text-xs', STATUS_LABEL[g.status]?.badge)}>{STATUS_LABEL[g.status]?.label || g.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {waLink && (
                                <Button asChild size="sm" variant="ghost" className="h-11 w-11 rounded-full p-0">
                                  <a href={waLink} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp para ${g.paciente_nome}`}>
                                    <Phone aria-hidden="true" className="h-4 w-4" />
                                  </a>
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => openDetail(g.id)} className="min-h-11 gap-1 rounded-full px-3 text-xs">
                                <Eye aria-hidden="true" className="h-3.5 w-3.5" /> Abrir
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
