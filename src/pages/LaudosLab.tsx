import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, Eye, CheckCircle2, AlertCircle, Loader2, RefreshCw,
  Search, AlertTriangle, Clock, Download, Printer, Shield, XCircle,
  User, Filter, ChevronDown, ChevronUp, Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { notificarResultadoLiberado } from '@/lib/notificarResultado';
import { toast } from 'sonner';
import { format, formatDistanceToNow, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { gerarLaudoPDF, downloadLaudoPDF, LaudoData } from '@/lib/pdfGenerator';

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };
const fadeUp = { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

// ─── Laudo Detail Modal ────────────────────────────────────
function LaudoDetalheModal({ coletaId, onClose, onUpdate }: {
  coletaId: string | null; onClose: () => void; onUpdate: () => void;
}) {
  const [coleta, setColeta] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [observacaoLaudo, setObservacaoLaudo] = useState('');
  const { user } = useSupabaseAuth();

  const fetchData = useCallback(async () => {
    if (!coletaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('coletas_laboratorio')
      .select(`
        id, codigo_amostra, status, created_at, observacoes, tipo_amostra, tubo, urgente,
        numero_guia, material,
        pacientes(nome, cpf, data_nascimento, sexo),
        medicos(nome, crm),
        convenios(nome),
        resultados_laboratorio(id, parametro, resultado, unidade,
          valor_referencia_min, valor_referencia_max, valor_referencia_texto,
          liberado, data_liberacao, metodo, exames(tipo_exame))
      `)
      .eq('id', coletaId)
      .maybeSingle();
    if (error) toast.error('Erro ao carregar dados da coleta.');
    setColeta(data);
    setLoading(false);
  }, [coletaId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLiberarResultado = async (resultadoId: string) => {
    try {
      const { error } = await supabase
        .from('resultados_laboratorio')
        .update({ liberado: true, data_liberacao: new Date().toISOString() })
        .eq('id', resultadoId);
      if (error) throw error;

      const notificado = await notificarResultadoLiberado(resultadoId);

      toast.success(notificado ? 'Resultado liberado e paciente notificado!' : 'Resultado liberado (notificação será reenviada)');
      await fetchData();
      onUpdate();
    } catch (err: any) {
      console.error('handleLiberarResultado error:', err);
      toast.error('Erro ao liberar: ' + (err?.message || 'Erro desconhecido'));
    }
  };

  const handleLiberarTodos = async () => {
    if (!coleta?.resultados_laboratorio?.length) return;
    const pendentes = coleta.resultados_laboratorio.filter((r: any) => !r.liberado);
    if (pendentes.length === 0) { toast.info('Todos já liberados'); return; }
    try {
      let notificacoesFalhadas = 0;
      const liberados: string[] = [];

      for (const r of pendentes) {
        // O erro do update era ignorado: um resultado que falhava ao liberar
        // ainda entrava na contagem final e o paciente era "notificado" de algo
        // que continuava pendente.
        const { error: upErr } = await supabase.from('resultados_laboratorio')
          .update({ liberado: true, data_liberacao: new Date().toISOString() })
          .eq('id', r.id);
        if (upErr) {
          console.error('Falha ao liberar resultado', r.id, upErr);
          continue;
        }
        liberados.push(r.id);

        if (!(await notificarResultadoLiberado(r.id))) notificacoesFalhadas++;
      }

      if (liberados.length === 0) {
        toast.error('Nenhum resultado pôde ser liberado.');
        return;
      }

      // A coleta só é dada como liberada se TODOS os pendentes saíram.
      if (liberados.length === pendentes.length) {
        const { error: colErr } = await supabase.from('coletas_laboratorio')
          .update({ status: 'liberado' }).eq('id', coletaId!);
        if (colErr) console.error('Falha ao atualizar status da coleta', colErr);
      }

      const naoLiberados = pendentes.length - liberados.length;
      const partes = [`${liberados.length} de ${pendentes.length} resultado(s) liberado(s)`];
      if (naoLiberados > 0) partes.push(`${naoLiberados} falhou(aram)`);
      if (notificacoesFalhadas > 0) partes.push(`${notificacoesFalhadas} notificação(ões) na fila de reenvio`);
      const msg = partes.join(' · ');

      if (naoLiberados > 0) toast.warning(msg);
      else toast.success(msg);
      await fetchData();
      onUpdate();
    } catch (err: any) {
      console.error('handleLiberarTodos error:', err);
      toast.error('Erro ao liberar em lote: ' + (err?.message || 'Erro desconhecido'));
    }
  };

  const handleValidarColeta = async () => {
    try {
      const { error } = await supabase.from('coletas_laboratorio')
        .update({ status: 'validado' }).eq('id', coletaId!);
      if (error) throw error;
      toast.success('Coleta validada!');
      await fetchData();
      onUpdate();
    } catch {
      toast.error('Erro ao validar.');
    }
  };

  const buildLaudoData = (): LaudoData | null => {
    if (!coleta) return null;

    return {
      codigoAmostra: coleta.codigo_amostra,
      pacienteNome: coleta.pacientes?.nome || '—',
      pacienteCpf: coleta.pacientes?.cpf,
      pacienteDataNascimento: coleta.pacientes?.data_nascimento,
      pacienteSexo: coleta.pacientes?.sexo,
      medicoNome: coleta.medicos?.nome,
      medicoCrm: coleta.medicos?.crm,
      dataColeta: coleta.created_at ? format(new Date(coleta.created_at), "dd/MM/yyyy HH:mm:ss") : format(new Date(), "dd/MM/yyyy HH:mm:ss"),
      tipoAmostra: coleta.tipo_amostra,
      tubo: coleta.tubo,
      urgente: coleta.urgente,
      observacoes: observacaoLaudo || undefined,
      requisicao: (coleta as any).numero_guia || coleta.codigo_amostra,
      convenioNome: (coleta as any).convenios?.nome,
      resultados: (coleta.resultados_laboratorio || []).map((r: any) => ({
        parametro: r.parametro,
        resultado: r.resultado,
        unidade: r.unidade,
        valorReferenciaMin: r.valor_referencia_min,
        valorReferenciaMax: r.valor_referencia_max,
        valorReferenciaTexto: r.valor_referencia_texto,
        metodo: r.metodo,
        material: (coleta as any).material || coleta.tipo_amostra,
        tipoExame: r.exames?.tipo_exame,
        liberado: r.liberado,
        dataLiberacao: r.data_liberacao,
      })),
    };
  };

  const handlePrintLaudo = async () => {
    try {
      const laudoData = buildLaudoData();
      if (!laudoData) return;
      await gerarLaudoPDF(laudoData);
    } catch (err: any) {
      toast.error('Erro ao imprimir laudo: ' + (err?.message || 'Erro desconhecido'));
    }
  };

  const handleDownloadLaudo = async () => {
    try {
      const laudoData = buildLaudoData();
      if (!laudoData) return;
      await downloadLaudoPDF(laudoData);
    } catch (err: any) {
      toast.error('Erro ao baixar laudo: ' + (err?.message || 'Erro desconhecido'));
    }
  };

  const totalResults = coleta?.resultados_laboratorio?.length || 0;
  const liberados = coleta?.resultados_laboratorio?.filter((r: any) => r.liberado).length || 0;
  const pendentes = totalResults - liberados;

  return (
    <Dialog open={!!coletaId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Laudo — {coleta?.codigo_amostra ?? '...'}
            {coleta?.urgente && <Badge variant="destructive" className="text-[10px]">Urgente</Badge>}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : coleta ? (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Patient info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-xl border p-4 bg-muted/20">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Paciente</p>
                <p className="font-semibold">{coleta.pacientes?.nome ?? '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">CPF</p>
                <p className="font-medium">{coleta.pacientes?.cpf ?? '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Código</p>
                <p className="font-medium font-mono">{coleta.codigo_amostra ?? '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Entrada</p>
                <p className="font-medium">
                  {coleta.created_at ? format(new Date(coleta.created_at), "dd/MM/yyyy HH:mm") : '—'}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/10">
              <Activity className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span>{liberados}/{totalResults} liberado(s)</span>
                  <span className="font-semibold">{totalResults > 0 ? Math.round((liberados / totalResults) * 100) : 0}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${totalResults > 0 ? (liberados / totalResults) * 100 : 0}%` }} />
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="space-y-2">
              {(coleta.resultados_laboratorio ?? []).map((res: any) => {
                const numResult = parseFloat(res.resultado);
                const isAltered = !isNaN(numResult) && (
                  (res.valor_referencia_min != null && numResult < res.valor_referencia_min) ||
                  (res.valor_referencia_max != null && numResult > res.valor_referencia_max)
                );
                return (
                  <div key={res.id} className={cn(
                    'rounded-lg border p-3 space-y-1',
                    res.liberado ? 'border-success/30 bg-success/5' : '',
                    isAltered && !res.liberado ? 'border-destructive/30 bg-destructive/5' : '',
                  )}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{res.parametro ?? '—'}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {res.exames?.tipo_exame ?? '—'}{res.metodo ? ` · ${res.metodo}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isAltered && <Badge variant="destructive" className="text-[10px] gap-1"><AlertTriangle className="h-2.5 w-2.5" />Alterado</Badge>}
                        {res.liberado ? (
                          <Badge className="bg-success/10 text-success border-success/20 gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Liberado
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>
                        )}
                      </div>
                    </div>
                    {res.resultado && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Resultado</p>
                          <p className={cn('font-bold', isAltered ? 'text-destructive' : 'text-primary')}>
                            {res.resultado} {res.unidade ?? ''}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Referência</p>
                          <p className="font-medium">
                            {res.valor_referencia_texto || `${res.valor_referencia_min ?? '—'} - ${res.valor_referencia_max ?? '—'}`}
                          </p>
                        </div>
                        {res.data_liberacao && (
                          <div>
                            <p className="text-[11px] text-muted-foreground">Liberado em</p>
                            <p className="font-medium text-xs">{format(new Date(res.data_liberacao), "dd/MM HH:mm")}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {!res.liberado && (
                      <Button size="sm" className="h-7 text-xs gap-1 mt-1" onClick={() => handleLiberarResultado(res.id)}>
                        <CheckCircle2 className="h-3 w-3" /> Liberar
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Observations */}
            <div className="space-y-1.5">
              <Label className="text-xs">Observações do Laudo</Label>
              <Textarea value={observacaoLaudo} onChange={e => setObservacaoLaudo(e.target.value)}
                placeholder="Observações técnicas para o laudo impresso..." rows={2} />
            </div>
          </div>
        ) : null}

        {/* Footer actions */}
        {coleta && (
          <DialogFooter className="border-t pt-3 gap-2 flex-wrap">
            {coleta.status !== 'validado' && coleta.status !== 'liberado' && (
              <Button variant="outline" className="gap-1" onClick={handleValidarColeta}>
                <Shield className="h-4 w-4" /> Validar Coleta
              </Button>
            )}
            {pendentes > 0 && (
              <Button variant="default" className="gap-1" onClick={handleLiberarTodos}>
                <CheckCircle2 className="h-4 w-4" /> Liberar Todos ({pendentes})
              </Button>
            )}
            <Button variant="outline" className="gap-1" onClick={handleDownloadLaudo}>
              <Download className="h-4 w-4" /> Baixar PDF
            </Button>
            <Button variant="outline" className="gap-1" onClick={handlePrintLaudo}>
              <Printer className="h-4 w-4" /> Imprimir Laudo
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function LaudosLab() {
  const [coletas, setColetas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [viewingId, setViewingId] = useState<string | null>(null);

  const fetchLaudos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('coletas_laboratorio')
      .select(`
        id, codigo_amostra, status, created_at, urgente, tipo_amostra, tubo,
        pacientes(nome, cpf),
        medicos(nome, crm),
        resultados_laboratorio(id, liberado, parametro, resultado, unidade,
          valor_referencia_min, valor_referencia_max, exames(tipo_exame))
      `)
      .order('created_at', { ascending: true });

    if (error) toast.error('Erro ao carregar laudos');
    else {
      const comResultados = (data ?? []).filter((c: any) =>
        (c.resultados_laboratorio ?? []).length > 0
      );
      setColetas(comResultados);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLaudos();
    const channel = supabase.channel('laudos-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resultados_laboratorio' }, fetchLaudos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coletas_laboratorio' }, fetchLaudos)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchLaudos]);

  const getExamesLiberados = (c: any) =>
    (c.resultados_laboratorio ?? []).filter((r: any) => r.liberado === true);
  const getExamesPendentes = (c: any) =>
    (c.resultados_laboratorio ?? []).filter((r: any) => r.liberado !== true);
  const hasAlterado = (c: any) =>
    (c.resultados_laboratorio ?? []).some((r: any) => {
      const num = parseFloat(r.resultado);
      if (isNaN(num)) return false;
      return (r.valor_referencia_min != null && num < r.valor_referencia_min) ||
             (r.valor_referencia_max != null && num > r.valor_referencia_max);
    });

  const filtradas = useMemo(() => {
    return coletas.filter(c => {
      if (search.trim()) {
        const q = normalize(search.trim());
        const nomes = (c.resultados_laboratorio ?? []).map((r: any) => normalize(r.parametro ?? ''));
        if (
          !normalize(c.pacientes?.nome ?? '').includes(q) &&
          !normalize(c.pacientes?.cpf ?? '').includes(q) &&
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
      return true;
    });
  }, [coletas, search, statusFilter]);

  const totalLiberados = coletas.filter(c => getExamesLiberados(c).length > 0 && getExamesPendentes(c).length === 0).length;
  const totalParciais = coletas.filter(c => getExamesLiberados(c).length > 0 && getExamesPendentes(c).length > 0).length;
  const totalPendentes = coletas.filter(c => getExamesPendentes(c).length > 0 && getExamesLiberados(c).length === 0).length;
  const totalAlterados = coletas.filter(c => hasAlterado(c)).length;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Laudos Laboratoriais
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Validação e liberação de resultados · {coletas.length} laudo(s)
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={fetchLaudos}>
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {[
          { label: 'Total', value: coletas.length, icon: FileText, color: 'text-primary', filter: 'todos' },
          { label: 'Pendentes', value: totalPendentes, icon: Clock, color: 'text-warning', filter: 'pendente' },
          { label: 'Parciais', value: totalParciais, icon: AlertCircle, color: 'text-orange-500', filter: 'parcial' },
          { label: 'Liberados', value: totalLiberados, icon: CheckCircle2, color: 'text-green-500', filter: 'liberado' },
          { label: 'Alterados', value: totalAlterados, icon: AlertTriangle, color: 'text-destructive', filter: 'alterado' },
        ].map(s => (
          <Card key={s.label} className={cn(
            'cursor-pointer hover:shadow-sm transition-all',
            statusFilter === s.filter && 'ring-2 ring-primary'
          )} onClick={() => setStatusFilter(statusFilter === s.filter ? 'todos' : s.filter)}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <s.icon className={cn('h-5 w-5 shrink-0', s.color)} />
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Nome, CPF, código ou exame..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : filtradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground font-medium">Nenhum laudo encontrado</p>
            </div>
          ) : (
            <motion.table variants={stagger} initial="hidden" animate="visible" className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Código</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Paciente</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Exames</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Progresso</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Entrada</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Ação</th>
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
                  return (
                    <motion.tr key={c.id} variants={fadeUp}
                      className={cn(
                        'border-b border-border/50 last:border-0 transition-colors hover:bg-muted/20',
                        todoLiberado && 'opacity-60 hover:opacity-100',
                        c.urgente && 'bg-destructive/5',
                      )}>
                      <td className="px-4 py-2.5 text-xs font-bold text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-primary font-semibold">{c.codigo_amostra ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {c.urgente && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                          <div>
                            <p className="font-medium">{c.pacientes?.nome ?? '—'}</p>
                            <p className="text-[11px] text-muted-foreground">{c.pacientes?.cpf ?? ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {liberados.slice(0, 2).map((r: any) => (
                            <Badge key={r.id} variant="secondary" className="text-[10px]">{r.parametro ?? '—'}</Badge>
                          ))}
                          {total > 2 && <span className="text-[10px] text-muted-foreground">+{total - 2}</span>}
                          {alterado && <Badge variant="destructive" className="text-[10px] gap-0.5"><AlertTriangle className="h-2.5 w-2.5" />Alt.</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${total > 0 ? (liberados.length / total) * 100 : 0}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums">{liberados.length}/{total}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {todoLiberado ? (
                          <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">Liberado</Badge>
                        ) : parcial ? (
                          <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px]">Parcial</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Pendente</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">
                        {c.created_at ? formatDistanceToNow(new Date(c.created_at), { locale: ptBR, addSuffix: true }) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setViewingId(c.id)}>
                          <Eye className="h-3 w-3" /> Ver Laudo
                        </Button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </motion.table>
          )}
        </CardContent>
      </Card>

      <LaudoDetalheModal coletaId={viewingId} onClose={() => setViewingId(null)} onUpdate={fetchLaudos} />
    </div>
  );
}
