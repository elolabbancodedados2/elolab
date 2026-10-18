import { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Plus, Upload, Search, ExternalLink, Loader2, Trash2, Eye,
  ArrowRight, CalendarPlus, CheckCircle2, X, Link2, Copy, Hash, FlaskConical, AlertTriangle,
  RefreshCw, Phone, Clock, FlaskConical as LabIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { abrirUrlSegura, storageUrlSeguro } from '@/lib/safeUrl';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { mensagemDeErro } from '@/lib/erros';
import { formatCPF, validateCPF } from '@/lib/formatters';
import { pathLaudoAnteriorAposSalvar, pathsLaudoExternoAoFechar } from '@/lib/guiasExternasStorage';
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

function paraDataHoraLocal(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const STATUS_LABEL: Record<string, { label: string; variant: any; badge: string }> = {
  recebida: { label: 'Recebida', variant: 'secondary', badge: 'border-warning/40 bg-warning/10 text-warning-foreground' },
  em_analise: { label: 'Em análise', variant: 'default', badge: 'border-[#1080CA]/30 bg-[#1080CA]/10 text-[#1080CA]' },
  agendada: { label: 'Agendada', variant: 'default', badge: 'border-info/30 bg-info/10 text-info' },
  encaminhada_fila: { label: 'Na fila', variant: 'default', badge: 'border-[#1080CA]/30 bg-[#1080CA]/10 text-[#1080CA]' },
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

async function obterOuCriarPacienteDaGuia(guia: any, clinicaId: string | null | undefined): Promise<string> {
  if (guia.paciente_id) return guia.paciente_id;
  if (!clinicaId) throw new Error('Clínica não identificada. Atualize a sessão e tente novamente.');

  const cpfOriginal = String(guia.paciente_cpf || '').trim();
  const cpfDigitos = cpfOriginal.replace(/\D/g, '');
  const cpfsPossiveis = new Set<string>(cpfOriginal ? [cpfOriginal] : []);
  if (cpfDigitos.length === 11) {
    cpfsPossiveis.add(cpfDigitos);
    cpfsPossiveis.add(`${cpfDigitos.slice(0, 3)}.${cpfDigitos.slice(3, 6)}.${cpfDigitos.slice(6, 9)}-${cpfDigitos.slice(9)}`);
  }

  const buscarPacientePorCpf = async () => {
    if (cpfDigitos.length !== 11 || cpfsPossiveis.size === 0) return null;
    const { data, error } = await supabase.from('pacientes')
      .select('id')
      .eq('clinica_id', clinicaId)
      .in('cpf', [...cpfsPossiveis])
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  };

  const pacienteExistente = await buscarPacientePorCpf();
  if (pacienteExistente) return pacienteExistente;

  const { data, error } = await (supabase as any).from('pacientes').insert({
    nome: guia.paciente_nome,
    cpf: cpfOriginal || null,
    data_nascimento: guia.paciente_nascimento || null,
    telefone: guia.paciente_telefone || null,
    email: guia.paciente_email || null,
    sexo: guia.paciente_sexo || null,
    clinica_id: clinicaId,
  }).select('id').single();
  if (!error && data?.id) return data.id;

  if ((error as any)?.code === '23505' && cpfDigitos.length === 11) {
    const pacienteConcorrente = await buscarPacientePorCpf();
    if (pacienteConcorrente) return pacienteConcorrente;
  }
  if (error) throw error;
  throw new Error('Não foi possível vincular ou criar o cadastro do paciente.');
}

export default function GuiasExternas() {
  const { profile, user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FiltroStatus>('todos');
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState(false);

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

  const detail = useMemo(() => (guias as any[]).find((g) => g.id === detailId), [guias, detailId]);
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
              onClick={() => setShowTokens(true)}
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
              onClick={() => setShowForm(true)}
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
              color: 'text-white',
              surface: 'bg-white/15',
              escuro: true,
            },
            {
              key: 'em_analise' as FiltroStatus,
              icon: Eye,
              label: 'Em análise',
              caption: 'sendo avaliadas',
              value: counts.em_analise,
              color: 'text-[#1080CA]',
              surface: 'bg-[#1080CA]/10',
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
                  'group rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                  s.escuro && 'border-transparent bg-gradient-primary text-white',
                  ativo && !s.escuro && 'border-[#1080CA]/50 ring-1 ring-[#1080CA]/30',
                  ativo && s.escuro && 'ring-2 ring-[#1080CA]/60',
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
        <div className="rounded-2xl border border-[#1080CA]/30 bg-card p-4 shadow-[0_8px_24px_rgba(16,128,202,0.12)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-[#1080CA]">Mais urgente · aguardando ação</p>
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
                    className="h-9 gap-1.5 rounded-full text-xs border-[#1080CA]/30 text-[#1080CA] hover:bg-[#1080CA]/10"
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
                onClick={() => setDetailId(guiaMaisUrgente.id)}
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
            className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]"
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
                  : 'border-border/60 bg-card text-muted-foreground hover:border-[#1080CA]/40 hover:text-foreground',
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
                  onClick={() => setShowForm(true)}
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
                                className="h-9 rounded-full px-2 text-xs text-[#1080CA] hover:bg-[#1080CA]/10"
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
                              onClick={() => setDetailId(g.id)}
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

      {showForm && (
        <GuiaFormDialog
          open={showForm}
          onClose={() => setShowForm(false)}
          clinicaId={profile?.clinica_id}
          userId={user?.id}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['guias_externas'] });
            setShowForm(false);
          }}
        />
      )}

      {detail && (
        <DetalheGuiaDialog
          key={detail.id}
          guia={detail}
          open={!!detail}
          onClose={() => setDetailId(null)}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['guias_externas'] })}
        />
      )}

      {showTokens && (
        <TokensPortalDialog open={showTokens} onClose={() => setShowTokens(false)} clinicaId={profile?.clinica_id} userId={user?.id} />
      )}
    </div>
  );
}

/* ─── Form de criação manual ─── */
function GuiaFormDialog({ open, onClose, clinicaId, userId, onSaved }: any) {
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    paciente_nome: '',
    paciente_cpf: '',
    paciente_nascimento: '',
    paciente_telefone: '',
    medico_externo_nome: '',
    medico_externo_crm: '',
    medico_externo_uf: '',
    medico_externo_especialidade: '',
    convenio_nome: '',
    numero_autorizacao: '',
    validade_autorizacao: '',
    observacoes: '',
    anexo_url: '',
    anexo_nome: '',
    exames_texto: '',
  });

  const handleUpload = async (file: File) => {
    const tiposAceitos = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    if (!tiposAceitos.has(file.type)) {
      toast.error('Use um arquivo PDF, JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('O anexo deve ter no máximo 10 MB.');
      return;
    }
    if (!clinicaId) {
      toast.error('Clínica não identificada. Atualize a sessão e tente novamente.');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${clinicaId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('guias-externas').upload(path, file);
      if (error) throw error;
      const anexoAnterior = form.anexo_url;
      setForm((f) => ({ ...f, anexo_url: path, anexo_nome: file.name }));
      toast.success('Anexo enviado');
      if (anexoAnterior && anexoAnterior !== path) {
        try {
          const { error: erroRemocao } = await supabase.storage.from('guias-externas').remove([anexoAnterior]);
          if (erroRemocao) throw erroRemocao;
        } catch (erroRemocao) {
          toast.warning('O novo anexo foi enviado, mas o arquivo anterior não pôde ser removido.', {
            description: mensagemDeErro(erroRemocao),
          });
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro no upload');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = async () => {
    if (saveLock.current || saving || uploading) return;
    if (form.anexo_url) {
      try {
        const { error } = await supabase.storage.from('guias-externas').remove([form.anexo_url]);
        if (error) toast.warning('O formulário foi fechado, mas não foi possível remover o anexo temporário.', { description: error.message });
      } catch (error) {
        toast.warning('O formulário foi fechado, mas não foi possível remover o anexo temporário.', { description: mensagemDeErro(error) });
      }
    }
    onClose();
  };

  const handleSave = async () => {
    if (uploading || saving) {
      toast.info('Aguarde o envio do anexo terminar antes de registrar a guia.');
      return;
    }
    if (saveLock.current) return;
    if (!clinicaId) { toast.error('Clínica não identificada. Atualize a sessão e tente novamente.'); return; }
    if (!form.paciente_nome.trim()) { toast.error('Nome do paciente é obrigatório'); return; }
    const cpfDigitos = form.paciente_cpf.replace(/\D/g, '');
    if (cpfDigitos && !validateCPF(cpfDigitos)) { toast.error('CPF inválido. Confira os números digitados.'); return; }
    if (form.paciente_nascimento) {
      const nascimento = /^\d{4}-\d{2}-\d{2}$/.test(form.paciente_nascimento)
        ? new Date(`${form.paciente_nascimento}T12:00:00`)
        : new Date(Number.NaN);
      const nascimentoValido = /^\d{4}-\d{2}-\d{2}$/.test(form.paciente_nascimento)
        && Number.isFinite(nascimento.getTime())
        && format(nascimento, 'yyyy-MM-dd') === form.paciente_nascimento
        && form.paciente_nascimento <= todaySaoPauloDateOnly();
      if (!nascimentoValido) { toast.error('Informe uma data de nascimento válida, que não esteja no futuro.'); return; }
    }
    const exames = form.exames_texto
      .split('\n').map((l) => l.trim()).filter(Boolean)
      .map((nome) => ({ nome }));
    if (exames.length === 0) { toast.error('Liste ao menos um exame'); return; }

    saveLock.current = true;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from('guias_externas').insert({
        clinica_id: clinicaId,
        origem: 'manual',
        status: 'recebida',
        paciente_nome: form.paciente_nome.trim(),
        paciente_cpf: cpfDigitos || null,
        paciente_nascimento: form.paciente_nascimento || null,
        paciente_telefone: form.paciente_telefone || null,
        medico_externo_nome: form.medico_externo_nome || null,
        medico_externo_crm: form.medico_externo_crm || null,
        medico_externo_uf: form.medico_externo_uf || null,
        medico_externo_especialidade: form.medico_externo_especialidade || null,
        convenio_nome: form.convenio_nome || null,
        numero_autorizacao: form.numero_autorizacao || null,
        validade_autorizacao: form.validade_autorizacao || null,
        observacoes: form.observacoes || null,
        anexo_url: form.anexo_url || null,
        anexo_nome: form.anexo_nome || null,
        exames_solicitados: exames,
        registrado_por: userId,
      });
      if (error) throw error;
      toast.success('Guia externa registrada');
      onSaved();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) void handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova guia externa</DialogTitle>
          <DialogDescription>Registre um pedido de exames recebido de fora da clínica.</DialogDescription>
        </DialogHeader>

        <fieldset disabled={saving || uploading} className="contents">
        <Tabs defaultValue="paciente" className="mt-2">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-auto">
            <TabsTrigger value="paciente">Paciente</TabsTrigger>
            <TabsTrigger value="medico">Médico</TabsTrigger>
            <TabsTrigger value="convenio">Convênio</TabsTrigger>
            <TabsTrigger value="exames">Exames</TabsTrigger>
          </TabsList>

          <TabsContent value="paciente" className="space-y-3 pt-3">
            <div><Label htmlFor="guia-paciente-nome">Nome completo *</Label><Input id="guia-paciente-nome" value={form.paciente_nome} onChange={(e) => setForm({ ...form, paciente_nome: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="guia-paciente-cpf">CPF</Label><Input id="guia-paciente-cpf" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={form.paciente_cpf} onChange={(e) => setForm({ ...form, paciente_cpf: formatCPF(e.target.value) })} /></div>
              <div><Label htmlFor="guia-paciente-nascimento">Data nascimento</Label><Input id="guia-paciente-nascimento" type="date" value={form.paciente_nascimento} onChange={(e) => setForm({ ...form, paciente_nascimento: e.target.value })} /></div>
            </div>
            <div><Label htmlFor="guia-paciente-telefone">Telefone</Label><Input id="guia-paciente-telefone" value={form.paciente_telefone} onChange={(e) => setForm({ ...form, paciente_telefone: e.target.value })} /></div>
          </TabsContent>

          <TabsContent value="medico" className="space-y-3 pt-3">
            <div><Label htmlFor="guia-medico-nome">Nome do médico solicitante</Label><Input id="guia-medico-nome" value={form.medico_externo_nome} onChange={(e) => setForm({ ...form, medico_externo_nome: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="col-span-2"><Label htmlFor="guia-medico-crm">CRM</Label><Input id="guia-medico-crm" value={form.medico_externo_crm} onChange={(e) => setForm({ ...form, medico_externo_crm: e.target.value })} /></div>
              <div><Label htmlFor="guia-medico-uf">UF</Label><Input id="guia-medico-uf" value={form.medico_externo_uf} onChange={(e) => setForm({ ...form, medico_externo_uf: e.target.value.toUpperCase() })} /></div>
            </div>
            <div><Label htmlFor="guia-medico-especialidade">Especialidade</Label><Input id="guia-medico-especialidade" value={form.medico_externo_especialidade} onChange={(e) => setForm({ ...form, medico_externo_especialidade: e.target.value })} /></div>
          </TabsContent>

          <TabsContent value="convenio" className="space-y-3 pt-3">
            <div><Label htmlFor="guia-convenio">Convênio</Label><Input id="guia-convenio" value={form.convenio_nome} onChange={(e) => setForm({ ...form, convenio_nome: e.target.value })} placeholder="Ex.: Unimed, Bradesco..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="guia-autorizacao">Nº autorização</Label><Input id="guia-autorizacao" value={form.numero_autorizacao} onChange={(e) => setForm({ ...form, numero_autorizacao: e.target.value })} /></div>
              <div><Label htmlFor="guia-validade">Validade</Label><Input id="guia-validade" type="date" value={form.validade_autorizacao} onChange={(e) => setForm({ ...form, validade_autorizacao: e.target.value })} /></div>
            </div>

            <div className="pt-2">
              <Label htmlFor="guia-anexo">Anexo da guia (PDF/imagem)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input id="guia-anexo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} disabled={uploading || saving} />
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
              {form.anexo_nome && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {form.anexo_nome}
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="exames" className="space-y-3 pt-3">
            <div>
              <Label htmlFor="guia-exames">Exames solicitados (um por linha) *</Label>
              <Textarea id="guia-exames" rows={7} value={form.exames_texto}
                onChange={(e) => setForm({ ...form, exames_texto: e.target.value })}
                placeholder={'Hemograma completo\nGlicemia de jejum\nColesterol total e frações'}
              />
            </div>
            <div>
              <Label htmlFor="guia-observacoes">Observações</Label>
              <Textarea id="guia-observacoes" rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </TabsContent>
        </Tabs>
        </fieldset>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => void handleClose()} disabled={saving || uploading}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Registrar guia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Detalhe + ações ─── */
function DetalheGuiaDialog({ guia, open, onClose, onChanged }: any) {
  const { profile } = useSupabaseAuth();
  const [agendando, setAgendando] = useState(false);
  const [dataAg, setDataAg] = useState('');
  const [horaAg, setHoraAg] = useState('');
  const [terceirizacao, setTerceirizacao] = useState({
    laboratorio_id: guia.laboratorio_id || '', status_terceirizacao: guia.status_terceirizacao || 'nao_enviado',
    prazo_laboratorio: guia.prazo_laboratorio || '', custo_laboratorio: guia.custo_laboratorio == null ? '' : String(guia.custo_laboratorio),
    data_envio_laboratorio: guia.data_envio_laboratorio || '', data_retorno_laboratorio: guia.data_retorno_laboratorio || '',
    laudo_externo_url: guia.laudo_externo_url || '', laudo_externo_nome: guia.laudo_externo_nome || '',
  });
  const [uploadingRetorno, setUploadingRetorno] = useState(false);
  const laudosTemporariosRef = useRef<Set<string>>(new Set());
  const dialogMontadoRef = useRef(false);
  const anexoPersistidoInicialRef = useRef<string | null>(guia.laudo_externo_url || null);

  useEffect(() => {
    dialogMontadoRef.current = true;
    return () => {
      dialogMontadoRef.current = false;
      const paths = pathsLaudoExternoAoFechar([...laudosTemporariosRef.current], anexoPersistidoInicialRef.current);
      laudosTemporariosRef.current.clear();
      if (paths.length) void supabase.storage.from('guias-externas').remove(paths).then(({ error }) => {
        if (error) toast.warning('Não foi possível remover todos os PDFs temporários do parceiro.', { description: mensagemDeErro(error) });
      });
    };
  }, []);

  const laboratoriosParceiros = useQuery({
    queryKey: ['lab-parceiros-guia', profile?.clinica_id], enabled: open && !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('laboratorios').select('id, nome')
        .eq('clinica_id', profile!.clinica_id).eq('ativo', true).order('nome');
      if (error) throw error; return data ?? [];
    },
  });
  const eventosTerceirizacao = useQuery({
    queryKey: ['lab-guia-eventos', guia.id, profile?.clinica_id], enabled: open && !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('guias_externas_eventos_lab')
        .select('id, tipo, detalhes, created_at').eq('clinica_id', profile!.clinica_id).eq('guia_id', guia.id).order('created_at', { ascending: false }).limit(30);
      if (error) throw error; return data ?? [];
    },
  });

  const salvarTerceirizacao = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const custo = terceirizacao.custo_laboratorio.trim() ? Number(terceirizacao.custo_laboratorio.replace(',', '.')) : null;
      if (custo != null && (!Number.isFinite(custo) || custo < 0)) throw new Error('Informe um custo válido, igual ou maior que zero.');
      if (terceirizacao.status_terceirizacao !== 'nao_enviado' && !terceirizacao.laboratorio_id) throw new Error('Selecione o laboratório parceiro antes de acompanhar o envio.');
      const { data, error } = await (supabase as any).from('guias_externas').update({
        laboratorio_id: terceirizacao.laboratorio_id || null, status_terceirizacao: terceirizacao.status_terceirizacao,
        prazo_laboratorio: terceirizacao.prazo_laboratorio || null, custo_laboratorio: custo,
        data_envio_laboratorio: terceirizacao.data_envio_laboratorio || null,
        data_retorno_laboratorio: terceirizacao.data_retorno_laboratorio || null,
        laudo_externo_url: terceirizacao.laudo_externo_url || null, laudo_externo_nome: terceirizacao.laudo_externo_nome || null,
      }).eq('id', guia.id).eq('clinica_id', profile.clinica_id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A guia não pertence à clínica atual ou mudou enquanto você editava.');
    },
    onSuccess: async () => {
      const anexoAnterior = pathLaudoAnteriorAposSalvar(guia.laudo_externo_url, terceirizacao.laudo_externo_url);
      const temporariosSubstituidos = pathsLaudoExternoAoFechar([...laudosTemporariosRef.current], terceirizacao.laudo_externo_url);
      laudosTemporariosRef.current.clear();
      if (temporariosSubstituidos.length) {
        const { error } = await supabase.storage.from('guias-externas').remove(temporariosSubstituidos);
        if (error) toast.warning('O acompanhamento foi salvo, mas um PDF temporário anterior não pôde ser removido.', { description: mensagemDeErro(error) });
      }
      if (anexoAnterior) {
        const { error } = await supabase.storage.from('guias-externas').remove([anexoAnterior]);
        if (error) toast.warning('O acompanhamento foi salvo, mas o PDF anterior não pôde ser removido.', { description: mensagemDeErro(error) });
      }
      onChanged(); void eventosTerceirizacao.refetch(); toast.success('Acompanhamento do laboratório externo salvo.');
    },
    onError: (error: any) => toast.error('Não foi possível salvar o acompanhamento.', { description: mensagemDeErro(error) }),
  });

  const enviarLaudoParceiro = async (file?: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf' || file.size > 15 * 1024 * 1024) { toast.error('Selecione um PDF de até 15 MB.'); return; }
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); return; }
    setUploadingRetorno(true);
    try {
      const path = `${profile.clinica_id}/retornos/${guia.id}-${Date.now()}.pdf`;
      const { error } = await supabase.storage.from('guias-externas').upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (error) throw error;
      if (!dialogMontadoRef.current) {
        const { error: erroRemocao } = await supabase.storage.from('guias-externas').remove([path]);
        if (erroRemocao) toast.warning('O diálogo fechou durante o envio e o PDF temporário não pôde ser removido.', { description: mensagemDeErro(erroRemocao) });
        return;
      }
      const uploadAnterior = terceirizacao.laudo_externo_url;
      laudosTemporariosRef.current.add(path);
      setTerceirizacao(current => ({ ...current, laudo_externo_url: path, laudo_externo_nome: file.name }));
      if (uploadAnterior && uploadAnterior !== guia.laudo_externo_url && laudosTemporariosRef.current.has(uploadAnterior)) {
        const { error: erroRemocao } = await supabase.storage.from('guias-externas').remove([uploadAnterior]);
        if (erroRemocao) toast.warning('O PDF novo foi enviado, mas não foi possível remover a versão temporária anterior.', { description: mensagemDeErro(erroRemocao) });
        else laudosTemporariosRef.current.delete(uploadAnterior);
      }
      toast.success('Laudo do parceiro anexado. Salve o acompanhamento para concluir.');
    } catch (error) { toast.error('Não foi possível anexar o laudo.', { description: mensagemDeErro(error) }); }
    finally { setUploadingRetorno(false); }
  };

  const abrirLaudoParceiro = async () => {
    if (!terceirizacao.laudo_externo_url) return;
    const { data, error } = await supabase.storage.from('guias-externas').createSignedUrl(terceirizacao.laudo_externo_url, 300);
    if (error || !data?.signedUrl || !abrirUrlSegura(data.signedUrl, storageUrlSeguro)) {
      toast.error('Não foi possível abrir o laudo do parceiro.', { description: error?.message }); return;
    }
  };

  const updateStatus = useMutation({
    mutationFn: async (patch: any) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const { data, error } = await (supabase as any).from('guias_externas').update(patch)
        .eq('id', guia.id).eq('clinica_id', profile.clinica_id).eq('status', guia.status).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A guia mudou de estado ou não pertence à clínica atual. Atualize a lista.');
    },
    onSuccess: () => { onChanged(); toast.success('Atualizado'); },
    onError: (e: any) => toast.error(e.message),
  });

  const enviarParaFila = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      if (!['recebida', 'em_analise', 'agendada'].includes(guia.status)) {
        throw new Error('Esta guia já foi encaminhada ou não aceita envio para a fila. Atualize a lista.');
      }
      const pacienteId = await obterOuCriarPacienteDaGuia(guia, profile?.clinica_id);
      const { error } = await (supabase as any).rpc('encaminhar_guia_externa_para_fila', {
        p_guia_id: guia.id,
        p_clinica_id: profile.clinica_id,
        p_paciente_id: pacienteId,
      });
      if (error) throw error;
    },
    onSuccess: () => { onChanged(); toast.success('Guia enviada para a fila de coleta'); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  const gerarAgendamento = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      if (!['recebida', 'em_analise'].includes(guia.status)) throw new Error('Esta guia já foi agendada ou encaminhada. Atualize a lista.');
      const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(dataAg)
        && !Number.isNaN(new Date(`${dataAg}T12:00:00`).getTime())
        && format(new Date(`${dataAg}T12:00:00`), 'yyyy-MM-dd') === dataAg;
      if (!dataValida || !/^([01]\d|2[0-3]):[0-5]\d$/.test(horaAg)) throw new Error('Informe uma data e hora válidas.');
      const pacienteId = await obterOuCriarPacienteDaGuia(guia, profile?.clinica_id);
      const { error } = await (supabase as any).rpc('agendar_guia_externa', {
        p_guia_id: guia.id,
        p_clinica_id: profile.clinica_id,
        p_paciente_id: pacienteId,
        p_data: dataAg,
        p_hora: horaAg,
      });
      if (error) throw error;
    },
    onSuccess: () => { onChanged(); toast.success('Coleta agendada'); setAgendando(false); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  const openAnexo = async () => {
    if (!guia.anexo_url) return;
    try {
      const { data, error } = await supabase.storage
        .from('guias-externas')
        .createSignedUrl(guia.anexo_url, 300);
      if (error) throw error;
      if (!data?.signedUrl || !abrirUrlSegura(data.signedUrl, storageUrlSeguro)) {
        throw new Error('O arquivo retornou um endereço não confiável');
      }
    } catch (e) {
      toast.error('Não foi possível abrir o anexo.', { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !uploadingRetorno) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Guia externa — {guia.paciente_nome}
          </DialogTitle>
          <DialogDescription>
            Recebida em {formatarDataHoraSaoPaulo(guia.data_recebimento, true)} · {ORIGEM_LABEL[guia.origem]}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="CPF" value={guia.paciente_cpf} />
            <Info label="Nascimento" value={guia.paciente_nascimento} />
            <Info label="Telefone" value={guia.paciente_telefone} />
            <Info label="Convênio" value={guia.convenio_nome} />
            <Info label="Médico solicitante" value={guia.medico_externo_nome} />
            <Info label="CRM" value={guia.medico_externo_crm ? `${guia.medico_externo_crm}/${guia.medico_externo_uf || ''}` : null} />
            <Info label="Nº autorização" value={guia.numero_autorizacao} />
            <Info label="Validade autorização" value={guia.validade_autorizacao} />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Exames solicitados</Label>
            <div className="mt-2 rounded-md border divide-y">
              {(guia.exames_solicitados as any[] || []).map((ex, i) => (
                <div key={i} className="px-3 py-2 text-sm flex items-center gap-2">
                  <FlaskConical className="h-3.5 w-3.5 text-primary" />
                  {ex.nome || ex.tipo || '—'}
                  {ex.descricao && <span className="text-xs text-muted-foreground">— {ex.descricao}</span>}
                </div>
              ))}
            </div>
          </div>

          {guia.observacoes && <Info label="Observações" value={guia.observacoes} />}

          <Card className="border-border/70">
            <CardHeader className="border-b bg-muted/20 py-3"><CardTitle className="text-sm">Acompanhamento do laboratório parceiro</CardTitle><CardDescription>Parceiro, prazo, custo e retorno ficam vinculados a esta guia da clínica.</CardDescription></CardHeader>
            <CardContent className="space-y-3 p-4">
              {laboratoriosParceiros.error && <ErrorState compact error={laboratoriosParceiros.error} onRetry={() => void laboratoriosParceiros.refetch()} />}
              {laboratoriosParceiros.isLoading && <p role="status" className="text-xs text-muted-foreground">Carregando laboratórios parceiros…</p>}
              {!laboratoriosParceiros.isLoading && !laboratoriosParceiros.error && laboratoriosParceiros.data?.length === 0 && <p className="text-xs text-muted-foreground">Nenhum laboratório parceiro ativo foi cadastrado.</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor={`guia-${guia.id}-laboratorio`}>Laboratório parceiro</Label><Select value={terceirizacao.laboratorio_id || '__none__'} onValueChange={(value) => setTerceirizacao(current => ({ ...current, laboratorio_id: value === '__none__' ? '' : value }))}><SelectTrigger id={`guia-${guia.id}-laboratorio`}><SelectValue placeholder="Selecione o parceiro" /></SelectTrigger><SelectContent><SelectItem value="__none__">Não definido</SelectItem>{(laboratoriosParceiros.data ?? []).map((laboratorio: any) => <SelectItem key={laboratorio.id} value={laboratorio.id}>{laboratorio.nome}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label htmlFor={`guia-${guia.id}-status-parceiro`}>Status do processamento externo</Label><Select value={terceirizacao.status_terceirizacao} onValueChange={(value) => setTerceirizacao(current => ({ ...current, status_terceirizacao: value, data_envio_laboratorio: value === 'enviado' && !current.data_envio_laboratorio ? new Date().toISOString() : current.data_envio_laboratorio, data_retorno_laboratorio: value === 'concluido' && !current.data_retorno_laboratorio ? new Date().toISOString() : current.data_retorno_laboratorio }))}><SelectTrigger id={`guia-${guia.id}-status-parceiro`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nao_enviado">Não enviado</SelectItem><SelectItem value="enviado">Enviado</SelectItem><SelectItem value="em_processamento">Em processamento</SelectItem><SelectItem value="concluido">Concluído</SelectItem><SelectItem value="atrasado">Atrasado</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label htmlFor={`guia-${guia.id}-prazo-parceiro`}>Prazo previsto</Label><Input id={`guia-${guia.id}-prazo-parceiro`} type="date" value={terceirizacao.prazo_laboratorio} onChange={(event) => setTerceirizacao(current => ({ ...current, prazo_laboratorio: event.target.value }))} /></div>
                <div className="space-y-1"><Label htmlFor={`guia-${guia.id}-custo-parceiro`}>Custo do parceiro (R$)</Label><Input id={`guia-${guia.id}-custo-parceiro`} inputMode="decimal" value={terceirizacao.custo_laboratorio} onChange={(event) => setTerceirizacao(current => ({ ...current, custo_laboratorio: event.target.value }))} placeholder="0,00" /></div>
                <div className="space-y-1"><Label htmlFor={`guia-${guia.id}-enviado-parceiro`}>Enviado em</Label><Input id={`guia-${guia.id}-enviado-parceiro`} type="datetime-local" value={paraDataHoraLocal(terceirizacao.data_envio_laboratorio)} onChange={(event) => setTerceirizacao(current => ({ ...current, data_envio_laboratorio: event.target.value ? new Date(event.target.value).toISOString() : '' }))} /></div>
                <div className="space-y-1"><Label htmlFor={`guia-${guia.id}-retorno-parceiro`}>Retornado em</Label><Input id={`guia-${guia.id}-retorno-parceiro`} type="datetime-local" value={paraDataHoraLocal(terceirizacao.data_retorno_laboratorio)} onChange={(event) => setTerceirizacao(current => ({ ...current, data_retorno_laboratorio: event.target.value ? new Date(event.target.value).toISOString() : '' }))} /></div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Button variant="outline" size="sm" asChild={false} onClick={() => document.getElementById(`laudo-parceiro-${guia.id}`)?.click()} disabled={uploadingRetorno}>{uploadingRetorno ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}{terceirizacao.laudo_externo_nome || 'Anexar laudo PDF'}</Button>
                <input id={`laudo-parceiro-${guia.id}`} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => { void enviarLaudoParceiro(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                {terceirizacao.laudo_externo_url && <Button variant="ghost" size="sm" onClick={() => void abrirLaudoParceiro()}><ExternalLink className="mr-1 h-4 w-4" />Abrir PDF privado</Button>}
                <Button size="sm" className="ml-auto" onClick={() => salvarTerceirizacao.mutate()} disabled={salvarTerceirizacao.isPending || uploadingRetorno}>{salvarTerceirizacao.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Salvar acompanhamento</Button>
              </div>
              <div className="border-t pt-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Histórico de acompanhamento</p>{eventosTerceirizacao.isLoading ? <p role="status" className="text-xs text-muted-foreground">Carregando histórico…</p> : eventosTerceirizacao.error ? <ErrorState compact error={eventosTerceirizacao.error} onRetry={() => void eventosTerceirizacao.refetch()} /> : (eventosTerceirizacao.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">As atualizações feitas após a migration aparecerão aqui.</p> : <ul className="space-y-1.5">{eventosTerceirizacao.data?.map((evento: any) => <li key={evento.id} className="flex justify-between gap-3 text-xs"><span>{evento.tipo === 'parceiro_registrado' ? 'Acompanhamento iniciado' : 'Acompanhamento atualizado'}</span><time className="text-muted-foreground">{formatarDataHoraSaoPaulo(evento.created_at, true)}</time></li>)}</ul>}</div>
            </CardContent>
          </Card>

          {guia.anexo_url && (
            <Button variant="outline" size="sm" onClick={openAnexo} className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Abrir anexo: {guia.anexo_nome}
            </Button>
          )}

          {agendando && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-medium">Agendar coleta</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label htmlFor={`guia-${guia.id}-data-agendamento`}>Data</Label><Input id={`guia-${guia.id}-data-agendamento`} type="date" value={dataAg} onChange={(e) => setDataAg(e.target.value)} /></div>
                  <div><Label htmlFor={`guia-${guia.id}-hora-agendamento`}>Hora</Label><Input id={`guia-${guia.id}-hora-agendamento`} type="time" value={horaAg} onChange={(e) => setHoraAg(e.target.value)} /></div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setAgendando(false)} disabled={gerarAgendamento.isPending || uploadingRetorno}>Cancelar</Button>
                  <Button size="sm" onClick={() => gerarAgendamento.mutate()} disabled={gerarAgendamento.isPending || enviarParaFila.isPending || updateStatus.isPending || uploadingRetorno}>
                    {gerarAgendamento.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    Confirmar agendamento
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="mt-4 flex-wrap gap-2">
          {guia.status !== 'cancelada' && guia.status !== 'finalizada' && guia.status !== 'encaminhada_fila' && (
            <>
              <Button variant="outline" onClick={() => updateStatus.mutate({ status: 'cancelada' })} disabled={updateStatus.isPending || enviarParaFila.isPending || gerarAgendamento.isPending || uploadingRetorno}>
                <X className="h-4 w-4 mr-1" /> Cancelar guia
              </Button>
              {!agendando && ['recebida', 'em_analise'].includes(guia.status) && (
                <Button variant="outline" onClick={() => setAgendando(true)} disabled={updateStatus.isPending || enviarParaFila.isPending || gerarAgendamento.isPending || uploadingRetorno} className="gap-1.5">
                  <CalendarPlus className="h-4 w-4" /> Agendar coleta
                </Button>
              )}
              <Button onClick={() => enviarParaFila.mutate()} disabled={enviarParaFila.isPending || gerarAgendamento.isPending || updateStatus.isPending || uploadingRetorno} className="gap-1.5">
                {enviarParaFila.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Enviar para fila de coleta
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '—'}</p>
    </div>
  );
}

/* ─── Tokens do portal ─── */
function TokensPortalDialog({ open, onClose, clinicaId, userId }: any) {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [descricao, setDescricao] = useState('');

  const { data: tokens = [], isLoading, error: tokensError, refetch: refetchTokens } = useQuery({
    queryKey: ['portal_guias_tokens', clinicaId],
    enabled: !!clinicaId && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('portal_guias_tokens')
        .select('*')
        .eq('clinica_id', clinicaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const criarToken = useMutation({
    mutationFn: async () => {
      if (!clinicaId || !userId) throw new Error('Clínica ou usuário não identificado. Atualize a sessão e tente novamente.');
      const { error } = await (supabase as any).from('portal_guias_tokens').insert({
        clinica_id: clinicaId, descricao: descricao.trim() || null, criado_por: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => { setDescricao(''); queryClient.invalidateQueries({ queryKey: ['portal_guias_tokens'] }); toast.success('Link gerado'); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleAtivo = useMutation({
    mutationFn: async ({ id, ativo }: any) => {
      if (!clinicaId) throw new Error('Clínica não identificada.');
      const { data, error } = await (supabase as any).from('portal_guias_tokens').update({ ativo })
        .eq('id', id).eq('clinica_id', clinicaId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Este link não pertence à clínica atual ou já foi removido.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portal_guias_tokens'] }),
    onError: (error: any) => toast.error('Não foi possível atualizar o link', { description: error.message }),
  });

  const deletarToken = useMutation({
    mutationFn: async (id: string) => {
      if (!clinicaId) throw new Error('Clínica não identificada.');
      const { data, error } = await (supabase as any).from('portal_guias_tokens').delete()
        .eq('id', id).eq('clinica_id', clinicaId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Este link não pertence à clínica atual ou já foi removido.');
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['portal_guias_tokens'] }); toast.success('Removido'); },
    onError: (error: any) => toast.error('Não foi possível remover o link', { description: error.message }),
  });

  const copiarLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar automaticamente. Selecione e copie o endereço manualmente.');
    }
  };

  const baseUrl = window.location.origin;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" /> Portal externo de guias</DialogTitle>
          <DialogDescription>
            Gere links únicos para que médicos e clínicas externas enviem guias sem precisar fazer login.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label htmlFor="portal-guias-descricao">Descrição (opcional)</Label>
            <Input id="portal-guias-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Dr. José — Clínica Vida" />
          </div>
          <Button onClick={() => criarToken.mutate()} disabled={criarToken.isPending} className="gap-1.5">
            <Plus className="h-4 w-4" /> Gerar link
          </Button>
        </div>

        <div className="space-y-2 mt-3 max-h-[400px] overflow-y-auto">
          {isLoading ? <Skeleton className="h-20 w-full" /> :
            tokensError ? <ErrorState compact error={tokensError} onRetry={() => void refetchTokens()} /> :
            tokens.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Nenhum link gerado.</p> :
            tokens.map((t: any) => {
              const url = `${baseUrl}/portal-guias/${t.token}`;
              return (
                <Card key={t.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{t.descricao || 'Link genérico'}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.ultimo_uso ? `Último uso: ${formatarDataHoraSaoPaulo(t.ultimo_uso)}` : 'Nunca usado'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch aria-label={`${t.ativo ? 'Desativar' : 'Ativar'} link ${t.descricao || 'genérico'}`} checked={t.ativo} disabled={toggleAtivo.isPending || deletarToken.isPending} onCheckedChange={(v) => toggleAtivo.mutate({ id: t.id, ativo: v })} />
                        {profile?.roles?.includes('admin') && (
                          <Button aria-label={`Excluir link ${t.descricao || 'genérico'}`} size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={toggleAtivo.isPending || deletarToken.isPending} onClick={() => deletarToken.mutate(t.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input aria-label={`Link do portal externo: ${t.descricao || 'genérico'}`} value={url} readOnly className="text-xs font-mono" />
                      <Button aria-label="Copiar link da guia" size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => void copiarLink(url)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          }
        </div>
      </DialogContent>
    </Dialog>
  );
}
