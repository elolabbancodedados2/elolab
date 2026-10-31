import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus, Search, Eye, ArrowRight, CalendarPlus, X, Link2, FlaskConical, AlertTriangle, RefreshCw, Phone, FlaskConical as LabIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { linkWhatsApp } from '@/lib/whatsapp';

const FORMATADOR_DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const FORMATADOR_DATA_HORA_LONGA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function formatarDataHoraSaoPaulo(value?: string | null, longo = false): string {
  if (!value) return '—';
  const instante = new Date(value);
  if (!Number.isFinite(instante.getTime())) return '—';
  return (longo ? FORMATADOR_DATA_HORA_LONGA : FORMATADOR_DATA_HORA).format(instante);
}
const STATUS_LABEL: Record<string, { label: string; variant: any; badge: string }> = {
  recebida: { label: 'Recebida', variant: 'secondary', badge: 'border-warning/40 bg-warning/10 text-warning-foreground' },
  em_analise: { label: 'Em análise', variant: 'default', badge: 'border-primary/30 bg-primary/10 text-primary' },
  agendada: { label: 'Agendada', variant: 'default', badge: 'border-info/30 bg-info/10 text-info' },
  encaminhada_fila: { label: 'Na fila', variant: 'default', badge: 'border-primary/30 bg-primary/10 text-primary' },
  finalizada: { label: 'Finalizada', variant: 'outline', badge: 'border-success/30 bg-success/10 text-success' },
  cancelada: { label: 'Cancelada', variant: 'destructive', badge: 'border-border bg-muted text-muted-foreground' },
};

const ORIGEM_LABEL: Record<string, string> = {
  manual: 'Manual',
  portal: 'Portal externo',
  email: 'E-mail',
  api: 'API',
};

type FiltroStatus = 'todos' | 'recebida' | 'em_analise' | 'agendada' | 'encaminhada_fila' | 'finalizada' | 'cancelada';

const PILL_FILTERS: { key: FiltroStatus; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'recebida', label: 'Aguardando' },
  { key: 'em_analise', label: 'Em análise' },
  { key: 'agendada', label: 'Agendadas' },
  { key: 'encaminhada_fila', label: 'Na fila' },
  { key: 'finalizada', label: 'Finalizadas' },
  { key: 'cancelada', label: 'Canceladas' },
];

export default function GuiasExternas() {
  const navigate = useNavigate();
  const location = useLocation();
  const openNew = () => navigate('/guias-externas/nova', { state: { guiaFilters: { search, filterStatus } } });
  const { profile } = useSupabaseAuth();
  const [search, setSearch] = useState(location.state?.guiaFilters?.search ?? '');
  const [filterStatus, setFilterStatus] = useState<FiltroStatus>(location.state?.guiaFilters?.filterStatus ?? 'todos');
  const openDetail = (id: string) => navigate(`/guias-externas/${id}`, { state: { guiaFilters: { search, filterStatus } } });
  const openPortal = () => navigate('/guias-externas/portal', { state: { guiaFilters: { search, filterStatus } } });

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

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return (guias as any[]).filter((g) => {
      const matchSearch =
        !s ||
        g.paciente_nome?.toLowerCase().includes(s) ||
        g.medico_externo_nome?.toLowerCase().includes(s) ||
        g.convenio_nome?.toLowerCase().includes(s) ||
        g.numero_autorizacao?.toLowerCase().includes(s);
      const matchStatus = filterStatus === 'todos' || g.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [guias, search, filterStatus]);

  const counts = useMemo(() => {
    const c = { total: 0, recebida: 0, em_analise: 0, agendada: 0, fila: 0 };
    (guias as any[]).forEach((g) => {
      c.total++;
      if (g.status === 'recebida') c.recebida++;
      if (g.status === 'em_analise') c.em_analise++;
      if (g.status === 'agendada') c.agendada++;
      if (g.status === 'encaminhada_fila') c.fila++;
    });
    return c;
  }, [guias]);

  // Hero: guia mais urgente (mais antiga com status recebida ou em_analise)
  const guiaMaisUrgente = useMemo(() => {
    const pendentes = (guias as any[]).filter(
      (g) => g.status === 'recebida' || g.status === 'em_analise',
    );
    if (pendentes.length === 0) return null;
    return [...pendentes].sort((a, b) => {
      const da = new Date(a.data_recebimento ?? 0).getTime();
      const db = new Date(b.data_recebimento ?? 0).getTime();
      return da - db; // mais antiga primeiro
    })[0];
  }, [guias]);

  const temFiltro = search.trim() !== '' || filterStatus !== 'todos';

  const toggleFiltro = (key: FiltroStatus) =>
    setFilterStatus((prev) => (prev === key ? 'todos' : key));

  const descricao = counts.total > 0
    ? `${counts.total} guia${counts.total === 1 ? '' : 's'} · ${counts.recebida + counts.em_analise} aguardando · ${counts.fila} na fila`
    : 'Receba pedidos de exames vindos de médicos e clínicas externas';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guias Externas"
        description={descricao}
        icon={<FileText />}
        actions={
          <>
            <Button
              asChild
              variant="outline"
              className="shrink-0 gap-2 rounded-full"
            >
              <Link to="/exames">
                <FlaskConical aria-hidden="true" className="h-4 w-4" /> Exames
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="shrink-0 gap-2 rounded-full"
            >
              <Link to="/laboratorio">
                <LabIcon aria-hidden="true" className="h-4 w-4" /> Laboratório
              </Link>
            </Button>
            <Button
              variant="outline"
              className="shrink-0 gap-1.5 rounded-full"
              onClick={openPortal}
            >
              <Link2 className="h-4 w-4" /> Portal externo
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={() => void refetchGuias()}
              aria-label="Atualizar guias externas"
              title="Atualizar"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              onClick={openNew}
              className="shrink-0 gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110"
            >
              <Plus className="h-4 w-4" /> Nova guia
            </Button>
          </>
        }
      />

      {/* Indicator strip */}
      <section role="group" aria-label="Indicadores de guias externas">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {([
            {
              key: 'recebida' as FiltroStatus,
              icon: AlertTriangle,
              label: 'Aguardando',
              caption: 'recebidas sem ação',
              value: counts.recebida,
              color: 'text-foreground',
              surface: 'bg-secondary',
              escuro: false,
            },
            {
              key: 'em_analise' as FiltroStatus,
              icon: Eye,
              label: 'Em análise',
              caption: 'sendo avaliadas',
              value: counts.em_analise,
              color: 'text-primary',
              surface: 'bg-primary/10',
              escuro: false,
            },
            {
              key: 'agendada' as FiltroStatus,
              icon: CalendarPlus,
              label: 'Agendadas',
              caption: 'coleta marcada',
              value: counts.agendada,
              color: 'text-info',
              surface: 'bg-info/10',
              escuro: false,
            },
            {
              key: 'encaminhada_fila' as FiltroStatus,
              icon: ArrowRight,
              label: 'Na fila',
              caption: 'enviadas para coleta',
              value: counts.fila,
              color: 'text-success',
              surface: 'bg-success/10',
              escuro: false,
            },
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
                  'group rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  s.escuro && 'border-transparent bg-gradient-primary text-white',
                  ativo && !s.escuro && 'border-primary/50 ring-1 ring-primary/30',
                  ativo && s.escuro && 'ring-2 ring-primary/60',
                )}
              >
                <div className="flex min-h-[96px] items-center gap-3 p-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.surface)}>
                    <Icon aria-hidden="true" className={cn('h-5 w-5', s.color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className={cn('truncate text-xs font-semibold', s.escuro ? 'text-white/80' : 'text-foreground')}>{s.label}</h3>
                      <span className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</span>
                    </div>
                    <p className={cn('truncate text-[11px]', s.escuro ? 'text-white/60' : 'text-muted-foreground')}>{s.caption}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Hero card — guia mais urgente */}
      {guiaMaisUrgente && (
        <div className="rounded-2xl border border-primary/30 bg-card p-4 shadow-[0_8px_24px_rgba(16,128,202,0.12)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-primary">Mais urgente · aguardando ação</p>
                <p className="text-lg font-bold text-foreground truncate">{guiaMaisUrgente.paciente_nome}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {guiaMaisUrgente.medico_externo_nome && <span>Dr. {guiaMaisUrgente.medico_externo_nome}</span>}
                  {guiaMaisUrgente.convenio_nome && <span>· {guiaMaisUrgente.convenio_nome}</span>}
                  <span>· recebida {formatarDataHoraSaoPaulo(guiaMaisUrgente.data_recebimento)}</span>
                  <Badge className={cn('rounded-full text-[10px] border', STATUS_LABEL[guiaMaisUrgente.status]?.badge)}>
                    {STATUS_LABEL[guiaMaisUrgente.status]?.label || guiaMaisUrgente.status}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {guiaMaisUrgente.paciente_telefone && (() => {
                const waLink = linkWhatsApp(guiaMaisUrgente.paciente_telefone, `Olá, ${guiaMaisUrgente.paciente_nome}! Entramos em contato sobre sua guia de exames recebida.`);
                return waLink ? (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 rounded-full text-xs border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <a href={waLink} target="_blank" rel="noopener noreferrer" aria-label={`Contatar ${guiaMaisUrgente.paciente_nome} via WhatsApp`}>
                      <Phone className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  </Button>
                ) : null;
              })()}
              <Button
                size="sm"
                className="h-9 gap-1.5 rounded-full bg-gradient-primary px-4 text-xs text-white hover:brightness-110"
                onClick={() => openDetail(guiaMaisUrgente.id)}
              >
                <ArrowRight className="h-3.5 w-3.5" /> Atender guia
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar guias externas"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Paciente, médico, convênio..."
            className="h-10 rounded-full pl-9 focus-visible:ring-primary"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PILL_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filterStatus === f.key}
              onClick={() => toggleFiltro(f.key)}
              className={cn(
                'h-8 rounded-full border px-3 text-xs transition-all',
                filterStatus === f.key
                  ? 'border-transparent bg-gradient-primary text-white shadow-sm'
                  : 'border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {temFiltro && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 rounded-full text-muted-foreground"
            onClick={() => { setSearch(''); setFilterStatus('todos'); }}
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" /> Limpar filtros
          </Button>
        )}
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {filtered.length} de {(guias as any[]).length} guia{(guias as any[]).length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Table */}
      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardContent className="p-0">
          {guias.length >= LIMITE_BUSCA_EM_BLOCOS && (
            <div role="alert" className="m-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>A lista atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} guias. Guias mais antigas podem não aparecer; refine a busca ou o status.</p>
            </div>
          )}

          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-40 w-full" />
            </div>
          ) : guiasError ? (
            <div className="p-6">
              <ErrorState compact title="Não foi possível carregar as guias externas" error={guiasError} onRetry={() => void refetchGuias()} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                <FileText className="h-7 w-7" />
              </span>
              <p className="font-medium text-foreground">
                {temFiltro ? 'Nenhuma guia corresponde aos filtros' : 'Nenhuma guia externa registrada'}
              </p>
              <p className="mt-1 text-sm">
                {temFiltro
                  ? 'Altere ou limpe a busca e o status selecionado.'
                  : 'Clique em "Nova guia" para começar.'}
              </p>
              {temFiltro ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 rounded-full"
                  onClick={() => { setSearch(''); setFilterStatus('todos'); }}
                >
                  Limpar filtros
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="mt-4 rounded-full bg-gradient-primary text-white hover:brightness-110"
                  onClick={openNew}
                >
                  Nova guia
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/60 m-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Médico externo</TableHead>
                    <TableHead>Convênio / Aut.</TableHead>
                    <TableHead>Exames</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Recebida</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((g: any) => {
                    const waLink = linkWhatsApp(
                      g.paciente_telefone,
                      `Olá, ${g.paciente_nome}! Entramos em contato sobre sua guia de exames.`,
                    );
                    return (
                      <TableRow key={g.id} className="hover:bg-[#F3F8FC]/60">
                        <TableCell>
                          <p className="font-medium">{g.paciente_nome}</p>
                          {g.paciente_cpf && <p className="text-xs text-muted-foreground">{g.paciente_cpf}</p>}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{g.medico_externo_nome || '—'}</p>
                          {g.medico_externo_crm && (
                            <p className="text-xs text-muted-foreground">CRM {g.medico_externo_crm}/{g.medico_externo_uf || ''}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{g.convenio_nome || '—'}</p>
                          {g.numero_autorizacao && <p className="text-xs text-muted-foreground">#{g.numero_autorizacao}</p>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1 rounded-full">
                            <FlaskConical className="h-3 w-3" />
                            {Array.isArray(g.exames_solicitados) ? g.exames_solicitados.length : 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="rounded-full text-xs">{ORIGEM_LABEL[g.origem] || g.origem}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatarDataHoraSaoPaulo(g.data_recebimento)}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('rounded-full border text-[10px]', STATUS_LABEL[g.status]?.badge)}>
                            {STATUS_LABEL[g.status]?.label || g.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {waLink && (
                              <Button
                                asChild
                                size="sm"
                                variant="ghost"
                                className="h-9 rounded-full px-2 text-xs text-primary hover:bg-primary/10"
                              >
                                <a
                                  href={waLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`WhatsApp para ${g.paciente_nome}`}
                                >
                                  <Phone className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openDetail(g.id)}
                              className="h-9 rounded-full px-3 text-xs gap-1"
                            >
                              <Eye className="h-3.5 w-3.5" /> Abrir
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cross-links */}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button asChild variant="outline" size="sm" className="h-8 rounded-full text-xs gap-1.5">
          <Link to="/exames"><FlaskConical className="h-3.5 w-3.5" /> Gerenciar exames</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 rounded-full text-xs gap-1.5">
          <Link to="/laboratorio"><LabIcon className="h-3.5 w-3.5" /> Laboratório parceiro</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 rounded-full text-xs gap-1.5">
          <Link to="/laudos-lab"><FileText className="h-3.5 w-3.5" /> Laudos</Link>
        </Button>
      </div>


    </div>
  );
}
