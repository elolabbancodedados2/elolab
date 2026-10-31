import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  CheckCircle2, RefreshCw, Loader2, RotateCcw, XCircle, Search, Printer, FlaskConical,
  AlertTriangle, Clock, Zap, Droplets, Timer, Activity, ArrowRight, X, DoorOpen,
  TestTubes, MessageCircle, User, Eye, Beaker,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader } from '@/components/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { sampleLabelHtml } from '@/lib/sampleLabel';
import { canalUnico } from '@/lib/realtimeCanal';
import { ErrorState } from '@/components/ErrorState';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ageFromDateOnly, dateOnlyInTimeZone, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { dadosTransicaoColeta } from '@/lib/mapaColetaWorkflow';
import { linkWhatsApp } from '@/lib/whatsapp';
import { LaboratorioSubnav } from '@/components/laboratorio/LaboratorioSubnav';

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
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

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
  if (mins > SLA_WARNING) return 'text-warning-foreground font-semibold';
  return 'text-muted-foreground';
};

type FiltroRapido = 'todos' | 'pendente' | 'recoleta' | 'coletados' | 'urgente' | 'sla' | 'rejeitada';

const FILTRO_LABELS: Record<FiltroRapido, string> = {
  todos: 'todas as coletas',
  pendente: 'pendentes',
  recoleta: 'recoletas',
  coletados: 'coletadas',
  urgente: 'urgentes',
  sla: 'com SLA crítico',
  rejeitada: 'rejeitadas',
};

const STATUS_ORDEM: Record<string, number> = { recoleta: 0, pendente: 1, coletado: 2, em_analise: 3, rejeitada: 4 };
const SEM_SETOR = '__sem_setor__';

const aguardaColeta = (item: any) => item.status === 'pendente' || item.status === 'recoleta';

export default function MapaColeta() {
  const location = useLocation();
  const navigate = useNavigate();
  const filters = location.state?.mapaFilters;
  const setDetailId = (id: string) => navigate(`/mapa-coleta/${id}`, { state: { mapaFilters: { search, tuboFiltro, filtroRapido, setorFiltro } } });
  const handleRecoleta = (id: string) => navigate(`/mapa-coleta/${id}`, { state: { eventoInicial: 'recoleta', mapaFilters: { search, tuboFiltro, filtroRapido, setorFiltro } } });
  const { profile, hasAnyRole } = useSupabaseAuth();
  const [itens, setItens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [search, setSearch] = useState(filters?.search ?? '');
  const [tuboFiltro, setTuboFiltro] = useState(filters?.tuboFiltro ?? 'Todos');
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>(filters?.filtroRapido ?? 'todos');
  const [setorFiltro, setSetorFiltro] = useState(filters?.setorFiltro ?? 'todos');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => new Date());
  const [cancelarId, setCancelarId] = useState<string | null>(null);

  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const processingIdsRef = useRef(new Set<string>());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const bulkProcessingRef = useRef(false);
  const fetchRequestRef = useRef(0);
  const activeClinicRef = useRef<string | null>(null);
  const podeVerSalas = hasAnyRole(['admin']);

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
            tubo, urgente, jejum_necessario, jejum_horas, volume_ml, paciente_id, setor_id,
            sitio_coleta, condicao_amostra, data_coleta, lote_insumo,
            pacientes(nome, nome_social, cpf, telefone, email, data_nascimento, sexo, convenios(nome)),
            medicos(nome, crm),
            exames(tipo_exame),
            laboratorio_setores(nome)
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
      const updates = dadosTransicaoColeta(status, profile.id);
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
          .update(dadosTransicaoColeta('coletado', profile.id) as any)
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

  const handleCancelar = async (id: string) => {
    const cancelled = await transitionStatus(id, ['pendente', 'recoleta'], 'cancelado', 'Coleta cancelada');
    if (cancelled) setCancelarId(null);
  };

  const handleEncaminharAnalise = (id: string) => transitionStatus(id, ['coletado'], 'em_analise', 'Enviado para análise');

  const handleBulkPrint = () => {
    if (selected.size === 0) { toast.error('Selecione ao menos uma coleta'); return; }
    const selectedItems = itens.filter(i => selected.has(i.id));
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('O navegador bloqueou a janela de impressão. Permita pop-ups para gerar as etiquetas.');
      return;
    }
    const labels = selectedItems.map(item => sampleLabelHtml({
      codigoAmostra: item.codigo_amostra,
      tubo: item.tubo ?? item.tipo_amostra ?? '',
    })).join('');
    w.document.write(`<html><head><meta charset="utf-8"><title>Etiquetas de amostras</title><style>
        body{font-family:Arial,sans-serif;font-size:12px}
        .label{box-sizing:border-box;width:58mm;min-height:30mm;border:1px dashed #999;padding:3mm;margin:2mm 0;page-break-inside:avoid;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5mm}
        .sample-code{font-family:monospace;font-size:16px;font-weight:bold;letter-spacing:2px}
        .barcode svg{display:block;width:48mm;height:12mm}
        .tube{font-size:10px}
        .barcode-error{font-size:9px;color:#900}
        @media print{.no-print{display:none}}</style></head><body>
        <button class="no-print" id="imprimir-mapa">Imprimir</button>
        <h3 class="no-print">${selected.size} etiqueta(s)</h3>
        ${labels}</body></html>`);
    w.document.close();
    w.document.getElementById('imprimir-mapa')?.addEventListener('click', () => w.print());
    toast.success(`${selected.size} etiqueta(s) gerada(s)`);
  };

  // ─── Derived data ────────────────────────────────────────
  const hoje = todaySaoPauloDateOnly(now);
  const ehDeHoje = (iso: string | null | undefined) => !!iso && dateOnlyInTimeZone(new Date(iso), 'America/Sao_Paulo') === hoje;
  const emSLACritico = (item: any) => {
    if (!aguardaColeta(item)) return false;
    const desde = slaTimestamp(item);
    return !!desde && differenceInMinutes(now, new Date(desde)) > SLA_CRITICAL;
  };

  const setorChave = (item: any) => item.setor_id ?? SEM_SETOR;
  const setorNome = (item: any) => item.laboratorio_setores?.nome ?? (item.setor_id ? 'Setor sem nome' : 'Sem setor definido');

  const setores = useMemo(() => {
    const mapa = new Map<string, { chave: string; nome: string; total: number; pendentes: number }>();
    for (const item of itens) {
      const chave = setorChave(item);
      const atual = mapa.get(chave) ?? { chave, nome: setorNome(item), total: 0, pendentes: 0 };
      atual.total += 1;
      if (aguardaColeta(item)) atual.pendentes += 1;
      mapa.set(chave, atual);
    }
    return [...mapa.values()].sort((a, b) => {
      if (a.chave === SEM_SETOR) return 1;
      if (b.chave === SEM_SETOR) return -1;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [itens]);

  const stats = useMemo(() => ({
    pendente: itens.filter(i => i.status === 'pendente').length,
    recoleta: itens.filter(i => i.status === 'recoleta').length,
    coletados: itens.filter(i => i.status === 'coletado' || i.status === 'em_analise').length,
    urgente: itens.filter(i => i.urgente && aguardaColeta(i)).length,
    sla: itens.filter(emSLACritico).length,
    rejeitada: itens.filter(i => i.status === 'rejeitada').length,
  }), [itens, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const coletasHoje = itens.filter(i => ehDeHoje(i.created_at)).length;
  const aguardandoTotal = stats.pendente + stats.recoleta;
  const emAndamento = itens.filter(i => i.status === 'coletado').length;
  const concluidasHoje = itens.filter(i => (i.status === 'coletado' || i.status === 'em_analise') && ehDeHoje(i.data_coleta)).length;

  const slaBreaches = itens.filter(emSLACritico);

  const compararPrioridade = (a: any, b: any) => {
    const sa = STATUS_ORDEM[a.status] ?? 9;
    const sb = STATUS_ORDEM[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    if (!!a.urgente !== !!b.urgente) return a.urgente ? -1 : 1;
    return String(slaTimestamp(a) ?? a.created_at ?? '').localeCompare(String(slaTimestamp(b) ?? b.created_at ?? ''));
  };

  const proximaColeta = useMemo(() => {
    const fila = itens.filter(aguardaColeta).sort((a, b) => {
      if (!!a.urgente !== !!b.urgente) return a.urgente ? -1 : 1;
      return String(slaTimestamp(a) ?? a.created_at ?? '').localeCompare(String(slaTimestamp(b) ?? b.created_at ?? ''));
    });
    return fila[0] ?? null;
  }, [itens]);

  // ─── Filtering ───────────────────────────────────────────
  const filtrado = useMemo(() => itens.filter(item => {
    if (tuboFiltro !== 'Todos' && item.tubo !== tuboFiltro) return false;
    if (setorFiltro !== 'todos' && setorChave(item) !== setorFiltro) return false;
    if (filtroRapido === 'pendente' && item.status !== 'pendente') return false;
    if (filtroRapido === 'recoleta' && item.status !== 'recoleta') return false;
    if (filtroRapido === 'coletados' && item.status !== 'coletado' && item.status !== 'em_analise') return false;
    if (filtroRapido === 'rejeitada' && item.status !== 'rejeitada') return false;
    if (filtroRapido === 'urgente' && !(item.urgente && aguardaColeta(item))) return false;
    if (filtroRapido === 'sla' && !emSLACritico(item)) return false;
    if (search.trim()) {
      const q = normalize(search.trim());
      if (
        !(item.pacientes && pacienteCorresponde(item.pacientes, search)) &&
        !normalize(item.codigo_amostra ?? '').includes(q) &&
        !normalize(item.exames?.tipo_exame ?? '').includes(q)
      ) return false;
    }
    return true;
  }).sort(compararPrioridade), [itens, tuboFiltro, setorFiltro, filtroRapido, search, now]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const idsVisiveis = new Set(filtrado.map(item => item.id));
    setSelected(current => {
      const next = new Set([...current].filter(id => idsVisiveis.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [filtrado]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, { chave: string; nome: string; itens: any[] }>();
    for (const item of filtrado) {
      const chave = setorChave(item);
      const grupo = mapa.get(chave) ?? { chave, nome: setorNome(item), itens: [] };
      grupo.itens.push(item);
      mapa.set(chave, grupo);
    }
    const ordem = new Map(setores.map((s, index) => [s.chave, index]));
    return [...mapa.values()].sort((a, b) => (ordem.get(a.chave) ?? 99) - (ordem.get(b.chave) ?? 99));
  }, [filtrado, setores]);

  const selectedColetaveis = itens.filter(i => selected.has(i.id) && aguardaColeta(i)).length;
  const temFiltro = search.trim() !== '' || tuboFiltro !== 'Todos' || filtroRapido !== 'todos' || setorFiltro !== 'todos';
  const limparFiltros = () => { setSearch(''); setTuboFiltro('Todos'); setFiltroRapido('todos'); setSetorFiltro('todos'); };

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

  const mensagemWhatsApp = (item: any) => {
    const primeiroNome = String(nomePaciente(item.pacientes)).split(' ')[0];
    const jejum = item.jejum_necessario ? ` Lembre-se do jejum de ${item.jejum_horas ?? '?'}h.` : '';
    return `Olá, ${primeiroNome}! Aqui é da clínica. Sua coleta de exame${item.exames?.tipo_exame ? ` (${item.exames.tipo_exame})` : ''} está pendente.${jejum} Podemos confirmar sua vinda?`;
  };



  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'coletado') return <Badge variant="outline" className="rounded-full border-success/30 bg-success/10 text-success">Coletado</Badge>;
    if (status === 'em_analise') return <Badge variant="outline" className="rounded-full border-info/30 bg-info/10 text-info">Em análise</Badge>;
    if (status === 'recoleta') return <Badge variant="outline" className="gap-1 rounded-full border-destructive/30 bg-destructive/10 text-destructive"><RotateCcw aria-hidden="true" className="h-3 w-3" />Recoleta</Badge>;
    if (status === 'rejeitada') return <Badge className="rounded-full border-transparent bg-destructive text-destructive-foreground hover:bg-destructive">Rejeitada</Badge>;
    return <Badge variant="outline" className="rounded-full border-warning/40 bg-warning/10 text-warning-foreground">Pendente</Badge>;
  };

  const ColetaRow = ({ item, idx, showActions = true }: { item: any; idx: number; showActions?: boolean }) => {
    const age = calcAge(item.pacientes?.data_nascimento);
    const sexo = sexoPaciente(item.pacientes?.sexo);
    const convenio = (item.pacientes as any)?.convenios?.nome ?? 'Particular';
    const isUrgent = item.urgente;
    const desdeSLA = slaTimestamp(item);
    const isSLABreach = desdeSLA && differenceInMinutes(now, new Date(desdeSLA)) > SLA_CRITICAL;
    const eProxima = proximaColeta?.id === item.id;
    const processando = processingIds.has(item.id);

    return (
      <tr className={cn(
        'border-b border-border/50 transition-colors last:border-0 hover:bg-muted/50',
        eProxima && 'bg-muted/30',
        isUrgent && 'bg-warning/5',
        isSLABreach && !isUrgent && 'bg-warning/5',
      )}>
        <td className="px-3 py-2">
          <Checkbox
            checked={selected.has(item.id)}
            disabled={bulkProcessing || processando}
            aria-label={`Selecionar coleta ${item.codigo_amostra || ''} de ${nomePaciente(item.pacientes)}`}
            onCheckedChange={() => toggleSelect(item.id)}
          />
        </td>
        <td className="px-2 py-2">
          <span className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums',
            eProxima ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}>
            {idx + 1}
          </span>
        </td>
        <td className="px-3 py-2">
          <button type="button" aria-label={`Ver detalhes da coleta ${item.codigo_amostra || ''}`} className="font-mono text-xs font-semibold text-primary hover:underline" onClick={() => setDetailId(item.id)}>
            {item.codigo_amostra}
          </button>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            {isUrgent && <Zap aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0 text-warning-foreground" />}
            <div className="min-w-0">
              <div className={cn('flex items-center gap-1.5 text-sm font-medium', isUrgent && 'text-warning-foreground')}>
                <span className="truncate">{nomePaciente(item.pacientes)}</span>
                {eProxima && <Badge className="rounded-full border-transparent bg-primary text-[9px] text-primary-foreground hover:bg-primary">Próxima</Badge>}
              </div>
              <p className="text-[11px] text-muted-foreground">{age !== null ? `${age}a` : '?'} · {sexo}{item.pacientes?.cpf ? ` · ${item.pacientes.cpf}` : ''}</p>
            </div>
          </div>
        </td>
        <td className="hidden px-3 py-2 text-xs text-muted-foreground md:table-cell">{convenio}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <div aria-hidden="true" className={cn('h-5 w-3 flex-shrink-0 rounded-sm', tuboColor(item.tubo))} />
            <span className="text-xs">{tuboNome(item.tubo)}</span>
          </div>
        </td>
        <td className="hidden px-3 py-2 text-xs lg:table-cell">{item.exames?.tipo_exame ?? <span className="text-muted-foreground">—</span>}</td>
        <td className="hidden px-3 py-2 text-center md:table-cell">
          {item.jejum_necessario ? (
            <Badge variant="outline" className="gap-0.5 rounded-full text-[10px]"><Droplets aria-hidden="true" className="h-2.5 w-2.5" />{item.jejum_horas ?? '?'}h</Badge>
          ) : <span className="text-[10px] text-muted-foreground">—</span>}
        </td>
        <td className="hidden px-3 py-2 text-center sm:table-cell">
          {item.status === 'coletado' && item.created_at && item.data_coleta ? (
            <span className="flex items-center justify-center gap-1 text-xs tabular-nums text-muted-foreground" title="Tempo até a coleta ser registrada">
              <Timer aria-hidden="true" className="h-3 w-3" />{waitTimeLabel(item.created_at, new Date(item.data_coleta))}
            </span>
          ) : desdeSLA ? (
            <span className={cn('flex items-center justify-center gap-1 text-xs tabular-nums', waitTimeColor(desdeSLA, now))}>
              <Timer aria-hidden="true" className="h-3 w-3" />{waitTimeLabel(desdeSLA, now)}
            </span>
          ) : '—'}
        </td>
        <td className="px-3 py-2 text-center"><StatusBadge status={item.status} /></td>
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1">
            {showActions && aguardaColeta(item) && (
              <Button size="sm" className="h-9 gap-1 rounded-full bg-primary px-4 text-xs text-primary-foreground hover:bg-primary/90" disabled={processando || bulkProcessing} onClick={() => handleColetar(item.id)}>
                {processando ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                {processando ? 'Salvando…' : 'Coletar'}
              </Button>
            )}
            {item.status === 'coletado' && (
              <>
                <Button size="sm" className="h-9 gap-1 rounded-full bg-primary px-4 text-xs text-primary-foreground shadow-sm hover:bg-primary/90" disabled={processando || bulkProcessing} onClick={() => handleEncaminharAnalise(item.id)}>
                  {processando ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                  {processando ? 'Salvando…' : 'Análise'}
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9 rounded-full text-warning-foreground" aria-label={`Solicitar recoleta ${item.codigo_amostra || ''}`} title="Solicitar recoleta" disabled={processando || bulkProcessing} onClick={() => handleRecoleta(item.id)}>
                  {processando ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                </Button>
              </>
            )}
            {aguardaColeta(item) && (
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-destructive hover:text-destructive" aria-label={`Cancelar coleta ${item.codigo_amostra || ''}`} title="Cancelar coleta" disabled={processando || bulkProcessing} onClick={() => setCancelarId(item.id)}>
                {processando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
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
      <tr className="border-b border-border/60 bg-muted/30">
        <th className="w-8 px-3 py-2.5"><Checkbox checked={allSelected ? true : selectedCount > 0 ? 'indeterminate' : false} disabled={bulkProcessing} aria-label={`Selecionar todas as coletas: ${label}`} onCheckedChange={() => toggleAll(items)} /></th>
        <th className="w-8 px-2 py-2.5 text-xs font-medium text-muted-foreground">#</th>
        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Código</th>
        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Paciente</th>
        <th className="hidden px-3 py-2.5 text-left text-xs font-medium text-muted-foreground md:table-cell">Convênio</th>
        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Tubo</th>
        <th className="hidden px-3 py-2.5 text-left text-xs font-medium text-muted-foreground lg:table-cell">Exame</th>
        <th className="hidden px-3 py-2.5 text-center text-xs font-medium text-muted-foreground md:table-cell">Jejum</th>
        <th className="hidden px-3 py-2.5 text-center text-xs font-medium text-muted-foreground sm:table-cell">Espera / coleta</th>
        <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">Status</th>
        <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Ações</th>
      </tr>
    </thead>
    );
  };

  const descricao = itens.length > 0
    ? `${coletasHoje} coleta${coletasHoje === 1 ? '' : 's'} hoje · ${aguardandoTotal} pendente${aguardandoTotal === 1 ? '' : 's'} · ${emAndamento} em andamento · ${concluidasHoje} concluída${concluidasHoje === 1 ? '' : 's'}`
    : 'Acompanhe as amostras aguardando coleta por sala ou setor';

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Mapa de Coleta"
        description={descricao}
        icon={<FlaskConical />}
        actions={
          <>
            {selected.size > 0 && (
              <>
                <Button variant="outline" className="shrink-0 gap-2 rounded-full" onClick={handleBulkPrint}>
                  <Printer aria-hidden="true" className="h-4 w-4" /> Etiquetas ({selected.size})
                </Button>
                {selectedColetaveis > 0 && (
                  <Button className="shrink-0 gap-2 rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90" disabled={bulkProcessing} onClick={handleBulkColetar}>
                    {bulkProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Coletar {selectedColetaveis}
                  </Button>
                )}
              </>
            )}
            <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
              <Link to="/laboratorio"><Activity aria-hidden="true" className="h-4 w-4" /> Painel do laboratório</Link>
            </Button>
            {podeVerSalas && (
              <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
                <Link to="/gestao-fluxo"><DoorOpen aria-hidden="true" className="h-4 w-4" /> Salas</Link>
              </Button>
            )}
            <Button variant="outline" size="icon" className="shrink-0 rounded-full" disabled={loading} onClick={() => void fetchColetas()} aria-label="Atualizar mapa de coleta" title="Atualizar mapa de coleta">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </>
        }
      />

      <LaboratorioSubnav />

      {/* SLA Alert */}
      {slaBreaches.length > 0 && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/15">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-destructive">
              {slaBreaches.length} coleta(s) excedendo SLA de {SLA_CRITICAL}min
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {slaBreaches.slice(0, 3).map(i => `${nomePaciente(i.pacientes)} (${waitTimeLabel(slaTimestamp(i) || i.created_at, now)})`).join(' · ')}
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-9 shrink-0 rounded-full border-destructive/30 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" aria-pressed={filtroRapido === 'sla'} onClick={() => setFiltroRapido(filtroRapido === 'sla' ? 'todos' : 'sla')}>
            {filtroRapido === 'sla' ? 'Ver todas' : 'Ver atrasadas'}
          </Button>
        </div>
      )}

      {/* Indicadores */}
      <section role="group" aria-label="Situação das coletas" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Situação agora</h2>
          <p className="text-xs text-muted-foreground">
            {filtroRapido === 'todos' ? 'Clique em um indicador para filtrar as coletas.' : `Mostrando apenas ${FILTRO_LABELS[filtroRapido]}.`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-6">
          {([
            { key: 'pendente' as FiltroRapido, icon: Clock, label: 'Pendentes', caption: 'aguardando coleta', color: 'text-foreground', surface: 'bg-secondary', escuro: false },
            { key: 'recoleta' as FiltroRapido, icon: RotateCcw, label: 'Recoleta', caption: 'nova amostra necessária', color: 'text-destructive', surface: 'bg-destructive/10', escuro: false },
            { key: 'coletados' as FiltroRapido, icon: CheckCircle2, label: 'Coletados', caption: 'aguardando ou em análise', color: 'text-success', surface: 'bg-success/10', escuro: false },
            { key: 'urgente' as FiltroRapido, icon: Zap, label: 'Urgentes', caption: 'pendentes com prioridade', color: 'text-warning-foreground', surface: 'bg-warning/10', escuro: false },
            { key: 'sla' as FiltroRapido, icon: AlertTriangle, label: 'SLA crítico', caption: `acima de ${SLA_CRITICAL} min`, color: 'text-warning-foreground', surface: 'bg-warning/10', escuro: false },
            { key: 'rejeitada' as FiltroRapido, icon: XCircle, label: 'Rejeitadas', caption: 'amostras recusadas', color: 'text-muted-foreground', surface: 'bg-muted', escuro: false },
          ]).map(s => {
            const Icon = s.icon;
            const ativo = filtroRapido === s.key;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltroRapido(ativo ? 'todos' : s.key)}
                className={cn(
                  'rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  s.escuro && 'border-transparent bg-primary text-primary-foreground',
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
                      <span className={cn('text-2xl font-bold tabular-nums', s.color)}>{stats[s.key as keyof typeof stats]}</span>
                    </div>
                    <p className={cn('truncate text-[11px]', s.escuro ? 'text-white/60' : 'text-muted-foreground')}>{s.caption}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Próxima coleta */}
      {proximaColeta && (() => {
        const desde = slaTimestamp(proximaColeta);
        const whatsapp = linkWhatsApp(proximaColeta.pacientes?.telefone, mensagemWhatsApp(proximaColeta));
        const processando = processingIds.has(proximaColeta.id);
        return (
          <Card className="overflow-hidden rounded-2xl border-primary/30 shadow-sm">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
                  <TestTubes className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Próxima coleta</p>
                  <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-foreground">
                    <span className="truncate">{nomePaciente(proximaColeta.pacientes)}</span>
                    {proximaColeta.urgente && <Badge variant="outline" className="gap-1 rounded-full border-warning/40 bg-warning/10 text-[10px] text-warning-foreground"><Zap aria-hidden="true" className="h-3 w-3" />Urgente</Badge>}
                    <StatusBadge status={proximaColeta.status} />
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-mono font-semibold text-primary">{proximaColeta.codigo_amostra}</span>
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden="true" className={cn('h-3.5 w-2 rounded-sm', tuboColor(proximaColeta.tubo))} />{tuboNome(proximaColeta.tubo)}
                    </span>
                    {proximaColeta.exames?.tipo_exame && <span>{proximaColeta.exames.tipo_exame}</span>}
                    <span>{setorNome(proximaColeta)}</span>
                    {proximaColeta.jejum_necessario && <span className="inline-flex items-center gap-1"><Droplets aria-hidden="true" className="h-3 w-3" />Jejum {proximaColeta.jejum_horas ?? '?'}h</span>}
                    {desde && (
                      <span className={cn('inline-flex items-center gap-1 font-medium', waitTimeColor(desde, now))}>
                        <Timer aria-hidden="true" className="h-3 w-3" /> aguardando há {waitTimeLabel(desde, now)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {whatsapp && (
                  <Button aria-label={`Chamar ${nomePaciente(proximaColeta.pacientes)} no WhatsApp`} asChild variant="outline" size="icon" className="h-10 w-10 rounded-full border-primary/30 text-primary hover:bg-primary/10 hover:text-primary">
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Chamar ${nomePaciente(proximaColeta.pacientes)} no WhatsApp`} title="Chamar no WhatsApp">
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                {proximaColeta.paciente_id && (
                  <Button asChild variant="outline" className="h-10 gap-1.5 rounded-full">
                    <Link to={`/pacientes?paciente=${encodeURIComponent(proximaColeta.paciente_id)}`}>
                      <User aria-hidden="true" className="h-4 w-4" /> Paciente
                    </Link>
                  </Button>
                )}
                <Button variant="outline" className="h-10 gap-1.5 rounded-full" onClick={() => setDetailId(proximaColeta.id)}>
                  <Eye aria-hidden="true" className="h-4 w-4" /> Detalhes
                </Button>
                <Button
                  className="h-10 gap-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={processando || bulkProcessing}
                  onClick={() => handleColetar(proximaColeta.id)}
                >
                  {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
                  {processando ? 'Salvando…' : 'Coletar agora'}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Filtros */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Buscar por paciente, CPF, telefone, código ou exame" className="h-10 rounded-full pl-9 focus-visible:ring-primary" placeholder="Nome, CPF, telefone, código ou exame..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={tuboFiltro} onValueChange={setTuboFiltro}>
            <SelectTrigger aria-label="Filtrar por tubo" className="h-10 w-full rounded-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos os tubos</SelectItem>
              {TUBOS.map(t => (
                <SelectItem key={t.label} value={t.label}>
                  <span className="flex items-center gap-2"><span aria-hidden="true" className={cn('h-3 w-2 rounded-sm', t.color)} />{t.label} · {t.volume}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected.size > 0 && (
            <Badge variant="outline" className="h-8 gap-1 rounded-full border-border text-xs text-primary">
              {selected.size} selecionado(s)
              <button type="button" aria-label="Limpar seleção de coletas" className="ml-1 hover:text-destructive" onClick={() => setSelected(new Set())}>✕</button>
            </Badge>
          )}
          {temFiltro && (
            <Button variant="ghost" size="sm" className="h-10 gap-1.5 rounded-full text-muted-foreground" onClick={limparFiltros}>
              <X aria-hidden="true" className="h-3.5 w-3.5" /> Limpar filtros
            </Button>
          )}
          <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
            {filtrado.length} de {itens.length} coleta{itens.length === 1 ? '' : 's'}
          </p>
        </div>

        {setores.length > 0 && (
          <div role="group" aria-label="Filtrar por sala ou setor" className="flex flex-wrap items-center gap-1.5">
            {[{ chave: 'todos', nome: 'Todas as salas', total: itens.length, pendentes: aguardandoTotal }, ...setores].map(setor => {
              const ativo = setorFiltro === setor.chave;
              return (
                <button
                  key={setor.chave}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setSetorFiltro(ativo ? 'todos' : setor.chave)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    ativo ? 'border-transparent bg-primary text-primary-foreground shadow-sm' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  <DoorOpen aria-hidden="true" className="h-3 w-3" />
                  {setor.nome}
                  <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', ativo ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground')}>
                    {setor.pendentes > 0 ? `${setor.pendentes}/${setor.total}` : setor.total}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16" role="status" aria-label="Carregando coletas"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-6">
          {grupos.map(grupo => {
            const pendentesGrupo = grupo.itens.filter(aguardaColeta).length;
            const idGrupo = `coletas-setor-${grupo.chave.replace(/[^a-zA-Z0-9_-]/g, '')}`;
            return (
              <section key={grupo.chave} aria-labelledby={idGrupo} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground">
                    <DoorOpen className="h-4 w-4" />
                  </span>
                  <h2 id={idGrupo} className="text-base font-semibold text-foreground">{grupo.nome}</h2>
                  <Badge variant="outline" className="h-5 rounded-full border-border bg-white text-xs tabular-nums text-primary">{grupo.itens.length}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {pendentesGrupo > 0 ? `${pendentesGrupo} aguardando coleta` : 'nenhuma pendente'}
                  </span>
                </div>
                <Card className="rounded-2xl border-border/60 shadow-xs">
                  <CardContent className="p-3">
                    <div className="overflow-x-auto overflow-y-hidden rounded-xl border border-border/60">
                      <table className="w-full text-sm">
                        <TableHead items={grupo.itens} label={grupo.nome.toLowerCase()} />
                        <tbody>{grupo.itens.map((item, idx) => <ColetaRow key={item.id} item={item} idx={idx} showActions={item.status !== 'rejeitada'} />)}</tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </section>
            );
          })}

          {filtrado.length === 0 && !loading && (
            <Card className="rounded-2xl border-border/60 shadow-xs">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <span aria-hidden="true" className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
                  <Beaker className="h-7 w-7" />
                </span>
                <p className="font-medium text-foreground">
                  {itens.length === 0
                    ? 'Não há coletas nesta fila no momento.'
                    : 'Nenhuma coleta corresponde à busca e aos filtros selecionados.'}
                </p>
                <p className="mt-1 text-sm">
                  {itens.length === 0
                    ? 'Novas solicitações de exame aparecem aqui automaticamente. Registre uma coleta no painel do laboratório.'
                    : 'Limpe a busca, o tubo, a sala ou o indicador para ver todas as coletas.'}
                </p>
                {itens.length > 0 && temFiltro ? (
                  <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={limparFiltros}>
                    Limpar filtros
                  </Button>
                ) : itens.length === 0 ? (
                  <Button asChild size="sm" className="mt-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
                    <Link to="/laboratorio">Abrir painel do laboratório</Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>
      )}

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
