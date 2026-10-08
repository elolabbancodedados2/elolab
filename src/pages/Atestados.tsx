import { nomeMedico } from '@/lib/formatters';
import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus, Search, Eye, Printer, FileText, Loader2, Star,
  Clock, Calendar, AlertTriangle, ShieldCheck, Clipboard,
  BadgeCheck, BookOpen, X, FileSignature,
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { useMedicos, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { gerarAtestado, openPDF } from '@/lib/pdfGenerator';
import { Skeleton } from '@/components/ui/skeleton';
import { Cid10Search } from '@/components/clinical';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { ErrorState } from '@/components/ErrorState';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { usePacienteResumo } from '@/hooks/useBuscaPacientes';

interface Atestado {
  id: string;
  tipo: string | null;
  paciente_id: string;
  medico_id: string;
  data_emissao: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  dias: number | null;
  motivo: string | null;
  cid: string | null;
  observacoes: string | null;
  created_at: string | null;
  pacientes?: { nome: string; nome_social?: string | null; cpf?: string | null; telefone?: string | null } | null;
}

interface FormDataType {
  tipo: string;
  paciente_id: string;
  medico_id: string;
  data_emissao: string;
  data_inicio: string;
  data_fim: string;
  dias: number | null;
  cid: string;
  incluirCid: boolean;
  motivo: string;
  observacoes: string;
  finalidade: string;
  hora_inicio: string;
  hora_fim: string;
}

const novoFormulario = (today: string): FormDataType => ({
  tipo: 'comparecimento', paciente_id: '', medico_id: '',
  data_emissao: today,
  data_inicio: today, data_fim: '',
  dias: null, cid: '', incluirCid: false, motivo: '',
  observacoes: '', finalidade: '', hora_inicio: '', hora_fim: '',
});

const TIPOS_ATESTADO = [
  { value: 'comparecimento', label: 'Atestado de Comparecimento', icon: Clock },
  { value: 'afastamento', label: 'Atestado Médico (Afastamento)', icon: Calendar },
  { value: 'aptidao', label: 'Atestado de Aptidão Física', icon: ShieldCheck },
  { value: 'acompanhante', label: 'Declaração de Acompanhante', icon: FileText },
];

const FINALIDADES_APTIDAO = [
  'Apto para prática de atividades físicas moderadas',
  'Apto para prática de atividades físicas intensas',
  'Apto para concurso público',
  'Apto para atividades laborais',
  'Apto para viagem',
];

export default function Atestados() {
  const [today, setToday] = useState(() => todaySaoPauloDateOnly());
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todaySaoPauloDateOnly()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [selectedAtestado, setSelectedAtestado] = useState<Atestado | null>(null);
  const [formData, setFormData] = useState<FormDataType>(() => novoFormulario(today));
  const [isSaving, setIsSaving] = useState(false);
  const saveLock = useRef(false);
  const { profile } = useSupabaseAuth();

  const queryClient = useQueryClient();
  const { currentMedico, medicoId, isMedicoOnly } = useCurrentMedico();
  const atestadosQuery = useSupabaseQuery<Atestado>('atestados', {
    select: '*, pacientes(nome,nome_social,cpf,telefone)',
    orderBy: { column: 'created_at', ascending: false },
    filters: [
      ...(profile?.clinica_id ? [{ column: 'clinica_id', operator: 'eq', value: profile.clinica_id }] : []),
      ...(isMedicoOnly && medicoId ? [{ column: 'medico_id', operator: 'eq', value: medicoId }] : []),
    ],
    enabled: !!profile?.clinica_id && (!isMedicoOnly || !!medicoId),
  });
  const medicosQuery = useMedicos();
  const templatesQuery = useQuery({
    queryKey: ['atestados-templates', profile?.clinica_id, profile?.id],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('templates_atestado')
        .select('*')
        .or(`clinica_id.eq.${profile!.clinica_id},clinica_id.is.null`)
        .order('nome');
      if (error) throw error;
      return (data || []) as Record<string, any>[];
    },
  });
  const atestados = atestadosQuery.data || [];
  const medicos = medicosQuery.data || [];
  const pacienteSelecionadoQuery = usePacienteResumo(formData.paciente_id);
  const pacienteSelecionado = pacienteSelecionadoQuery.data;
  const templates = templatesQuery.data || [];
  const medicosAtivos = medicos.filter(m => m.ativo !== false);
  const medicosDisponiveis = isMedicoOnly && medicoId
    ? medicosAtivos.filter(m => m.id === medicoId)
    : medicosAtivos;

  const isLoading = atestadosQuery.isLoading || medicosQuery.isLoading;

  const filteredAtestados = useMemo(() => {
    return atestados.filter(a => {
      return pacienteCorresponde(a.pacientes || {}, searchTerm);
    });
  }, [atestados, searchTerm]);

  // Auto-calculate end date
  const updateDias = (dias: number) => {
    const dataInicio = formData.data_inicio || formData.data_emissao;
    const dataFim = dataInicio ? format(addDays(new Date(dataInicio + 'T12:00'), dias - 1), 'yyyy-MM-dd') : '';
    setFormData(prev => ({ ...prev, dias, data_fim: dataFim }));
  };

  const updateDataInicio = (value: string) => {
    let dataFim = formData.data_fim;
    if (formData.dias && formData.dias > 0) {
      dataFim = format(addDays(new Date(value + 'T12:00'), formData.dias - 1), 'yyyy-MM-dd');
    }
    setFormData(prev => ({ ...prev, data_inicio: value, data_fim: dataFim }));
  };

  const handleNew = () => {
    if (!medicosDisponiveis.length) {
      toast.error('Não há médicos ativos para emitir atestados.');
      return;
    }
    setSelectedAtestado(null);
    setFormData({ ...novoFormulario(today), medico_id: medicoId || '' });
    setIsFormOpen(true);
  };

  const handleNewWithType = (tipo: string) => {
    if (!medicosDisponiveis.length) {
      toast.error('Não há médicos ativos para emitir atestados.');
      return;
    }
    setSelectedAtestado(null);
    setFormData({ ...novoFormulario(today), tipo, medico_id: medicoId || '' });
    setIsFormOpen(true);
  };

  const handleLoadTemplate = (template: Record<string, any>) => {
    const diasDoTemplate = Number(template.dias_afastamento ?? template.diasAfastamento);
    const diasValidos = Number.isInteger(diasDoTemplate) && diasDoTemplate > 0 ? diasDoTemplate : null;
    setFormData(prev => ({
      ...prev,
      tipo: template.tipo || prev.tipo,
      observacoes: template.conteudo || prev.observacoes,
      dias: diasValidos ?? prev.dias,
      cid: template.cid || prev.cid,
      // Um CID salvo no modelo não substitui a autorização expressa do paciente
      // para esta emissão específica.
      incluirCid: false,
    }));
    if (diasValidos) updateDias(diasValidos);
    setIsTemplateOpen(false);
    toast.success(`Modelo "${template.nome}" carregado.`);
  };

  // Replace template variables
  const processTemplateText = (text: string): string => {
    const paciente = pacienteSelecionado;
    const medico = medicos.find(m => m.id === formData.medico_id);
    return text
      .replace(/\{\{nome_paciente\}\}/gi, paciente?.nome || '_______________')
      .replace(/\{\{cpf_paciente\}\}/gi, paciente?.cpf || '_______________')
      .replace(/\{\{data_emissao\}\}/gi, formData.data_emissao ? format(new Date(formData.data_emissao + 'T12:00'), 'dd/MM/yyyy') : '__/__/____')
      .replace(/\{\{data_atual\}\}/gi, format(parseDateOnly(today)!, 'dd/MM/yyyy'))
      .replace(/\{\{dias\}\}/gi, formData.dias?.toString() || '___')
      .replace(/\{\{data_inicio\}\}/gi, formData.data_inicio ? format(new Date(formData.data_inicio + 'T12:00'), 'dd/MM/yyyy') : '__/__/____')
      .replace(/\{\{data_fim\}\}/gi, formData.data_fim ? format(new Date(formData.data_fim + 'T12:00'), 'dd/MM/yyyy') : '__/__/____')
      .replace(/\{\{hora_inicio\}\}/gi, formData.hora_inicio || '__:__')
      .replace(/\{\{hora_fim\}\}/gi, formData.hora_fim || '__:__')
      .replace(/\{\{medico_nome\}\}/gi, medico?.nome || medico?.crm || '_______________')
      .replace(/\{\{medico_crm\}\}/gi, medico?.crm || '_______________')
      .replace(/\{\{cid\}\}/gi, formData.incluirCid ? formData.cid || '___' : '___');
  };

  const handleSave = async () => {
    if (saveLock.current) return;
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. O atestado não foi salvo.');
      return;
    }
    if (!formData.paciente_id || !formData.medico_id) {
      toast.error('Preencha paciente e médico.');
      return;
    }
    if (pacienteSelecionadoQuery.isFetching) {
      toast.info('Aguarde o carregamento dos dados do paciente.');
      return;
    }
    if (pacienteSelecionadoQuery.isError || !pacienteSelecionado) {
      toast.error('Não foi possível carregar o paciente selecionado.', {
        description: 'Busque o paciente novamente antes de emitir o atestado.',
      });
      return;
    }
    if (formData.tipo === 'afastamento' && (!Number.isInteger(formData.dias) || !formData.dias || formData.dias < 1)) {
      toast.error('Informe a quantidade de dias de afastamento.');
      return;
    }
    if (isMedicoOnly && formData.medico_id !== medicoId) {
      toast.error('Seu perfil só pode emitir documentos em seu próprio nome.');
      return;
    }
    const medicoSelecionado = medicos.find(m => m.id === formData.medico_id);
    if (!medicoSelecionado || medicoSelecionado.ativo === false) {
      toast.error('Médico emissor indisponível', {
        description: 'Selecione um médico ativo da clínica antes de emitir o atestado.',
      });
      return;
    }
    if (formData.tipo === 'aptidao' && (!formData.finalidade || (formData.finalidade === 'custom' && !formData.motivo.trim()))) {
      toast.error('Informe a finalidade do atestado de aptidão.');
      return;
    }
    const isValidDateOnly = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T12:00:00`);
      return !Number.isNaN(date.getTime()) && format(date, 'yyyy-MM-dd') === value;
    };
    const dataEmissaoValida = isValidDateOnly(formData.data_emissao) && formData.data_emissao <= today;
    if (!dataEmissaoValida) {
      toast.error('Informe uma data de emissão válida, igual ou anterior a hoje.');
      return;
    }
    if (formData.tipo === 'afastamento') {
      const inicioValido = isValidDateOnly(formData.data_inicio);
      const fimValido = isValidDateOnly(formData.data_fim);
      if (!inicioValido || !fimValido || formData.data_fim < formData.data_inicio) {
        toast.error('Confira as datas do afastamento.', { description: 'A data final deve ser igual ou posterior à data inicial.' });
        return;
      }
    }
    if (formData.tipo === 'comparecimento' && (!formData.hora_inicio || !formData.hora_fim)) {
      toast.error('Informe o horário de início e fim para atestado de comparecimento.');
      return;
    }
    if (formData.tipo === 'comparecimento' && formData.hora_fim <= formData.hora_inicio) {
      toast.error('O horário final deve ser posterior ao horário inicial.');
      return;
    }

    saveLock.current = true;
    setIsSaving(true);
    try {
      const observacoesProcessadas = processTemplateText(formData.observacoes);

      // Build motivo with extra context
      let motivo = formData.motivo;
      if (formData.tipo === 'comparecimento') {
        motivo = `Esteve presente das ${formData.hora_inicio} às ${formData.hora_fim}. ${motivo}`.trim();
      }
      if (formData.tipo === 'aptidao' && formData.finalidade) {
        const finalidade = formData.finalidade === 'custom' ? formData.motivo.trim() : formData.finalidade;
        motivo = `Finalidade: ${finalidade}.`;
      }

      const { error } = await supabase.from('atestados').insert({
        clinica_id: profile.clinica_id,
        tipo: formData.tipo,
        paciente_id: formData.paciente_id,
        medico_id: formData.medico_id,
        data_emissao: formData.data_emissao,
        data_inicio: formData.tipo === 'afastamento' ? formData.data_inicio : null,
        data_fim: formData.tipo === 'afastamento' ? formData.data_fim : null,
        dias: formData.tipo === 'afastamento' ? formData.dias : null,
        cid: formData.incluirCid ? formData.cid : null,
        motivo,
        observacoes: observacoesProcessadas || null,
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['atestados'] });
      setIsFormOpen(false);
      toast.success('Atestado emitido com sucesso.');
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving atestado:', error);
      toast.error('Erro ao emitir atestado.', { description: mensagemDeErro(error) });
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

  const handleDuplicate = (atestado: Atestado) => {
    const tipo = atestado.tipo || 'comparecimento';
    const motivoOriginal = atestado.motivo || '';
    const comparecimento = tipo === 'comparecimento'
      ? motivoOriginal.match(/^Esteve presente das (\d{2}:\d{2}) às (\d{2}:\d{2})\.\s*(.*)$/i)
      : null;
    const finalidadeAptidao = tipo === 'aptidao'
      ? (motivoOriginal.match(/^Finalidade:\s*(.*?)\.?$/i)?.[1] || motivoOriginal).trim()
      : '';
    const finalidadePredefinida = FINALIDADES_APTIDAO.includes(finalidadeAptidao);
    setSelectedAtestado(null);
    setFormData({
      ...novoFormulario(today),
      tipo,
      paciente_id: atestado.paciente_id,
      medico_id: atestado.medico_id || medicoId || '',
      dias: atestado.dias,
      cid: atestado.cid || '',
      // Duplicar o documento não reaproveita a autorização de CID da emissão anterior.
      incluirCid: false,
      motivo: tipo === 'comparecimento'
        ? comparecimento?.[3] || (comparecimento ? '' : motivoOriginal)
        : tipo === 'aptidao'
          ? (finalidadePredefinida ? '' : finalidadeAptidao)
          : motivoOriginal,
      observacoes: atestado.observacoes || '',
      data_emissao: today,
      data_inicio: today,
      data_fim: '',
      finalidade: tipo === 'aptidao'
        ? (finalidadePredefinida ? finalidadeAptidao : finalidadeAptidao ? 'custom' : '')
        : '',
      hora_inicio: comparecimento?.[1] || '',
      hora_fim: comparecimento?.[2] || '',
    });
    if (atestado.dias && atestado.dias > 0) {
      const dataFim = format(addDays(new Date(`${today}T12:00`), atestado.dias - 1), 'yyyy-MM-dd');
      setFormData(prev => ({ ...prev, data_fim: dataFim }));
    }
    setIsFormOpen(true);
    toast.success('Atestado duplicado — ajuste os dados e emita.');
  };

  const handleView = (atestado: Atestado) => { setSelectedAtestado(atestado); setIsViewOpen(true); };

  const handlePrint = async (atestado: Atestado) => {
    const paciente = atestado.pacientes;
    const medico = medicos.find(m => m.id === atestado.medico_id);
    if (!paciente || !medico) { toast.error('Dados não encontrados.'); return; }
    try {
      const horario = atestado.tipo === 'comparecimento'
        ? atestado.motivo?.match(/das (\d{2}:\d{2}) às (\d{2}:\d{2})/i)
        : null;
      const finalidade = atestado.tipo === 'aptidao'
        ? atestado.motivo?.replace(/^Finalidade:\s*/i, '').replace(/\.$/, '')
        : undefined;
      const motivoAdicional = atestado.tipo === 'comparecimento'
        ? atestado.motivo?.replace(/^Esteve presente das \d{2}:\d{2} às \d{2}:\d{2}\.\s*/i, '')
        : atestado.tipo !== 'aptidao' ? atestado.motivo : null;
      const doc = await gerarAtestado(
        { nome: paciente.nome, cpf: paciente.cpf || '' },
        { nome: medico.nome || medico.crm, crm: medico.crm, especialidade: medico.especialidade || '' },
        {
          tipo: atestado.tipo as any,
          dataAtendimento: atestado.data_emissao || '',
          dataInicio: atestado.data_inicio || undefined,
          dataFim: atestado.data_fim || undefined,
          horarioInicio: horario?.[1],
          horarioFim: horario?.[2],
          finalidade,
          diasAfastamento: atestado.dias || undefined,
          cid: atestado.cid || undefined,
          observacoes: [motivoAdicional, atestado.observacoes].filter(Boolean).join('\n'),
        }
      );
      openPDF(doc);
    } catch (error) {
      toast.error('Não foi possível preparar o atestado para impressão.', { description: mensagemDeErro(error) });
    }
  };

  const getPacienteNome = (paciente?: Atestado['pacientes']) => {
    return (paciente as any)?.nome_social || paciente?.nome || 'Desconhecido';
  };
  const getMedicoNome = (id: string) => {
    const m = medicos.find(m => m.id === id);
    return m ? `${nomeMedico(m.nome || m.crm)}` : 'Desconhecido';
  };
  const getTipoLabel = (tipo: string | null) => TIPOS_ATESTADO.find(t => t.value === tipo)?.label || tipo;
  const getTipoBadge = (tipo: string | null) => {
    switch (tipo) {
      case 'comparecimento': return 'bg-primary/10 text-primary';
      case 'afastamento': return 'bg-warning/10 text-warning';
      case 'aptidao': return 'bg-success/10 text-success';
      case 'acompanhante': return 'bg-accent text-accent-foreground';
      default: return '';
    }
  };

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  const atestadoQueries = [atestadosQuery, medicosQuery];
  const failedAtestadoQuery = atestadoQueries.find(query => query.isError);
  if (failedAtestadoQuery) {
    return <ErrorState title="Não foi possível carregar atestados e documentos" error={failedAtestadoQuery.error} onRetry={() => { for (const query of atestadoQueries) void query.refetch(); }} />;
  }
  if (isMedicoOnly && (!medicoId || currentMedico?.ativo === false)) {
    return <ErrorState
      title={currentMedico?.ativo === false ? 'Cadastro médico inativo' : 'Perfil médico sem vínculo'}
      description={currentMedico?.ativo === false
        ? 'Seu cadastro médico foi inativado. Peça ao administrador para revisar seu acesso antes de emitir documentos.'
        : 'Seu usuário não está vinculado a um cadastro médico ativo da clínica. Peça ao administrador para revisar esse vínculo antes de emitir documentos.'}
    />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-8 w-8 text-primary" />
            Atestados e Documentos
          </h1>
          <p className="text-muted-foreground">Emissão de atestados e declarações</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1.5 text-xs">
            <FileSignature className="h-3.5 w-3.5 text-muted-foreground" />
            Assinatura manual
          </Badge>
          <Button onClick={handleNew} className="gap-2" disabled={!medicosDisponiveis.length}>
            <Plus className="h-4 w-4" />Novo Atestado
          </Button>
        </div>
      </div>

      {!medicosDisponiveis.length && (
        <div role="alert" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          Não há médicos ativos para emitir atestados. <Link to="/equipe" className="font-medium underline">Gerenciar equipe</Link>.
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {TIPOS_ATESTADO.map(tipo => {
          const Icon = tipo.icon;
          const count = atestados.filter(a => a.tipo === tipo.value).length;
          return (
            <Card
              key={tipo.value}
              className={cn(
                'card-interactive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                medicosDisponiveis.length ? 'cursor-pointer hover:border-primary' : 'cursor-not-allowed opacity-60',
              )}
              role="button"
              tabIndex={medicosDisponiveis.length ? 0 : -1}
              aria-disabled={!medicosDisponiveis.length}
              aria-label={`Emitir ${tipo.label}`}
              onClick={() => medicosDisponiveis.length && handleNewWithType(tipo.value)}
              onKeyDown={(event) => {
                if (!medicosDisponiveis.length) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleNewWithType(tipo.value);
                }
              }}
            >
              <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                <Icon className="h-8 w-8 text-primary" />
                <p className="text-sm font-medium">{tipo.label}</p>
                <span className="text-xs text-muted-foreground tabular-nums">{count} emitido(s)</span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Documentos Emitidos ({filteredAtestados.length})</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome, CPF ou telefone..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead className="hidden md:table-cell">Médico</TableHead>
                  <TableHead className="hidden sm:table-cell">Detalhes</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAtestados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <div className="flex flex-col items-center">
                        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                          <FileText className="h-8 w-8 text-primary" />
                        </div>
                        <p className="font-semibold text-foreground">{atestados.length === 0 ? 'Nenhum atestado encontrado' : 'Nenhum resultado para essa busca'}</p>
                        <p className="text-sm text-muted-foreground mt-1">{atestados.length === 0 ? 'Emita o primeiro atestado para o paciente' : 'Tente outro nome ou limpe a busca.'}</p>
                        {atestados.length === 0 ? <Button className="mt-4 gap-2" onClick={handleNew}><Plus className="h-4 w-4" />Novo Atestado</Button> : <Button variant="link" size="sm" onClick={() => setSearchTerm('')}>Limpar busca</Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAtestados.map(atestado => (
                    <TableRow key={atestado.id}>
                      <TableCell>{atestado.data_emissao ? format(parseDateOnly(atestado.data_emissao)!, 'dd/MM/yyyy') : '—'}</TableCell>
                      <TableCell><Badge className={cn(getTipoBadge(atestado.tipo))}>{getTipoLabel(atestado.tipo)}</Badge></TableCell>
                      <TableCell className="font-medium">{getPacienteNome(atestado.pacientes)}</TableCell>
                      <TableCell className="hidden md:table-cell">{getMedicoNome(atestado.medico_id)}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {atestado.dias && <span>{atestado.dias} dia(s)</span>}
                        {atestado.cid && <Badge variant="outline" className="ml-1 text-[10px]">CID: {atestado.cid}</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleView(atestado)} aria-label="Ver atestado"><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handlePrint(atestado)} aria-label="Imprimir atestado"><Printer className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDuplicate(atestado)} aria-label="Duplicar atestado" title="Duplicar atestado"><Clipboard className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ─── Form Dialog ─── */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (open || !isSaving) setIsFormOpen(open); }}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Emitir Atestado
              <Badge variant="outline" className="gap-1 ml-auto text-[10px]">
                <FileSignature className="h-3 w-3 text-muted-foreground" />Assinatura manual
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <fieldset disabled={isSaving} className="flex-1 overflow-y-auto space-y-5 pr-2 min-w-0">
            {/* Tipo + Template */}
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs font-medium">Tipo de Documento *</Label>
                <Select value={formData.tipo} onValueChange={v => setFormData({ ...formData, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_ATESTADO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={() => setIsTemplateOpen(true)} className="gap-1 flex-shrink-0">
                <Star className="h-3.5 w-3.5" />Modelos
              </Button>
            </div>

            {/* Paciente + Médico */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Paciente *</Label>
                <PacienteCombobox
                  value={formData.paciente_id}
                  onChange={id => setFormData(prev => ({ ...prev, paciente_id: id }))}
                />
                {pacienteSelecionadoQuery.isFetching && formData.paciente_id && (
                  <p className="text-xs text-muted-foreground" role="status">Carregando dados do paciente…</p>
                )}
                {pacienteSelecionadoQuery.isError && formData.paciente_id && (
                  <ErrorState
                    compact
                    title="Não foi possível carregar o paciente selecionado"
                    error={pacienteSelecionadoQuery.error}
                    onRetry={() => void pacienteSelecionadoQuery.refetch()}
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Médico *</Label>
                <Select value={formData.medico_id} disabled={isMedicoOnly} onValueChange={v => setFormData({ ...formData, medico_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o médico" /></SelectTrigger>
                  <SelectContent>
                    {medicosDisponiveis.map(m => <SelectItem key={m.id} value={m.id}>{m.nome || m.crm} — {m.especialidade || 'CRM: ' + m.crm}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Data de Emissão */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Data de Emissão
              </Label>
              <Input type="date" max={today} required value={formData.data_emissao} onChange={e => setFormData({ ...formData, data_emissao: e.target.value })} className="w-48" />
            </div>

            <Separator />

            {/* ─── Comparecimento: Horários ─── */}
            {formData.tipo === 'comparecimento' && (
              <div className="space-y-3 bg-primary/5 border border-primary/20 rounded-lg p-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Período de Comparecimento *
                </h4>
                <p className="text-xs text-muted-foreground">Obrigatório para validação pelo RH. Informe o horário em que o paciente esteve na clínica.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Horário de Início</Label>
                    <Input type="time" value={formData.hora_inicio} onChange={e => setFormData({ ...formData, hora_inicio: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Horário de Fim</Label>
                    <Input type="time" value={formData.hora_fim} onChange={e => setFormData({ ...formData, hora_fim: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            {/* ─── Afastamento: Dias + Período ─── */}
            {formData.tipo === 'afastamento' && (
              <div className="space-y-3 bg-warning/5 border border-warning/20 rounded-lg p-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-warning" />
                  Período de Afastamento *
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Dias de Afastamento *</Label>
                    <Input
                      type="number"
                      min={1}
                      value={formData.dias ?? ''}
                      onChange={e => {
                        const d = Number(e.target.value);
                        if (Number.isInteger(d) && d > 0) updateDias(d);
                        else setFormData(prev => ({ ...prev, dias: null, data_fim: '' }));
                      }}
                      placeholder="Ex: 3"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data de Início</Label>
                    <Input type="date" value={formData.data_inicio} onChange={e => updateDataInicio(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data de Término (auto)</Label>
                    <Input type="date" value={formData.data_fim} readOnly className="bg-muted" />
                  </div>
                </div>
                {formData.dias && formData.data_inicio && formData.data_fim && (
                  <p className="text-xs text-muted-foreground">
                    Afastamento de <strong>{formData.dias} dia(s)</strong>: de{' '}
                    {format(new Date(formData.data_inicio + 'T12:00'), "dd 'de' MMMM", { locale: ptBR })} a{' '}
                    {format(new Date(formData.data_fim + 'T12:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}.
                  </p>
                )}
              </div>
            )}

            {/* ─── Aptidão: Finalidade ─── */}
            {formData.tipo === 'aptidao' && (
              <div className="space-y-3 bg-success/5 border border-success/20 rounded-lg p-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  Finalidade do Atestado
                </h4>
                <div className="space-y-1.5">
                  <Label className="text-xs">Finalidade / Apto para</Label>
                  <Select value={formData.finalidade} onValueChange={v => setFormData({ ...formData, finalidade: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione a finalidade" /></SelectTrigger>
                    <SelectContent>
                      {FINALIDADES_APTIDAO.map(finalidade => (
                        <SelectItem key={finalidade} value={finalidade}>{finalidade.replace(/^Apto para /, '')}</SelectItem>
                      ))}
                      <SelectItem value="custom">Outro (especificar)</SelectItem>
                    </SelectContent>
                  </Select>
                  {formData.finalidade === 'custom' && (
                    <Input
                      placeholder="Descreva a finalidade..."
                      value={formData.motivo}
                      onChange={e => setFormData({ ...formData, motivo: e.target.value })}
                      className="mt-2"
                    />
                  )}
                </div>
              </div>
            )}

            {/* ─── CID-10 (todos os tipos) ─── */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="incluirCid"
                  checked={formData.incluirCid}
                  onCheckedChange={checked => setFormData({ ...formData, incluirCid: checked as boolean })}
                />
                <Label htmlFor="incluirCid" className="text-sm cursor-pointer">
                  O paciente autorizou expressamente a inclusão do CID-10 neste atestado
                </Label>
              </div>
              {formData.incluirCid && (
                <div className="space-y-1.5 pl-7">
                  <div className="flex items-center gap-2 text-xs text-warning">
                    <AlertTriangle className="h-3 w-3" />
                    <span>O CID só pode constar no atestado com autorização expressa do paciente (ética médica).</span>
                  </div>
                  <Cid10Search value={formData.cid} onChange={v => setFormData({ ...formData, cid: v })} />
                </div>
              )}
            </div>

            <Separator />

            {/* Motivo */}
            {formData.tipo !== 'aptidao' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Motivo / Justificativa</Label>
                <Input
                  placeholder="Motivo da emissão do atestado..."
                  value={formData.motivo}
                  onChange={e => setFormData({ ...formData, motivo: e.target.value })}
                />
              </div>
            )}

            {/* Observações / Corpo do Atestado */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Texto do Atestado / Observações</Label>
              <p className="text-[11px] text-muted-foreground">
                Variáveis disponíveis: {'{{nome_paciente}}'}, {'{{cpf_paciente}}'}, {'{{data_emissao}}'}, {'{{dias}}'}, {'{{data_inicio}}'}, {'{{data_fim}}'}, {'{{hora_inicio}}'}, {'{{hora_fim}}'}, {'{{medico_nome}}'}, {'{{medico_crm}}'}, {'{{cid}}'}
              </p>
              <Textarea
                value={formData.observacoes}
                onChange={e => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Texto do atestado ou observações adicionais..."
                rows={4}
              />
            </div>

            {/* O sistema NÃO assina o documento. Não há integração com Memed,
                ICP-Brasil ou qualquer provedor: o PDF é montado localmente.
                Dizer o contrário fazia a clínica entregar ao paciente um
                atestado que se declarava assinado e falhava na validação. */}
            <div className="flex items-center gap-3 bg-warning/5 border border-warning/20 rounded-lg p-3">
              <FileSignature className="h-5 w-5 text-warning flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-warning">Este atestado sai sem assinatura digital</p>
                <p className="text-xs text-muted-foreground">
                  Vale como documento assinado de próprio punho depois de impresso e assinado pelo
                  médico. Para assinatura com validade ICP-Brasil, assine o PDF no
                  assinador gov.br antes de entregar.
                </p>
              </div>
            </div>
          </fieldset>

          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || pacienteSelecionadoQuery.isFetching || !!formData.paciente_id && pacienteSelecionadoQuery.isError}
              className="gap-2"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              <FileSignature className="h-4 w-4" />Emitir atestado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Template Picker ─── */}
      <Dialog open={isTemplateOpen} onOpenChange={setIsTemplateOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              Modelos de Atestado
            </DialogTitle>
          </DialogHeader>
          {templatesQuery.isError ? (
            <ErrorState
              compact
              title="Não foi possível carregar os modelos de atestado"
              error={templatesQuery.error}
              onRetry={() => void templatesQuery.refetch()}
            />
          ) : templatesQuery.isLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground" role="status">Carregando modelos…</p>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Star className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum modelo cadastrado</p>
              <p className="text-xs mt-1">Cadastre modelos na página de Templates</p>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map(t => (
                <div
                  key={t.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleLoadTemplate(t)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{t.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {getTipoLabel(t.tipo)}
                        {(t.dias_afastamento ?? t.diasAfastamento) && ` • ${t.dias_afastamento ?? t.diasAfastamento} dias`}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="gap-1"><Clipboard className="h-3.5 w-3.5" />Aplicar</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── View Dialog ─── */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-primary" />Detalhes do Atestado</DialogTitle></DialogHeader>
          {selectedAtestado && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Tipo</p>
                  <Badge className={cn(getTipoBadge(selectedAtestado.tipo))}>{getTipoLabel(selectedAtestado.tipo)}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Data de Emissão</p>
                  <p className="font-medium">{selectedAtestado.data_emissao ? format(parseDateOnly(selectedAtestado.data_emissao)!, 'dd/MM/yyyy') : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Paciente</p>
                  <p className="font-medium">{getPacienteNome(selectedAtestado.pacientes)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Médico</p>
                  <p className="font-medium">{getMedicoNome(selectedAtestado.medico_id)}</p>
                </div>
                {selectedAtestado.dias && (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">Dias de Afastamento</p>
                      <p className="font-medium">{selectedAtestado.dias} dia(s)</p>
                    </div>
                    {selectedAtestado.data_inicio && (
                      <div>
                        <p className="text-xs text-muted-foreground">Período</p>
                        <p className="font-medium text-sm">
                          {format(parseDateOnly(selectedAtestado.data_inicio)!, 'dd/MM/yyyy')}
                          {selectedAtestado.data_fim && ` a ${format(parseDateOnly(selectedAtestado.data_fim)!, 'dd/MM/yyyy')}`}
                        </p>
                      </div>
                    )}
                  </>
                )}
                {selectedAtestado.cid && (
                  <div>
                    <p className="text-xs text-muted-foreground">CID-10</p>
                    <Badge variant="outline">{selectedAtestado.cid}</Badge>
                  </div>
                )}
              </div>
              {selectedAtestado.motivo && (
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground">Motivo</p>
                  <p className="text-sm">{selectedAtestado.motivo}</p>
                </div>
              )}
              {selectedAtestado.observacoes && (
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground">Observações</p>
                  <p className="text-sm whitespace-pre-wrap">{selectedAtestado.observacoes}</p>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                <FileSignature className="h-3.5 w-3.5" />
                <span>Documento sem assinatura digital — imprima e assine, ou assine o PDF no gov.br</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewOpen(false)}>Fechar</Button>
            {selectedAtestado && (
              <Button onClick={() => handlePrint(selectedAtestado)} className="gap-1">
                <Printer className="h-4 w-4" />Imprimir
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
