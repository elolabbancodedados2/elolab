import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText, Pill, TestTube, FileCheck, ArrowRight, Calendar, Clock,
  DollarSign, CalendarCheck, Paperclip, Activity, RefreshCw, AlertCircle, Search,
  Download, Sparkles, Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { parseDateOnly } from '@/lib/dateOnly';

interface PatientTimelineProps {
  pacienteId: string;
  className?: string;
  maxItems?: number;
}

type EventType =
  | 'prontuario' | 'prescricao' | 'exame' | 'atestado' | 'encaminhamento'
  | 'agendamento' | 'pagamento' | 'triagem' | 'anexo' | 'retorno' | 'comorbidade';

interface TimelineEvent {
  id: string;
  type: EventType;
  date: Date;
  title: string;
  description?: string;
  status?: string;
  medicoNome?: string;
  valor?: number;
}

const TYPE_META: Record<EventType, { label: string; color: string; icon: JSX.Element }> = {
  prontuario:      { label: 'Consulta',       color: 'bg-blue-500',    icon: <FileText className="h-4 w-4" /> },
  prescricao:      { label: 'Prescrição',     color: 'bg-green-500',   icon: <Pill className="h-4 w-4" /> },
  exame:           { label: 'Exame',          color: 'bg-purple-500',  icon: <TestTube className="h-4 w-4" /> },
  atestado:        { label: 'Atestado',       color: 'bg-amber-500',   icon: <FileCheck className="h-4 w-4" /> },
  encaminhamento:  { label: 'Encaminhamento', color: 'bg-orange-500',  icon: <ArrowRight className="h-4 w-4" /> },
  agendamento:     { label: 'Agendamento',    color: 'bg-sky-500',     icon: <CalendarCheck className="h-4 w-4" /> },
  pagamento:       { label: 'Pagamento',      color: 'bg-emerald-600', icon: <DollarSign className="h-4 w-4" /> },
  triagem:         { label: 'Triagem',        color: 'bg-rose-500',    icon: <Activity className="h-4 w-4" /> },
  anexo:           { label: 'Anexo',          color: 'bg-slate-500',   icon: <Paperclip className="h-4 w-4" /> },
  retorno:         { label: 'Retorno',        color: 'bg-indigo-500',  icon: <RefreshCw className="h-4 w-4" /> },
  comorbidade:     { label: 'Comorbidade',    color: 'bg-red-500',     icon: <AlertCircle className="h-4 w-4" /> },
};

export function PatientTimeline({ pacienteId, className, maxItems = 50 }: PatientTimelineProps) {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<EventType | 'todos'>('todos');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data: events, isLoading } = useQuery({
    queryKey: ['patient-timeline', pacienteId],
    queryFn: async () => {
      const allEvents: TimelineEvent[] = [];
      const lim = Math.max(maxItems, 100);

      // Fetch prontuários
      const { data: prontuarios } = await supabase
        .from('prontuarios')
        .select('id, data, queixa_principal, hipotese_diagnostica, conduta, medicos(nome)')
        .eq('paciente_id', pacienteId)
        .order('data', { ascending: false })
        .limit(lim);

      prontuarios?.forEach(p => {
        allEvents.push({
          id: p.id,
          type: 'prontuario',
          date: parseDateOnly(p.data)!,
          title: 'Consulta Médica',
          description: p.queixa_principal || p.hipotese_diagnostica || p.conduta || 'Atendimento realizado',
          medicoNome: (p.medicos as any)?.nome,
        });
      });

      // Fetch prescrições
      const { data: prescricoes } = await supabase
        .from('prescricoes')
        .select('id, data_emissao, medicamento, dosagem, posologia, tipo, medicos(nome)')
        .eq('paciente_id', pacienteId)
        .order('data_emissao', { ascending: false })
        .limit(lim);

      prescricoes?.forEach(p => {
        allEvents.push({
          id: p.id,
          type: 'prescricao',
          date: new Date(p.data_emissao || new Date()),
          title: 'Prescrição',
          description: `${p.medicamento}${p.dosagem ? ` - ${p.dosagem}` : ''}${p.posologia ? ` (${p.posologia})` : ''}`,
          status: p.tipo || 'simples',
          medicoNome: (p.medicos as any)?.nome,
        });
      });

      // Fetch exames
      const { data: exames } = await supabase
        .from('exames')
        .select('id, data_solicitacao, data_realizacao, tipo_exame, status, resultado, medicos(nome)')
        .eq('paciente_id', pacienteId)
        .order('data_solicitacao', { ascending: false })
        .limit(lim);

      exames?.forEach(e => {
        allEvents.push({
          id: e.id,
          type: 'exame',
          date: new Date(e.data_realizacao || e.data_solicitacao || new Date()),
          title: 'Exame',
          description: `${e.tipo_exame}${e.resultado ? ' • Resultado disponível' : ''}`,
          status: e.status || 'solicitado',
          medicoNome: (e.medicos as any)?.nome,
        });
      });

      // Fetch atestados
      const { data: atestados } = await supabase
        .from('atestados')
        .select('id, data_emissao, tipo, dias, motivo, medicos(nome)')
        .eq('paciente_id', pacienteId)
        .order('data_emissao', { ascending: false })
        .limit(lim);

      atestados?.forEach(a => {
        allEvents.push({
          id: a.id,
          type: 'atestado',
          date: new Date(a.data_emissao || new Date()),
          title: 'Atestado',
          description: a.dias ? `${a.dias} dia(s) - ${a.motivo || a.tipo}` : a.motivo || a.tipo || 'Emitido',
          medicoNome: (a.medicos as any)?.nome,
        });
      });

      // Fetch encaminhamentos
      const { data: encaminhamentos } = await supabase
        .from('encaminhamentos')
        .select('id, data_encaminhamento, especialidade_destino, motivo, status, medicos(nome)')
        .eq('paciente_id', pacienteId)
        .order('data_encaminhamento', { ascending: false })
        .limit(lim);

      encaminhamentos?.forEach(e => {
        allEvents.push({
          id: e.id,
          type: 'encaminhamento',
          date: new Date(e.data_encaminhamento || new Date()),
          title: 'Encaminhamento',
          description: `${e.especialidade_destino} - ${e.motivo}`,
          status: e.status || 'pendente',
          medicoNome: (e.medicos as any)?.nome,
        });
      });

      // Fetch agendamentos
      const { data: agendamentos } = await (supabase as any)
        .from('agendamentos')
        .select('id, data, hora_inicio, tipo, status, observacoes, medicos(nome)')
        .eq('paciente_id', pacienteId)
        .order('data', { ascending: false })
        .limit(lim);

      agendamentos?.forEach((a: any) => {
        if (!a.data) return;
        allEvents.push({
          id: `ag-${a.id}`,
          type: 'agendamento',
          date: new Date(`${a.data}T${a.hora_inicio || '00:00'}`),
          title: `Agendamento - ${a.tipo || 'Consulta'}`,
          description: a.observacoes || `Horário: ${a.hora_inicio || '—'}`,
          status: a.status,
          medicoNome: (a.medicos as any)?.nome,
        });
      });

      // Fetch pagamentos (lançamentos financeiros)
      const { data: lancamentos } = await (supabase as any)
        .from('lancamentos')
        .select('id, tipo, categoria, descricao, valor, data, data_pagamento, status, forma_pagamento')
        .eq('paciente_id', pacienteId)
        .order('data', { ascending: false })
        .limit(lim);

      lancamentos?.forEach((l: any) => {
        const valorFmt = Number(l.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const statusLabel = l.status === 'pago' ? 'pago' : l.status === 'pendente' ? 'pendente' : (l.status || '');
        allEvents.push({
          id: `lan-${l.id}`,
          type: 'pagamento',
          date: new Date(l.data_pagamento || l.data || new Date()),
          title: `${l.tipo === 'receita' ? 'Receita' : 'Despesa'} - ${valorFmt}`,
          description: `${l.descricao || l.categoria || '-'}${l.forma_pagamento ? ` • ${l.forma_pagamento}` : ''}`,
          status: statusLabel,
          valor: Number(l.valor || 0),
        });
      });

      // Fetch triagens
      const { data: triagens } = await (supabase as any)
        .from('triagens')
        // As colunas são `saturacao` e `queixa_principal`. Com os nomes errados
        // o PostgREST rejeitava a consulta inteira e a triagem nunca aparecia
        // na linha do tempo.
        .select('id, data_hora, pressao_arterial, frequencia_cardiaca, temperatura, peso, altura, saturacao, queixa_principal')
        .eq('paciente_id', pacienteId)
        .order('data_hora', { ascending: false })
        .limit(lim);

      triagens?.forEach((t: any) => {
        const vitals = [
          t.pressao_arterial && `PA ${t.pressao_arterial}`,
          t.frequencia_cardiaca && `FC ${t.frequencia_cardiaca}`,
          t.temperatura && `T ${t.temperatura}°C`,
          t.saturacao && `SpO₂ ${t.saturacao}%`,
          t.peso && `${t.peso}kg`,
        ].filter(Boolean).join(' • ');
        allEvents.push({
          id: `tr-${t.id}`,
          type: 'triagem',
          date: new Date(t.data_hora),
          title: 'Triagem / Sinais Vitais',
          description: vitals || t.queixa_principal || 'Triagem realizada',
        });
      });

      // Fetch anexos
      const { data: anexos } = await (supabase as any)
        .from('anexos_prontuario')
        // A coluna é `tipo_arquivo`.
        .select('id, nome_arquivo, tipo_arquivo, descricao, created_at, prontuarios!inner(paciente_id)')
        .eq('prontuarios.paciente_id', pacienteId)
        .order('created_at', { ascending: false })
        .limit(lim);

      anexos?.forEach((a: any) => {
        allEvents.push({
          id: `anx-${a.id}`,
          type: 'anexo',
          date: new Date(a.created_at),
          title: a.nome_arquivo || 'Anexo',
          description: a.descricao || a.tipo_arquivo || 'Documento anexado',
        });
      });

      // Fetch retornos
      const { data: retornos } = await (supabase as any)
        .from('retornos')
        // A coluna em `retornos` é `data_retorno_prevista`. `data_retorno`
        // pertence a `retornos_agendados`, que é outra tabela.
        .select('id, data_retorno_prevista, motivo, status, medicos(nome)')
        .eq('paciente_id', pacienteId)
        .order('data_retorno_prevista', { ascending: false })
        .limit(lim);

      retornos?.forEach((r: any) => {
        allEvents.push({
          id: `ret-${r.id}`,
          type: 'retorno',
          date: parseDateOnly(r.data_retorno_prevista)!,
          title: 'Retorno agendado',
          description: r.motivo || 'Retorno do paciente',
          status: r.status,
          medicoNome: (r.medicos as any)?.nome,
        });
      });

      // Fetch comorbidades
      const { data: comorb } = await (supabase as any)
        .from('paciente_comorbidades')
        .select('id, codigo_cid, descricao, data_diagnostico, ativo')
        .eq('paciente_id', pacienteId)
        .order('data_diagnostico', { ascending: false })
        .limit(lim);

      comorb?.forEach((c: any) => {
        allEvents.push({
          id: `co-${c.id}`,
          type: 'comorbidade',
          date: new Date(c.data_diagnostico || new Date()),
          title: `${c.codigo_cid || 'CID'} - ${c.descricao}`,
          description: c.ativo ? 'Condição ativa' : 'Condição inativa',
        });
      });

      return allEvents.sort((a, b) => b.date.getTime() - a.date.getTime());
    },
    enabled: !!pacienteId,
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (events || []).forEach(e => { c[e.type] = (c[e.type] || 0) + 1; });
    return c;
  }, [events]);

  const filtered = useMemo(() => {
    if (!events) return [];
    const term = search.trim().toLowerCase();
    return events.filter(e => {
      if (activeFilter !== 'todos' && e.type !== activeFilter) return false;
      if (!term) return true;
      return (
        e.title.toLowerCase().includes(term) ||
        (e.description || '').toLowerCase().includes(term) ||
        (e.medicoNome || '').toLowerCase().includes(term) ||
        (e.status || '').toLowerCase().includes(term)
      );
    });
  }, [events, search, activeFilter]);

  const handleExportPDF = async () => {
    if (!events || events.length === 0) {
      toast.error('Nenhum dado para exportar');
      return;
    }
    setPdfLoading(true);
    try {
      const { data: pac } = await supabase
        .from('pacientes')
        .select('nome, cpf, data_nascimento, telefone, email, sexo, alergias')
        .eq('id', pacienteId)
        .maybeSingle();

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Prontuário Completo do Paciente', 14, 18);
      doc.setFontSize(10);
      doc.text(`Paciente: ${pac?.nome || '—'}`, 14, 28);
      if (pac?.cpf) doc.text(`CPF: ${pac.cpf}`, 14, 34);
      if (pac?.data_nascimento) doc.text(`Nascimento: ${format(parseDateOnly(pac.data_nascimento)!, 'dd/MM/yyyy')}`, 14, 40);
      if (pac?.telefone) doc.text(`Telefone: ${pac.telefone}`, 100, 34);
      if (pac?.email) doc.text(`E-mail: ${pac.email}`, 100, 40);
      if (pac?.alergias) doc.text(`Alergias: ${pac.alergias}`, 14, 46);
      doc.text(`Emitido em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 14, 52);

      const rows = events.map(e => [
        format(e.date, 'dd/MM/yyyy HH:mm', { locale: ptBR }),
        TYPE_META[e.type].label,
        e.title,
        [e.description, e.medicoNome && `Dr(a). ${e.medicoNome}`, e.status].filter(Boolean).join(' | '),
      ]);

      autoTable(doc, {
        head: [['Data', 'Tipo', 'Título', 'Detalhes']],
        body: rows,
        startY: 58,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [16, 185, 129] },
        columnStyles: { 3: { cellWidth: 80 } },
      });

      doc.save(`prontuario-${pac?.nome?.replace(/\s+/g, '_') || pacienteId}.pdf`);
      toast.success('PDF gerado com sucesso');
    } catch (err: any) {
      toast.error('Falha ao gerar PDF: ' + err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleAISummary = async () => {
    setAiLoading(true);
    setAiOpen(true);
    setAiSummary(null);
    try {
      const { data, error } = await supabase.functions.invoke('patient-clinical-summary', {
        body: { paciente_id: pacienteId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAiSummary(data?.summary || 'Sem resumo gerado.');
    } catch (err: any) {
      toast.error('Falha ao gerar resumo: ' + err.message);
      setAiSummary('Erro ao gerar resumo clínico.');
    } finally {
      setAiLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Histórico Completo do Paciente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Histórico Completo do Paciente
          <Badge variant="outline" className="ml-auto">
            {events?.length || 0} eventos
          </Badge>
        </CardTitle>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleExportPDF} disabled={pdfLoading}>
              {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Exportar PDF
            </Button>
            <Button size="sm" variant="default" onClick={handleAISummary} disabled={aiLoading}>
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Resumo clínico IA
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título, descrição, médico, status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={activeFilter === 'todos' ? 'default' : 'outline'}
              onClick={() => setActiveFilter('todos')}
            >
              Todos ({events?.length || 0})
            </Button>
            {(Object.keys(TYPE_META) as EventType[]).map(t => (
              counts[t] ? (
                <Button
                  key={t}
                  size="sm"
                  variant={activeFilter === t ? 'default' : 'outline'}
                  onClick={() => setActiveFilter(t)}
                  className="gap-1"
                >
                  {TYPE_META[t].icon}
                  {TYPE_META[t].label} ({counts[t]})
                </Button>
              ) : null
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Nenhum evento encontrado.
          </p>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="relative">
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />
              <div className="space-y-6">
                {filtered.map((event) => {
                  const meta = TYPE_META[event.type];
                  return (
                    <div key={`${event.type}-${event.id}`} className="relative flex gap-4">
                      <div
                        className={cn(
                          'relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-white shrink-0',
                          meta.color
                        )}
                      >
                        {meta.icon}
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="default">{meta.label}</Badge>
                          <span className="text-sm font-semibold">{event.title}</span>
                          {event.status && (
                            <Badge variant="outline" className="text-xs">{event.status}</Badge>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(event.date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                          {event.medicoNome && <span>• Dr(a). {event.medicoNome}</span>}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>

    <Dialog open={aiOpen} onOpenChange={setAiOpen}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Resumo Clínico Inteligente
          </DialogTitle>
        </DialogHeader>
        {aiLoading ? (
          <div className="flex items-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Analisando histórico do paciente...
          </div>
        ) : (
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
            {aiSummary}
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
