import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  CheckCircle2, RefreshCw, Loader2, RotateCcw, XCircle, Search, Printer, FlaskConical,
  AlertTriangle, Clock, Zap, MapPin, User, Droplets, Timer, Activity,
  ArrowRight, Eye, Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { escapeHtml } from '@/lib/html';
import { canalUnico } from '@/lib/realtimeCanal';
import { ErrorState } from '@/components/ErrorState';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ageFromDateOnly } from '@/lib/dateOnly';
import { pacienteCorresponde } from '@/lib/buscaPaciente';

const TUBOS = [
  { color: 'bg-purple-500', label: 'EDTA (Roxo)', nome: 'Roxo', volume: '4mL' },
  { color: 'bg-yellow-400', label: 'Soro (Amarelo)', nome: 'Amarelo', volume: '5mL' },
  { color: 'bg-red-500', label: 'Seco (Vermelho)', nome: 'Vermelho', volume: '5mL' },
  { color: 'bg-blue-400', label: 'Citrato (Azul)', nome: 'Azul', volume: '3.6mL' },
  { color: 'bg-gray-400', label: 'Fluoreto (Cinza)', nome: 'Cinza', volume: '4mL' },
  { color: 'bg-green-500', label: 'Heparina (Verde)', nome: 'Verde', volume: '4mL' },
  { color: 'bg-orange-400', label: 'Swab (Laranja)', nome: 'Laranja', volume: '—' },
  { color: 'bg-amber-300', label: 'Coletor Urina', nome: 'Âmbar', volume: '—' },
  { color: 'bg-amber-700', label: 'Coletor Fezes', nome: 'Marrom', volume: '—' },
];

const tuboColor = (tubo: string | null) => TUBOS.find(t => t.label === tubo)?.color ?? 'bg-muted';
const tuboNome = (tubo: string | null) => TUBOS.find(t => t.label === tubo)?.nome ?? tubo ?? '—';
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const calcAge = (dob: string | null) => {
  if (!dob) return null;
  return ageFromDateOnly(dob);
};

const nomePaciente = (paciente: any) => paciente?.nome_social?.trim() || paciente?.nome || '—';
const sexoPaciente = (sexo: unknown) => {
  const valor = String(sexo ?? '').trim().toLowerCase();
  if (['m', 'masculino', 'male'].includes(valor)) return 'M';
  if (['f', 'feminino', 'female'].includes(valor)) return 'F';
  if (['o', 'outro', 'other'].includes(valor)) return 'O';
  return '—';
};
const sexoParaEtiqueta = (sexo: unknown) => {
  const codigo = sexoPaciente(sexo);
  if (codigo === 'M') return 'Masc';
  if (codigo === 'F') return 'Fem';
  return codigo === 'O' ? 'Outro' : '?';
};
const dataHoraClinica = (instant = new Date()) => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(instant);

const SLA_WARNING = 30; // minutes
const SLA_CRITICAL = 60;

const slaTimestamp = (coleta: any): string | null => {
  if (coleta.status === 'recoleta') return coleta.updated_at || coleta.created_at;
  // O SLA do mapa mede tempo aguardando coleta; ao registrar a coleta, esse
  // relógio termina. A próxima etapa (análise) tem seu próprio fluxo e fila.
  return coleta.status === 'pendente' ? coleta.created_at : null;
};

const waitTimeLabel = (created: string, now = new Date()) => {
  const mins = Math.max(0, differenceInMinutes(now, new Date(created)));
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  return `${h}h${mins % 60 > 0 ? `${mins % 60}m` : ''}`;
};

const waitTimeColor = (created: string, now = new Date()) => {
  const mins = Math.max(0, differenceInMinutes(now, new Date(created)));
  if (mins > SLA_CRITICAL) return 'text-destructive font-bold';
  if (mins > SLA_WARNING) return 'text-warning font-semibold';
  return 'text-muted-foreground';
};

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.04 } } };
const fadeUp = { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.2 } } };

export default function MapaColeta() {
  const { profile } = useSupabaseAuth();
  const [itens, setItens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [tuboFiltro, setTuboFiltro] = useState('Todos');
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => new Date());
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [eventoTipo, setEventoTipo] = useState('transporte');
  const [eventoLocal, setEventoLocal] = useState('');
  const [eventoMotivo, setEventoMotivo] = useState('');
  const [savingEvento, setSavingEvento] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const processingIdsRef = useRef(new Set<string>());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const bulkProcessingRef = useRef(false);
  const fetchRequestRef = useRef(0);
  const activeClinicRef = useRef<string | null>(null);

  const eventosAmostraQuery = useQuery({
    queryKey: ['lab-amostra-eventos', profile?.clinica_id, detailId],
    enabled: !!profile?.clinica_id && !!detailId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('laboratorio_eventos_amostra')
        .select('id, tipo, status_anterior, status_novo, local, detalhes, created_at, profiles(nome)')
        .eq('clinica_id', profile!.clinica_id!).eq('coleta_id', detailId!)
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const fetchColetas = useCallback(async () => {
    const clinicId = profile?.clinica_id ?? null;
    if (activeClinicRef.current !== clinicId) return;
    const requestId = ++fetchRequestRef.current;

    if (!clinicId) {
      setLoading(false);
      setLoadError(new Error('Clínica não identificada.'));
      return;
    }
    setLoading(true);
    try {
      const pagina = 500;
      const novasColetas: any[] = [];
      let cursor: { created_at: string; id: string } | null = null;
      while (true) {
        if (requestId !== fetchRequestRef.current || activeClinicRef.current !== clinicId) return;
        let query = (supabase as any)
          .from('coletas_laboratorio')
          .select(`
            id, codigo_amostra, status, created_at, updated_at, observacoes, tipo_amostra, local_atual, rejeicao_motivo, recoleta_de_id,
            tubo, urgente, jejum_necessario, jejum_horas, volume_ml,
            sitio_coleta, condicao_amostra, data_coleta, lote_insumo,
            pacientes(nome, nome_social, cpf, telefone, email, data_nascimento, sexo, convenios(nome)),
            medicos(nome, crm),
            exames(tipo_exame)
          `)
          .in('status', ['pendente', 'coletado', 'em_analise', 'recoleta', 'rejeitada'])
          .eq('clinica_id', clinicId);
        if (cursor) {
          query = query.or(`created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`);
        }
        const { data, error } = await query
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(pagina);
        if (error) throw error;
        const lote = data ?? [];
        novasColetas.push(...lote);
        if (lote.length < pagina) break;
        const ultima = lote[lote.length - 1];
        cursor = { created_at: ultima.created_at, id: ultima.id };
      }
      if (requestId !== fetchRequestRef.current || activeClinicRef.current !== clinicId) return;
      setItens(novasColetas);
      setSelected(prev => new Set([...prev].filter(id => novasColetas.some(item => item.id === id))));
      setLoadError(null);
    } catch (error) {
      if (requestId === fetchRequestRef.current && activeClinicRef.current === clinicId) {
        setLoadError(error);
      }
    } finally {
      if (requestId === fetchRequestRef.current && activeClinicRef.current === clinicId) {
        setLoading(false);
      }
    }
  }, [profile?.clinica_id]);

  useEffect(() => {
    const clinicId = profile?.clinica_id ?? null;
    activeClinicRef.current = clinicId;
    fetchRequestRef.current += 1;
    setItens([]);
    setSelected(new Set());
    setLoading(true);
    setLoadError(null);
    void fetchColetas();
    if (!clinicId) return () => { activeClinicRef.current = null; fetchRequestRef.current += 1; };
    const channel = supabase.channel(canalUnico('mapa-coleta-rt'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coletas_laboratorio', filter: `clinica_id=eq.${clinicId}` }, fetchColetas)
      .subscribe();
    return () => {
      if (activeClinicRef.current === clinicId) activeClinicRef.current = null;
      fetchRequestRef.current += 1;
      supabase.removeChannel(channel);
    };
  }, [fetchColetas, profile?.clinica_id]);

  // ─── Actions ─────────────────────────────────────────────
  const transitionStatus = async (id: string, expected: string[], status: string, message: string) => {
    if (!profile?.clinica_id || processingIdsRef.current.has(id) || bulkProcessingRef.current) return false;
    processingIdsRef.current.add(id);
    setProcessingIds(current => new Set(current).add(id));
    try {
      const updates: Record<string, unknown> = { status };
      if (status === 'coletado') updates.data_coleta = new Date().toISOString();
      const { data, error } = await (supabase as any).from('coletas_laboratorio')
        .update(updates)
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id)
        .in('status', expected)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('O status da coleta mudou ou ela não pertence à clínica atual. Atualize o mapa e tente novamente.');
      toast.success(message);
      await fetchColetas();
      return true;
    } catch (error) {
      toast.error('Não foi possível atualizar a coleta', { description: mensagemDeErro(error) });
      return false;
    } finally {
      processingIdsRef.current.delete(id);
      setProcessingIds(current => { const next = new Set(current); next.delete(id); return next; });
    }
  };

  const handleColetar = (id: string) => transitionStatus(id, ['pendente', 'recoleta'], 'coletado', 'Coleta registrada!');

  const handleBulkColetar = async () => {
    if (selected.size === 0 || bulkProcessingRef.current || !profile?.clinica_id) return;
    if ([...selected].some(id => processingIdsRef.current.has(id))) {
      toast.info('Aguarde a atualização individual terminar antes de coletar em lote.');
      return;
    }
    bulkProcessingRef.current = true;
    setBulkProcessing(true);
    const ids = Array.from(selected);
    let ok = 0;
    const failedIds: string[] = [];
    try {
      for (const id of ids) {
        const item = itens.find(i => i.id === id);
        if (item?.status !== 'pendente' && item?.status !== 'recoleta') continue;
        const { data, error } = await supabase.from('coletas_laboratorio')
          .update({ status: 'coletado', data_coleta: new Date().toISOString() })
          .eq('id', id).eq('clinica_id', profile.clinica_id).in('status', ['pendente', 'recoleta'])
          .select('id').maybeSingle();
        if (error || !data) failedIds.push(id);
        else ok++;
      }
      if (failedIds.length) toast.warning(`${ok} coleta(s) registrada(s); ${failedIds.length} não foram atualizadas.`, { description: 'As amostras que falharam continuam selecionadas para conferência.' });
      else if (ok) toast.success(`${ok} coleta(s) registrada(s)`);
      else toast.info('Nenhuma amostra selecionada está pendente de coleta.');
      setSelected(new Set(failedIds));
      await fetchColetas();
    } catch (error) {
      toast.error('Não foi possível concluir a coleta em lote', { description: mensagemDeErro(error) });
    } finally {
      bulkProcessingRef.current = false;
      setBulkProcessing(false);
    }
  };

  const handleRecoleta = (id: string) => transitionStatus(id, ['coletado'], 'recoleta', 'Recoleta solicitada');

  const handleCancelar = async (id: string) => {
    const cancelled = await transitionStatus(id, ['pendente', 'recoleta'], 'cancelado', 'Coleta cancelada');
    if (cancelled) setCancelarId(null);
  };

  const handleEncaminharAnalise = (id: string) => transitionStatus(id, ['coletado'], 'em_analise', 'Enviado para análise');

  const registrarEventoAmostra = async () => {
    const amostra = itens.find(item => item.id === detailId);
    if (!amostra || !profile?.clinica_id || savingEvento) return;
    if (['transporte', 'armazenamento'].includes(eventoTipo) && !eventoLocal.trim()) {
      toast.error('Informe o local da amostra.');
      return;
    }
    if (['rejeicao', 'recoleta'].includes(eventoTipo) && eventoMotivo.trim().length < 5) {
      toast.error('Informe um motivo com pelo menos 5 caracteres.');
      return;
    }
    setSavingEvento(true);
    try {
      const { data, error } = await (supabase as any).rpc('laboratorio_registrar_evento_amostra', {
        p_coleta_id: amostra.id,
        p_tipo: eventoTipo,
        p_local: eventoLocal.trim() || null,
        p_detalhes: eventoMotivo.trim() ? { motivo: eventoMotivo.trim() } : {},
      });
      if (error) throw error;
      const resultId = typeof data === 'string' ? data : amostra.id;
      toast.success(eventoTipo === 'recoleta' ? 'Nova amostra criada e vinculada à anterior' : 'Movimentação registrada no histórico');
      setEventoLocal(''); setEventoMotivo(''); setEventoTipo('transporte');
      await Promise.all([fetchColetas(), eventosAmostraQuery.refetch()]);
      if (eventoTipo === 'recoleta') setDetailId(resultId);
    } catch (error) {
      toast.error('Não foi possível registrar a movimentação', { description: mensagemDeErro(error) });
    } finally {
      setSavingEvento(false);
    }
  };

  const handleBulkPrint = () => {
    if (selected.size === 0) { toast.error('Selecione ao menos uma coleta'); return; }
    const selectedItems = itens.filter(i => selected.has(i.id));
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('O navegador bloqueou a janela de impressão. Permita pop-ups para gerar as etiquetas.');
      return;
    }
    const impressoEm = dataHoraClinica();
    w.document.write(`<html><head><title>Etiquetas</title><style>
        body{font-family:monospace;font-size:12px}
        .label{border:1px dashed #999;padding:8px;margin:4px 0;page-break-inside:avoid}
        .code{font-size:16px;font-weight:bold;letter-spacing:2px}
        @media print{.no-print{display:none}}</style></head><body>
        <button class="no-print" id="imprimir-mapa">🖨️ Imprimir</button>
        <h3 class="no-print">${selected.size} etiqueta(s)</h3>
        ${selectedItems.map(i => `<div class="label">
          <div class="code">${escapeHtml(i.codigo_amostra)}</div>
          <div><strong>${escapeHtml(nomePaciente(i.pacientes))}</strong></div>
          <div>${calcAge(i.pacientes?.data_nascimento) ?? '?'}a — ${sexoParaEtiqueta(i.pacientes?.sexo)}</div>
          <div>Tubo: ${escapeHtml(i.tubo ?? i.tipo_amostra)} | Exame: ${escapeHtml(i.exames?.tipo_exame ?? '—')}</div>
          <div>${escapeHtml(impressoEm)}</div>
        </div>`).join('')}</body></html>`);
    w.document.close();
    w.document.getElementById('imprimir-mapa')?.addEventListener('click', () => w.print());
    toast.success(`${selected.size} etiqueta(s) gerada(s)`);
  };

  // ─── Filtering ───────────────────────────────────────────
  const filtrado = useMemo(() => itens.filter(item => {
    if (tuboFiltro !== 'Todos' && item.tubo !== tuboFiltro) return false;
    if (statusFiltro !== 'todos' && item.status !== statusFiltro) return false;
    if (search.trim()) {
      const q = normalize(search.trim());
      if (
        !(item.pacientes && pacienteCorresponde(item.pacientes, search)) &&
        !normalize(item.codigo_amostra ?? '').includes(q) &&
        !normalize(item.exames?.tipo_exame ?? '').includes(q)
      ) return false;
    }
    return true;
  }), [itens, tuboFiltro, statusFiltro, search]);

  useEffect(() => {
    const idsVisiveis = new Set(filtrado.map(item => item.id));
    setSelected(current => {
      const next = new Set([...current].filter(id => idsVisiveis.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [filtrado]);

  const pendentes = filtrado.filter(i => i.status === 'pendente');
  const recoletas = filtrado.filter(i => i.status === 'recoleta');
  const rejeitadas = filtrado.filter(i => i.status === 'rejeitada');
  const coletados = filtrado.filter(i => i.status === 'coletado' || i.status === 'em_analise');
  const aguardando = [...recoletas, ...pendentes];
  const selectedColetaveis = itens.filter(i => selected.has(i.id) && (i.status === 'pendente' || i.status === 'recoleta')).length;

  const slaBreaches = itens.filter(i => {
    if (i.status !== 'pendente' && i.status !== 'recoleta') return false;
    const desde = slaTimestamp(i);
    return desde && differenceInMinutes(now, new Date(desde)) > SLA_CRITICAL;
  });

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });

  const toggleAll = (items: any[]) => {
    const ids = items.map(i => i.id);
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  // ─── Detail Modal ───────────────────────────────────────
  const detailItem = itens.find(i => i.id === detailId);

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'coletado') return <Badge className="bg-success/10 text-success border-success/20">Coletado</Badge>;
    if (status === 'em_analise') return <Badge variant="outline">Em análise</Badge>;
    if (status === 'recoleta') return <Badge variant="destructive" className="gap-1"><RotateCcw className="h-3 w-3" />Recoleta</Badge>;
    if (status === 'rejeitada') return <Badge variant="destructive">Rejeitada</Badge>;
    return <Badge variant="secondary">Pendente</Badge>;
  };

  const ColetaRow = ({ item, idx, showActions = true }: { item: any; idx: number; showActions?: boolean }) => {
    const age = calcAge(item.pacientes?.data_nascimento);
    const sexo = sexoPaciente(item.pacientes?.sexo);
    const convenio = (item.pacientes as any)?.convenios?.nome ?? 'Particular';
    const isUrgent = item.urgente;
    const desdeSLA = slaTimestamp(item);
    const isSLABreach = desdeSLA && differenceInMinutes(now, new Date(desdeSLA)) > SLA_CRITICAL;

    return (
      <tr className={cn(
        'border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors',
        isUrgent && 'bg-destructive/5',
        isSLABreach && !isUrgent && 'bg-warning/5',
      )}>
        <td className="px-3 py-2">
          <Checkbox
            checked={selected.has(item.id)}
            disabled={bulkProcessing || processingIds.has(item.id)}
            aria-label={`Selecionar coleta ${item.codigo_amostra || ''} de ${nomePaciente(item.pacientes)}`}
            onCheckedChange={() => toggleSelect(item.id)}
          />
        </td>
        <td className="px-2 py-2 text-xs font-bold text-muted-foreground tabular-nums">{idx + 1}</td>
        <td className="px-3 py-2">
          <button type="button" aria-label={`Ver detalhes da coleta ${item.codigo_amostra || ''}`} className="font-mono text-xs text-primary font-semibold hover:underline" onClick={() => setDetailId(item.id)}>
            {item.codigo_amostra}
          </button>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            {isUrgent && <Zap className="h-3.5 w-3.5 text-destructive flex-shrink-0" />}
            <div>
              <p className={cn('font-medium text-sm', isUrgent && 'text-destructive')}>{nomePaciente(item.pacientes)}</p>
              <p className="text-[11px] text-muted-foreground">{age !== null ? `${age}a` : '?'} · {sexo}{item.pacientes?.cpf ? ` · ${item.pacientes.cpf}` : ''}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell">{convenio}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <div className={cn('w-3 h-5 rounded-sm flex-shrink-0', tuboColor(item.tubo))} />
            <span className="text-xs">{tuboNome(item.tubo)}</span>
          </div>
        </td>
        <td className="px-3 py-2 text-xs hidden lg:table-cell">{item.exames?.tipo_exame ?? <span className="text-muted-foreground">—</span>}</td>
        <td className="px-3 py-2 text-center hidden md:table-cell">
          {item.jejum_necessario ? (
            <Badge variant="outline" className="text-[10px] gap-0.5"><Droplets className="h-2.5 w-2.5" />{item.jejum_horas ?? '?'}h</Badge>
          ) : <span className="text-[10px] text-muted-foreground">—</span>}
        </td>
        <td className="px-3 py-2 text-center hidden sm:table-cell">
          {item.status === 'coletado' && item.created_at && item.data_coleta ? (
            <span className="text-xs tabular-nums flex items-center justify-center gap-1 text-muted-foreground" title="Tempo até a coleta ser registrada">
              <Timer className="h-3 w-3" />{waitTimeLabel(item.created_at, new Date(item.data_coleta))}
            </span>
          ) : desdeSLA ? (
            <span className={cn('text-xs tabular-nums flex items-center justify-center gap-1', waitTimeColor(desdeSLA, now))}>
              <Timer className="h-3 w-3" />{waitTimeLabel(desdeSLA, now)}
            </span>
          ) : '—'}
        </td>
        <td className="px-3 py-2 text-center"><StatusBadge status={item.status} /></td>
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1">
            {showActions && (item.status === 'pendente' || item.status === 'recoleta') && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={processingIds.has(item.id) || bulkProcessing} onClick={() => handleColetar(item.id)}>
                {processingIds.has(item.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                {processingIds.has(item.id) ? 'Salvando…' : 'Coletar'}
              </Button>
            )}
            {item.status === 'coletado' && (
              <>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={processingIds.has(item.id) || bulkProcessing} onClick={() => handleEncaminharAnalise(item.id)}>
                  {processingIds.has(item.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                  {processingIds.has(item.id) ? 'Salvando…' : 'Análise'}
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-warning" aria-label={`Solicitar recoleta ${item.codigo_amostra || ''}`} title="Solicitar recoleta" disabled={processingIds.has(item.id) || bulkProcessing} onClick={() => handleRecoleta(item.id)}>
                  {processingIds.has(item.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                </Button>
              </>
            )}
            {(item.status === 'pendente' || item.status === 'recoleta') && (
              <Button variant="ghost" size="sm" className="h-7 text-destructive" aria-label={`Cancelar coleta ${item.codigo_amostra || ''}`} title="Cancelar coleta" disabled={processingIds.has(item.id) || bulkProcessing} onClick={() => setCancelarId(item.id)}>
                {processingIds.has(item.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  if (loadError) {
    return <ErrorState title="Não foi possível atualizar o mapa de coleta" description="Os dados anteriores foram ocultados para evitar registrar coleta com status desatualizado." error={loadError} onRetry={() => void fetchColetas()} />;
  }

  const TableHead = ({ items, label }: { items: any[]; label: string }) => {
    const selectedCount = items.filter(item => selected.has(item.id)).length;
    const allSelected = items.length > 0 && selectedCount === items.length;
    return (
    <thead>
      <tr className="border-b border-border bg-muted/30">
        <th className="px-3 py-2.5 w-8"><Checkbox checked={allSelected ? true : selectedCount > 0 ? 'indeterminate' : false} disabled={bulkProcessing} aria-label={`Selecionar todas as coletas: ${label}`} onCheckedChange={() => toggleAll(items)} /></th>
        <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground w-8">#</th>
        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-left">Código</th>
        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-left">Paciente</th>
        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-left hidden md:table-cell">Convênio</th>
        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-left">Tubo</th>
        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-left hidden lg:table-cell">Exame</th>
        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-center hidden md:table-cell">Jejum</th>
        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-center hidden sm:table-cell">Espera / coleta</th>
        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-center">Status</th>
        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">Ações</th>
      </tr>
    </thead>
    );
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" /> Mapa de Coleta
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Central de comando — {pendentes.length} aguardando · {recoletas.length} recoleta · {coletados.length} coletados
          </p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <>
              {selectedColetaveis > 0 && <Button variant="default" className="gap-2" disabled={bulkProcessing} onClick={handleBulkColetar}>
                {bulkProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Coletar {selectedColetaveis}
              </Button>}
              <Button variant="outline" className="gap-2" onClick={handleBulkPrint}>
                <Printer className="h-4 w-4" /> Etiquetas ({selected.size})
              </Button>
            </>
          )}
          <Button variant="outline" className="gap-2" disabled={loading} onClick={fetchColetas}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Atualizar
          </Button>
        </div>
      </div>

      {/* SLA Alert */}
      {slaBreaches.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">
              {slaBreaches.length} coleta(s) excedendo SLA de {SLA_CRITICAL}min
            </p>
            <p className="text-xs text-muted-foreground">
              {slaBreaches.slice(0, 3).map(i => `${nomePaciente(i.pacientes)} (${waitTimeLabel(slaTimestamp(i) || i.created_at, now)})`).join(' · ')}
            </p>
          </div>
        </motion.div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'Aguardando', value: pendentes.length, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
          { label: 'Recoleta', value: recoletas.length, icon: RotateCcw, color: 'text-destructive', bg: 'bg-destructive/10' },
          { label: 'Coletados', value: coletados.length, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
          { label: 'Urgentes', value: filtrado.filter(i => i.urgente).length, icon: Zap, color: 'text-destructive', bg: 'bg-destructive/10' },
          { label: 'SLA Crítico', value: slaBreaches.length, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
          { label: 'Rejeitadas', value: rejeitadas.length, icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', s.bg)}><s.icon className={cn('h-5 w-5', s.color)} /></div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tube legend */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Legenda de Tubos</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {TUBOS.map(t => (
              <div key={t.label} className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5">
                <div className={cn('h-5 w-3 rounded-sm', t.color)} />
                <div>
                  <p className="text-[11px] font-medium leading-none">{t.nome}</p>
                  <p className="text-[10px] text-muted-foreground">{t.volume}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 w-64" placeholder="Nome, CPF, telefone, código ou exame..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={tuboFiltro} onValueChange={setTuboFiltro}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todos os tubos</SelectItem>
            {TUBOS.map(t => (
              <SelectItem key={t.label} value={t.label}>
                <span className="flex items-center gap-2"><span className={cn('h-3 w-2 rounded-sm', t.color)} />{t.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFiltro} onValueChange={setStatusFiltro}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="coletado">Coletado</SelectItem>
            <SelectItem value="em_analise">Em análise</SelectItem>
            <SelectItem value="recoleta">Recoleta</SelectItem>
            <SelectItem value="rejeitada">Rejeitada</SelectItem>
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <Badge variant="outline" className="text-xs gap-1">
            {selected.size} selecionado(s)
            <button type="button" aria-label="Limpar seleção de coletas" className="ml-1 hover:text-destructive" onClick={() => setSelected(new Set())}>✕</button>
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
          {aguardando.length > 0 && (
            <motion.div variants={fadeUp}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-warning" />
                    Aguardando Coleta ({aguardando.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <TableHead items={aguardando} label="aguardando coleta" />
                    <tbody>{aguardando.map((item, idx) => <ColetaRow key={item.id} item={item} idx={idx} showActions />)}</tbody>
                  </table>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {coletados.length > 0 && (
            <motion.div variants={fadeUp}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                    Coletados ({coletados.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <TableHead items={coletados} label="coletadas" />
                    <tbody>{coletados.map((item, idx) => <ColetaRow key={item.id} item={item} idx={idx} showActions />)}</tbody>
                  </table>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {rejeitadas.length > 0 && (
            <motion.div variants={fadeUp}>
              <Card className="border-destructive/20">
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><XCircle className="h-4 w-4 text-destructive" />Amostras rejeitadas ({rejeitadas.length})</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto p-0"><table className="w-full text-sm"><TableHead items={rejeitadas} label="rejeitadas" /><tbody>{rejeitadas.map((item, idx) => <ColetaRow key={item.id} item={item} idx={idx} showActions={false} />)}</tbody></table></CardContent>
              </Card>
            </motion.div>
          )}

          {filtrado.length === 0 && !loading && (
            <motion.div variants={fadeUp}>
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <FlaskConical className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground font-medium">
                    {itens.length === 0
                      ? 'Não há coletas nesta fila no momento.'
                      : 'Nenhuma coleta corresponde à busca e aos filtros selecionados.'}
                  </p>
                  {itens.length > 0 && (search.trim() || tuboFiltro !== 'Todos' || statusFiltro !== 'todos') && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => { setSearch(''); setTuboFiltro('Todos'); setStatusFiltro('todos'); }}
                    >
                      Limpar filtros
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Detail modal */}
      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              Detalhes da Coleta — {detailItem?.codigo_amostra}
            </DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 bg-muted/20">
                <div><p className="text-[11px] text-muted-foreground">Paciente</p><p className="font-semibold">{nomePaciente(detailItem.pacientes)}</p></div>
                <div><p className="text-[11px] text-muted-foreground">CPF</p><p>{detailItem.pacientes?.cpf || '—'}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Solicitada em</p><p>{detailItem.created_at ? dataHoraClinica(new Date(detailItem.created_at)) : '—'}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Coletada em</p><p>{detailItem.data_coleta ? dataHoraClinica(new Date(detailItem.data_coleta)) : '—'}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Médico</p><p>{detailItem.medicos?.nome || '—'}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Exame</p><p>{detailItem.exames?.tipo_exame || '—'}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Amostra</p><p>{detailItem.tipo_amostra} {detailItem.tubo && `· ${detailItem.tubo}`}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Volume</p><p>{detailItem.volume_ml ? `${detailItem.volume_ml}mL` : '—'}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Sítio</p><p>{detailItem.sitio_coleta || '—'}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Lote Insumo</p><p>{detailItem.lote_insumo || '—'}</p></div>
              </div>
              {detailItem.condicao_amostra?.length > 0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Condições da Amostra</p>
                  <div className="flex gap-1 flex-wrap">
                    {detailItem.condicao_amostra.map((c: string) => <Badge key={c} variant="destructive" className="text-[10px]">{c}</Badge>)}
                  </div>
                </div>
              )}
              {detailItem.observacoes && (
                <div><p className="text-[11px] text-muted-foreground">Observações</p><p>{detailItem.observacoes}</p></div>
              )}
              <div className="flex gap-2 pt-2">
                <StatusBadge status={detailItem.status} />
                {detailItem.urgente && <Badge variant="destructive" className="gap-1"><Zap className="h-3 w-3" />Urgente</Badge>}
                {detailItem.jejum_necessario && <Badge variant="outline">Jejum {detailItem.jejum_horas}h</Badge>}
              </div>
              {detailItem.local_atual && <p className="text-xs text-muted-foreground">Local atual: <span className="font-medium text-foreground">{detailItem.local_atual}</span></p>}
              {detailItem.rejeicao_motivo && <p className="rounded-md bg-destructive/5 p-2 text-xs text-destructive">Motivo da rejeição: {detailItem.rejeicao_motivo}</p>}

              <section className="space-y-3 rounded-xl border p-3" aria-label="Histórico de rastreabilidade">
                <div><p className="text-sm font-semibold">Rastreabilidade da amostra</p><p className="text-xs text-muted-foreground">Cada movimentação fica registrada com data e responsável.</p></div>
                {eventosAmostraQuery.isError ? <ErrorState compact title="Não foi possível carregar o histórico" error={eventosAmostraQuery.error} onRetry={() => void eventosAmostraQuery.refetch()} /> : eventosAmostraQuery.isLoading ? <p role="status" className="text-xs text-muted-foreground">Carregando histórico…</p> : eventosAmostraQuery.data?.length ? (
                  <ol className="max-h-48 space-y-3 overflow-y-auto">{eventosAmostraQuery.data.map((evento: any) => <li key={evento.id} className="flex gap-2 border-l-2 border-primary/20 pl-3"><div className="min-w-0"><p className="text-xs font-medium capitalize">{String(evento.tipo).replace(/_/g, ' ')}{evento.status_novo ? ` · ${evento.status_novo}` : ''}</p><p className="text-[11px] text-muted-foreground">{dataHoraClinica(new Date(evento.created_at))}{evento.profiles?.nome ? ` · ${evento.profiles.nome}` : ''}{evento.local ? ` · ${evento.local}` : ''}</p>{evento.detalhes?.motivo && <p className="mt-0.5 text-xs">{evento.detalhes.motivo}</p>}</div></li>)}</ol>
                ) : <p className="text-xs text-muted-foreground">Nenhuma movimentação registrada.</p>}
              </section>

              <section className="space-y-3 rounded-xl border bg-muted/10 p-3">
                <p className="text-sm font-semibold">Registrar movimentação</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label>Evento</Label><Select value={eventoTipo} onValueChange={setEventoTipo}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="recebida">Recebimento no laboratório</SelectItem><SelectItem value="transporte">Transporte</SelectItem><SelectItem value="armazenamento">Armazenamento</SelectItem><SelectItem value="observacao">Observação</SelectItem>
                    {(detailItem.status === 'coletado' || detailItem.status === 'em_analise') && <SelectItem value="rejeicao">Rejeitar amostra</SelectItem>}
                    {detailItem.status === 'rejeitada' && <SelectItem value="recoleta">Abrir recoleta</SelectItem>}
                  </SelectContent></Select></div>
                  {['transporte', 'armazenamento'].includes(eventoTipo) && <div className="space-y-1"><Label htmlFor="lab-amostra-local">Local</Label><Input id="lab-amostra-local" value={eventoLocal} onChange={(event) => setEventoLocal(event.target.value)} maxLength={120} placeholder="Ex.: setor de bioquímica" /></div>}
                  {['rejeicao', 'recoleta', 'observacao'].includes(eventoTipo) && <div className="space-y-1 sm:col-span-2"><Label htmlFor="lab-amostra-motivo">{eventoTipo === 'observacao' ? 'Observação' : 'Motivo'}</Label><Input id="lab-amostra-motivo" value={eventoMotivo} onChange={(event) => setEventoMotivo(event.target.value)} maxLength={500} placeholder="Descreva a ocorrência" /></div>}
                </div>
                <div className="flex justify-end"><Button size="sm" onClick={() => void registrarEventoAmostra()} disabled={savingEvento} className="gap-2">{savingEvento && <Loader2 className="h-4 w-4 animate-spin" />} Registrar evento</Button></div>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <AlertDialog open={!!cancelarId} onOpenChange={(open) => !open && setCancelarId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar coleta?</AlertDialogTitle>
            <AlertDialogDescription>Esta coleta será marcada como cancelada.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!cancelarId || processingIds.has(cancelarId)}
              onClick={(event) => { event.preventDefault(); if (cancelarId) void handleCancelar(cancelarId); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancelar Coleta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
