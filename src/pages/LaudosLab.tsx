import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FileText, Eye, CheckCircle2, AlertCircle, Loader2, RefreshCw, Search, AlertTriangle, Clock, MessageCircle, X, FlaskConical, TestTube, FileSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

import { supabase } from '@/integrations/supabase/client';

import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

import { canalUnico } from '@/lib/realtimeCanal';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { pacienteCorresponde } from '@/lib/buscaPaciente';

import { parseResultadoNumerico } from '@/lib/laudoWorkflow';
import { cursorAposAtualizacaoWorklist, type CursorLaudo } from '@/lib/laudoWorklist';
import { LaboratorioSubnav } from '@/components/laboratorio/LaboratorioSubnav';
import { criticalAcknowledgementIsPending } from '@/lib/criticalResultAcknowledgement';
import { linkWhatsApp } from '@/lib/whatsapp';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';

/**
 * Teto da worklist do laboratório.
 *
 * O PostgREST corta em 1.000 linhas por padrão e não avisa. Pedimos um a mais
 * que este teto para detectar o corte e dizer ao operador que existe mais
 * histórico, em vez de deixá-lo achar que a amostra sumiu.
 */
const TETO_WORKLIST = 500;

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// ─── Main Page ─────────────────────────────────────────────
export default function LaudosLab() {
  const { profile } = useSupabaseAuth();
  const [coletas, setColetas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState(location.state?.laudoFilters?.search ?? '');
  const [statusFilter, setStatusFilter] = useState(location.state?.laudoFilters?.statusFilter ?? 'todos');
  const [searchParams] = useSearchParams();
  const openReport = (id: string) => navigate(`/laudos-lab/${id}`, { state: { laudoFilters: { search, statusFilter } } });
  // Preserve existing notification links while opening the dedicated workspace.
  useEffect(() => {
    const id = searchParams.get('coleta');
    if (id) navigate(`/laudos-lab/${encodeURIComponent(id)}`, { replace: true, state: { laudoFilters: { search, statusFilter } } });
  }, [searchParams, navigate, search, statusFilter]);
  const [cursorLaudos, setCursorLaudos] = useState<CursorLaudo>(null);
  const [hasOlderLaudos, setHasOlderLaudos] = useState(false);
  const [loadingOlderLaudos, setLoadingOlderLaudos] = useState(false);
  const [olderLaudosError, setOlderLaudosError] = useState<unknown>(null);
  const fetchRequestRef = useRef(0);
  const activeClinicRef = useRef<string | null>(null);
  const cursorLaudosRef = useRef<CursorLaudo>(null);
  const historicoCarregadoRef = useRef(false);
  const atualizarCursorLaudos = useCallback((cursor: CursorLaudo) => {
    cursorLaudosRef.current = cursor;
    setCursorLaudos(cursor);
  }, []);

  const fetchLaudos = useCallback(async () => {
    const clinicId = profile?.clinica_id ?? null;
    if (activeClinicRef.current !== clinicId) return;
    const requestId = ++fetchRequestRef.current;

    if (!clinicId) {
      setColetas([]);
      atualizarCursorLaudos(null);
      setHasOlderLaudos(false);
      setLoadError(new Error('Clínica não identificada.'));
      setLoading(false);
      return;
    }
    // Atualizações manuais, realtime e pós-liberação são em segundo plano.
    // Preserve o contexto da listagem durante atualizações em segundo plano.
    setLoadingOlderLaudos(false);
    setOlderLaudosError(null);
    try {
      const { data, error } = await supabase
        .from('coletas_laboratorio')
        .select(`
          id, codigo_amostra, status, created_at, data_coleta, urgente, tipo_amostra, tubo,
          pacientes(nome, nome_social, cpf, telefone, email),
          medicos(nome, crm),
          resultados_laboratorio(id, liberado, parametro, resultado, unidade, critico, numero_versao,
            valor_referencia_min, valor_referencia_max, exames(tipo_exame),
            confirmacoes:resultado_critico_confirmacoes(id, numero_versao))
        `)
        .eq('clinica_id', clinicId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(TETO_WORKLIST + 1);

      if (requestId !== fetchRequestRef.current || activeClinicRef.current !== clinicId) return;
      if (error) throw error;

      const linhas = data ?? [];
      const janela = linhas.slice(0, TETO_WORKLIST);
      const cursorMaisRecente = janela.length ? {
        created_at: janela[janela.length - 1].created_at,
        id: janela[janela.length - 1].id,
      } : null;
      atualizarCursorLaudos(cursorAposAtualizacaoWorklist(cursorLaudosRef.current, cursorMaisRecente, historicoCarregadoRef.current));
      if (!historicoCarregadoRef.current) setHasOlderLaudos(linhas.length > TETO_WORKLIST);

      const comResultados = janela
        .filter((c: any) => (c.resultados_laboratorio ?? []).length > 0)
        .sort((a: any, b: any) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      setColetas(atuais => {
        const porId = new Map<string, any>();
        for (const coleta of atuais) porId.set(coleta.id, coleta);
        for (const coleta of comResultados) porId.set(coleta.id, coleta);
        return [...porId.values()].sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });
      setLoadError(null);
    } catch (error) {
      if (requestId === fetchRequestRef.current && activeClinicRef.current === clinicId) setLoadError(error);
    } finally {
      if (requestId === fetchRequestRef.current && activeClinicRef.current === clinicId) setLoading(false);
    }
  }, [profile?.clinica_id, atualizarCursorLaudos]);

  const carregarLaudosAntigos = async () => {
    const clinicId = profile?.clinica_id;
    const cursor = cursorLaudos;
    if (!clinicId || !cursor || !hasOlderLaudos || loadingOlderLaudos) return;
    const requestId = fetchRequestRef.current;
    setLoadingOlderLaudos(true);
    setOlderLaudosError(null);
    try {
      const { data, error } = await supabase
        .from('coletas_laboratorio')
        .select(`
          id, codigo_amostra, status, created_at, data_coleta, urgente, tipo_amostra, tubo,
          pacientes(nome, nome_social, cpf, telefone, email),
          medicos(nome, crm),
          resultados_laboratorio(id, liberado, parametro, resultado, unidade, critico, numero_versao,
            valor_referencia_min, valor_referencia_max, exames(tipo_exame),
            confirmacoes:resultado_critico_confirmacoes(id, numero_versao))
        `)
        .eq('clinica_id', clinicId)
        .or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(TETO_WORKLIST + 1);
      if (error) throw error;
      if (requestId !== fetchRequestRef.current || activeClinicRef.current !== clinicId) return;

      const linhas = data ?? [];
      const janela = linhas.slice(0, TETO_WORKLIST);
      atualizarCursorLaudos(janela.length ? {
        created_at: janela[janela.length - 1].created_at,
        id: janela[janela.length - 1].id,
      } : cursor);
      historicoCarregadoRef.current = true;
      setHasOlderLaudos(linhas.length > TETO_WORKLIST);
      const comResultados = janela
        .filter((c: any) => (c.resultados_laboratorio ?? []).length > 0)
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setColetas(atuais => {
        const porId = new Map<string, any>(atuais.map(coleta => [coleta.id, coleta]));
        for (const coleta of comResultados) porId.set(coleta.id, coleta);
        return [...porId.values()].sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });
    } catch (error) {
      if (requestId === fetchRequestRef.current && activeClinicRef.current === clinicId) setOlderLaudosError(error);
    } finally {
      if (requestId === fetchRequestRef.current && activeClinicRef.current === clinicId) setLoadingOlderLaudos(false);
    }
  };

  useEffect(() => {
    const clinicId = profile?.clinica_id ?? null;
    activeClinicRef.current = clinicId;
    fetchRequestRef.current += 1;
    setColetas([]);
    atualizarCursorLaudos(null);
    historicoCarregadoRef.current = false;
    setHasOlderLaudos(false);
    setLoadingOlderLaudos(false);
    setOlderLaudosError(null);
    setLoading(true);
    setLoadError(null);
    void fetchLaudos();
    if (!clinicId) return () => { activeClinicRef.current = null; fetchRequestRef.current += 1; };
    const channel = supabase.channel(canalUnico('laudos-rt'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resultados_laboratorio', filter: `clinica_id=eq.${clinicId}` }, fetchLaudos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coletas_laboratorio', filter: `clinica_id=eq.${clinicId}` }, fetchLaudos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resultado_critico_confirmacoes', filter: `clinica_id=eq.${clinicId}` }, fetchLaudos)
      .subscribe();
    return () => {
      if (activeClinicRef.current === clinicId) activeClinicRef.current = null;
      fetchRequestRef.current += 1;
      supabase.removeChannel(channel);
    };
  }, [fetchLaudos, profile?.clinica_id, atualizarCursorLaudos]);

  const getExamesLiberados = (c: any) =>
    (c.resultados_laboratorio ?? []).filter((r: any) => r.liberado === true);
  const getExamesPendentes = (c: any) =>
    (c.resultados_laboratorio ?? []).filter((r: any) => r.liberado !== true);
  const hasAlterado = (c: any) =>
    (c.resultados_laboratorio ?? []).some((r: any) => {
      const num = parseResultadoNumerico(r.resultado);
      if (num === null) return false;
      return (r.valor_referencia_min != null && num < r.valor_referencia_min) ||
             (r.valor_referencia_max != null && num > r.valor_referencia_max);
    });
  const hasCritico = (c: any) => (c.resultados_laboratorio ?? []).some((r: any) => r.critico === true);
  const hasCriticoPendente = (c: any) => (c.resultados_laboratorio ?? []).some(criticalAcknowledgementIsPending);

  const filtradas = useMemo(() => {
    return coletas.filter(c => {
      if (search.trim()) {
        const q = normalize(search.trim());
        const nomes = (c.resultados_laboratorio ?? []).map((r: any) => normalize(r.parametro ?? ''));
        if (
          !(c.pacientes && pacienteCorresponde(c.pacientes, search)) &&
          !normalize(c.codigo_amostra ?? '').includes(q) &&
          !nomes.some((n: string) => n.includes(q))
        ) return false;
      }
      if (statusFilter === 'liberado') {
        return getExamesLiberados(c).length > 0 && getExamesPendentes(c).length === 0;
      }
      if (statusFilter === 'parcial') {
        return getExamesLiberados(c).length > 0 && getExamesPendentes(c).length > 0;
      }
      if (statusFilter === 'pendente') {
        return getExamesPendentes(c).length > 0 && getExamesLiberados(c).length === 0;
      }
      if (statusFilter === 'alterado') return hasAlterado(c);
      if (statusFilter === 'critico') return hasCritico(c);
      return true;
    });
  }, [coletas, search, statusFilter]);

  const limparFiltros = () => {
    setSearch('');
    setStatusFilter('todos');
  };

  const temFiltro = search.trim() !== '' || statusFilter !== 'todos';

  const totalLiberados = coletas.filter(c => getExamesLiberados(c).length > 0 && getExamesPendentes(c).length === 0).length;
  const totalParciais = coletas.filter(c => getExamesLiberados(c).length > 0 && getExamesPendentes(c).length > 0).length;
  const totalPendentes = coletas.filter(c => getExamesPendentes(c).length > 0 && getExamesLiberados(c).length === 0).length;
  const totalAlterados = coletas.filter(c => hasAlterado(c)).length;
  const totalCriticos = coletas.filter(c => hasCritico(c)).length;

  // Hero: oldest coleta with pending results
  const proximoALaudar = coletas.find(c => getExamesPendentes(c).length > 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (loadError) {
    return <ErrorState title="Não foi possível carregar os laudos" error={loadError} onRetry={() => { setLoading(true); void fetchLaudos(); }} />;
  }

  return (
    <div className="space-y-6 pb-8">
      {/* ─── PageHeader ─── */}
      <PageHeader
        title="Laudos Laboratoriais"
        description={
          coletas.length > 0
            ? `${coletas.length} laudo${coletas.length === 1 ? '' : 's'} · ${totalPendentes} pendente${totalPendentes === 1 ? '' : 's'}${totalCriticos > 0 ? ` · ${totalCriticos} crítico${totalCriticos === 1 ? '' : 's'}` : ''}`
            : 'Validação e liberação de resultados'
        }
        icon={<FileText />}
        actions={
          <>
            <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
              <Link to="/laboratorio"><FlaskConical aria-hidden="true" className="h-4 w-4" /> Laboratório</Link>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={() => void fetchLaudos()}
              aria-label="Atualizar laudos"
              title="Atualizar laudos"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button asChild className="shrink-0 gap-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
              <Link to="/exames"><TestTube aria-hidden="true" className="h-4 w-4" /> Exames</Link>
            </Button>
          </>
        }
      />

      <LaboratorioSubnav />

      {/* ─── Indicator Strip ─── */}
      <section role="group" aria-label="Indicadores de laudos" className="space-y-2">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          {([
            {
              key: 'pendente',
              label: 'Pendentes',
              value: totalPendentes,
              icon: Clock,
              escuro: false,
              color: 'text-primary',
              surface: 'bg-primary/10',
              caption: 'aguardando laudo',
            },
            {
              key: 'critico',
              label: 'Críticos',
              value: totalCriticos,
              icon: AlertCircle,
              escuro: false,
              color: 'text-destructive',
              surface: 'bg-destructive/10',
              caption: 'atenção imediata',
            },
            {
              key: 'parcial',
              label: 'Parciais',
              value: totalParciais,
              icon: AlertTriangle,
              escuro: false,
              color: 'text-warning-foreground',
              surface: 'bg-warning/10',
              caption: 'liberação parcial',
            },
            {
              key: 'liberado',
              label: 'Liberados',
              value: totalLiberados,
              icon: CheckCircle2,
              escuro: false,
              color: 'text-success',
              surface: 'bg-success/10',
              caption: 'concluídos',
            },
            {
              key: 'todos',
              label: 'Total',
              value: coletas.length,
              icon: FileText,
              escuro: false,
              color: 'text-primary',
              surface: 'bg-primary/10',
              caption: 'na worklist',
            },
          ] as const).map(s => {
            const Icon = s.icon;
            const ativo = statusFilter === s.key;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={ativo}
                onClick={() => setStatusFilter(ativo && s.key !== 'todos' ? 'todos' : s.key)}
                className={cn(
                  'group rounded-2xl border border-border/60 bg-card text-left transition-colors duration-200 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  s.escuro && ativo && 'border-primary bg-primary text-primary-foreground',
                  ativo && !s.escuro && 'border-primary/50 ring-1 ring-primary/30',
                  ativo && s.escuro && 'ring-2 ring-primary/30',
                )}
              >
                <div className="flex min-h-[96px] items-center gap-3 p-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.escuro && ativo ? 'bg-primary-foreground/15' : s.surface)}>
                    <Icon aria-hidden="true" className={cn('h-5 w-5', s.escuro && ativo ? 'text-primary-foreground' : s.color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className={cn('truncate text-xs font-semibold', s.escuro && ativo ? 'text-primary-foreground' : 'text-foreground')}>{s.label}</h3>
                      <span className={cn('text-2xl font-bold tabular-nums', s.escuro && ativo ? 'text-primary-foreground' : s.color)}>{s.value}</span>
                    </div>
                    <p className={cn('truncate text-[11px]', s.escuro && ativo ? 'text-primary-foreground' : 'text-muted-foreground')}>{s.caption}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── Próximo a Laudar ─── */}
      {proximoALaudar && (
        <div
          className="rounded-2xl border border-primary/30 bg-card p-4"
          aria-label="Próxima coleta a laudar"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <FileSearch className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-primary font-semibold">Próximo a laudar</p>
                <p className="text-lg font-bold truncate">
                  {proximoALaudar.pacientes?.nome_social?.trim() || proximoALaudar.pacientes?.nome || '—'}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                  <span>{proximoALaudar.codigo_amostra}</span>
                  {proximoALaudar.urgente && (
                    <Badge variant="destructive" className="text-[10px] rounded-full">Urgente</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {getExamesPendentes(proximoALaudar).length} resultado{getExamesPendentes(proximoALaudar).length === 1 ? '' : 's'} pendente{getExamesPendentes(proximoALaudar).length === 1 ? '' : 's'} ·{' '}
                  {proximoALaudar.created_at
                    ? formatDistanceToNow(new Date(proximoALaudar.created_at), { locale: ptBR, addSuffix: true })
                    : '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {proximoALaudar.pacientes?.telefone && (() => {
                const waLink = linkWhatsApp(proximoALaudar.pacientes.telefone, `Olá, ${proximoALaudar.pacientes.nome_social?.trim() || proximoALaudar.pacientes.nome || 'paciente'}! Seu resultado de laboratório está em processamento. Em breve entraremos em contato.`);
                return waLink ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 rounded-full border-border text-primary hover:bg-primary/10 hover:text-primary"
                  >
                    <a href={waLink} target="_blank" rel="noopener noreferrer" aria-label="Contatar paciente via WhatsApp">
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  </Button>
                ) : null;
              })()}
              <Button
                size="sm"
                className="h-9 gap-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => openReport(proximoALaudar.id)}
              >
                <Eye className="h-3.5 w-3.5" /> Abrir Laudo
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Filters ─── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar laudos por paciente, CPF, telefone, código ou exame"
            className="h-10 rounded-full pl-9 focus-visible:ring-ring"
            placeholder="Nome, CPF, código ou exame..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Pill filters */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtros rápidos">
          {([
            { key: 'todos', label: 'Todos' },
            { key: 'pendente', label: 'Pendentes' },
            { key: 'parcial', label: 'Parciais' },
            { key: 'liberado', label: 'Liberados' },
            { key: 'alterado', label: 'Alterados' },
            { key: 'critico', label: 'Críticos' },
          ] as const).map(f => (
            <button
              key={f.key}
              type="button"
              aria-pressed={statusFilter === f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                'h-8 rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                statusFilter === f.key
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {temFiltro && (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-full text-muted-foreground" onClick={limparFiltros}>
            <X aria-hidden="true" className="h-3.5 w-3.5" /> Limpar filtros
          </Button>
        )}
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {filtradas.length} de {coletas.length} laudo{coletas.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* ─── Table ─── */}
      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardContent className="p-0">
          {filtradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <FileText className="h-7 w-7" />
              </span>
              <p className="font-medium text-foreground">
                {coletas.length > 0
                  ? 'Nenhum laudo corresponde à busca e ao status selecionados'
                  : hasOlderLaudos
                    ? 'Nenhum laudo encontrado entre os registros carregados'
                    : 'Ainda não há laudos registrados'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {coletas.length > 0 && temFiltro
                  ? 'Limpe os filtros para ver todos os laudos.'
                  : coletas.length === 0 && hasOlderLaudos
                    ? 'Carregue laudos anteriores para ampliar a busca.'
                    : 'Processe amostras no Laboratório para que os laudos apareçam aqui.'}
              </p>
              {coletas.length > 0 && temFiltro && (
                <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={limparFiltros}>
                  Limpar filtros
                </Button>
              )}
              {coletas.length === 0 && !hasOlderLaudos && (
                <Button asChild size="sm" className="mt-4 gap-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
                  <Link to="/laboratorio"><FlaskConical className="h-4 w-4" /> Ir para Laboratório</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">#</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Código</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Paciente</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Exames</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Progresso</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Entrada</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((c, idx) => {
                    const liberados = getExamesLiberados(c);
                    const pendentes = getExamesPendentes(c);
                    const total = c.resultados_laboratorio?.length || 0;
                    const todoLiberado = liberados.length > 0 && pendentes.length === 0;
                    const parcial = liberados.length > 0 && pendentes.length > 0;
                    const alterado = hasAlterado(c);
                    const critico = hasCritico(c);
                    const waLink = linkWhatsApp(
                      c.pacientes?.telefone,
                      `Olá, ${c.pacientes?.nome_social?.trim() || c.pacientes?.nome || 'paciente'}! Seu laudo laboratorial (${c.codigo_amostra}) está disponível. Entre em contato para mais informações.`,
                    );
                    return (
                      <tr
                        key={c.id}
                        className={cn(
                          'border-b border-border/50 last:border-0 transition-colors hover:bg-muted/20',
                          todoLiberado && 'opacity-60 hover:opacity-100',
                          c.urgente && 'bg-destructive/5',
                        )}
                      >
                        <td className="px-4 py-2.5">
                          <span className={cn(
                            'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                            idx === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                          )}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-primary font-semibold">{c.codigo_amostra ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {c.urgente && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                            <div>
                              <p className="font-medium">{c.pacientes?.nome_social?.trim() || c.pacientes?.nome || '—'}</p>
                              <p className="text-[11px] text-muted-foreground">{c.pacientes?.cpf ?? ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(c.resultados_laboratorio ?? []).slice(0, 2).map((r: any) => (
                              <Badge key={r.id} variant="secondary" className="text-[10px] rounded-full">{r.parametro ?? '—'}</Badge>
                            ))}
                            {total > 2 && <span className="text-[10px] text-muted-foreground">+{total - 2}</span>}
                            {alterado && <Badge variant="destructive" className="text-[10px] gap-0.5 rounded-full"><AlertTriangle className="h-2.5 w-2.5" />Alt.</Badge>}
                            {critico && <Badge variant="destructive" className="text-[10px] gap-0.5 rounded-full"><AlertCircle className="h-2.5 w-2.5" />Crítico</Badge>}
                            {hasCriticoPendente(c) && <Badge variant="destructive" className="text-[10px] rounded-full">Ciência pendente</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center gap-1.5 justify-center">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-[width]"
                                style={{ width: `${total > 0 ? (liberados.length / total) * 100 : 0}%` }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums">{liberados.length}/{total}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {todoLiberado ? (
                            <Badge className="bg-success/10 text-success border-success/20 text-[10px] rounded-full">Liberado</Badge>
                          ) : parcial ? (
                            <Badge className="bg-warning/10 text-warning-foreground border-warning/20 text-[10px] rounded-full">Parcial</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] rounded-full">Pendente</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">
                          {c.created_at ? formatDistanceToNow(new Date(c.created_at), { locale: ptBR, addSuffix: true }) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {waLink && (
                              <Button
                                asChild
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 rounded-full p-0 text-primary hover:bg-primary/10"
                                aria-label={`Contatar ${c.pacientes?.nome || 'paciente'} via WhatsApp`}
                              >
                                <a href={waLink} target="_blank" rel="noopener noreferrer">
                                  <MessageCircle className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 rounded-full text-xs gap-1"
                              onClick={() => openReport(c.id)}
                            >
                              <Eye className="h-3 w-3" /> Ver Laudo
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Load more ─── */}
      {olderLaudosError && (
        <ErrorState
          compact
          title="Não foi possível carregar laudos anteriores"
          error={olderLaudosError}
          onRetry={() => void carregarLaudosAntigos()}
          retryLabel="Tentar novamente"
        />
      )}
      {hasOlderLaudos && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">{coletas.length} laudo(s) carregado(s)</p>
          <Button
            variant="outline"
            className="gap-2 rounded-full"
            onClick={() => void carregarLaudosAntigos()}
            disabled={loadingOlderLaudos}
          >
            {loadingOlderLaudos && <Loader2 className="h-4 w-4 animate-spin" />}
            {loadingOlderLaudos ? 'Carregando...' : 'Carregar laudos anteriores'}
          </Button>
        </div>
      )}

      {/* ─── Cross-links ─── */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
        <p className="w-full text-xs text-muted-foreground mb-1">Fluxo do laboratório:</p>
        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
          <Link to="/laboratorio"><FlaskConical className="h-3.5 w-3.5" /> Worklist</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
          <Link to="/exames"><TestTube className="h-3.5 w-3.5" /> Exames</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
          <Link to="/guias-externas"><FileSearch className="h-3.5 w-3.5" /> Guias Externas</Link>
        </Button>
      </div>

    </div>
  );
}
