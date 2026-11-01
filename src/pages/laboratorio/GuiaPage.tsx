import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, ExternalLink, Loader2, ArrowRight, CalendarPlus, X, FlaskConical, ClipboardList, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { abrirUrlSegura, storageUrlSeguro } from '@/lib/safeUrl';
import { mensagemDeErro } from '@/lib/erros';
import { pathLaudoAnteriorAposSalvar, pathsLaudoExternoAoFechar } from '@/lib/guiasExternasStorage';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PreparoExamesAcoes } from '@/components/exames/PreparoExamesAcoes';
import { exameDoTipoGravado } from '@/lib/catalogoExames';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { rotuloAutorizacao, situacaoAutorizacao, STATUS_GUIA_EM_ATENDIMENTO } from '@/lib/guiaExternaAutorizacao';

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
    // maybeSingle() falhava com dois cadastros no mesmo CPF (com e sem máscara):
    // usa o mais antigo e avisa para unificar.
    const { data, error } = await supabase.from('pacientes')
      .select('id')
      .eq('clinica_id', clinicaId)
      .in('cpf', [...cpfsPossiveis])
      .order('created_at', { ascending: true })
      .limit(2);
    if (error) throw error;
    if ((data?.length ?? 0) > 1) {
      toast.warning('Há mais de um cadastro com este CPF.', { description: 'A guia foi vinculada ao cadastro mais antigo. Unifique os cadastros em Pacientes.' });
    }
    return data?.[0]?.id ?? null;
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


export default function GuiaPage() {
  const { guiaId } = useParams();
  const { profile } = useSupabaseAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['guia-externa-detalhe', profile?.clinica_id, guiaId],
    enabled: !!profile?.clinica_id && !!guiaId,
    queryFn: async () => {
      const { data, error } = await supabase.from('guias_externas').select('*')
        .eq('clinica_id', profile!.clinica_id!).eq('id', guiaId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const back = <Button asChild variant="outline"><Link to="/guias-externas" state={{ guiaFilters: location.state?.guiaFilters }}>Voltar às guias</Link></Button>;
  if (query.isLoading) return <div className="space-y-4">{back}<p role="status">Carregando guia externa…</p><Skeleton className="h-48 w-full" /></div>;
  if (query.error) return <div className="space-y-4">{back}<ErrorState title="Não foi possível carregar a guia" error={query.error} onRetry={() => void query.refetch()} /></div>;
  if (!query.data) return <div className="space-y-4">{back}<h1 className="text-xl font-semibold">Guia não encontrada</h1><p>O registro não está disponível na clínica atual.</p></div>;
  return <GuiaWorkspace key={`${profile?.clinica_id}:${guiaId}`} guia={query.data} onChanged={async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['guias_externas'] }), query.refetch()]);
  }} />;
}

async function removerLaudosSemVinculo(clinicaId: string, paths: string[]) {
  for (const path of paths) {
    const { data, error } = await supabase.from('guias_externas').select('id')
      .eq('clinica_id', clinicaId).eq('laudo_externo_url', path).limit(1).maybeSingle();
    if (error) throw error;
    if (data) continue;
    const { error: removeError } = await supabase.storage.from('guias-externas').remove([path]);
    if (removeError) throw removeError;
  }
}
function GuiaWorkspace({ guia, onChanged }: any) {
  const { profile } = useSupabaseAuth();
  const location = useLocation();
  const completed = useRef(false);
  const [agendando, setAgendando] = useState(false);
  const [dataAg, setDataAg] = useState('');
  const [horaAg, setHoraAg] = useState('');
  const [terceirizacao, setTerceirizacao] = useState({
    laboratorio_id: guia.laboratorio_id || '', status_terceirizacao: guia.status_terceirizacao || 'nao_enviado',
    prazo_laboratorio: guia.prazo_laboratorio || '', custo_laboratorio: guia.custo_laboratorio == null ? '' : String(guia.custo_laboratorio),
    data_envio_laboratorio: guia.data_envio_laboratorio || '', data_retorno_laboratorio: guia.data_retorno_laboratorio || '',
    laudo_externo_url: guia.laudo_externo_url || '', laudo_externo_nome: guia.laudo_externo_nome || '',
  });
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(terceirizacao));
  const [uploadingRetorno, setUploadingRetorno] = useState(false);
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const navigate = useNavigate();
  const { hasAnyRole } = useSupabaseAuth();
  const podeCriarPedido = hasAnyRole(['admin', 'medico', 'enfermagem']);
  const autorizacao = situacaoAutorizacao(guia.validade_autorizacao, todaySaoPauloDateOnly());
  const rotuloAut = STATUS_GUIA_EM_ATENDIMENTO.has(guia.status) ? rotuloAutorizacao(autorizacao.situacao, autorizacao.dias) : null;
  // Autorização vencida não pode seguir para coleta: o convênio glosa.
  const autorizacaoBloqueia = autorizacao.situacao === 'vencida';
  const nomesExames = ((guia.exames_solicitados as any[]) || []).map((ex) => String(ex?.nome || ex?.tipo || '').trim()).filter(Boolean);
  const laudosTemporariosRef = useRef<Set<string>>(new Set());
  const dialogMontadoRef = useRef(false);
  const anexoPersistidoInicialRef = useRef<string | null>(guia.laudo_externo_url || null);

  useEffect(() => {
    dialogMontadoRef.current = true;
    return () => {
      dialogMontadoRef.current = false;
      const paths = pathsLaudoExternoAoFechar([...laudosTemporariosRef.current], anexoPersistidoInicialRef.current);
      laudosTemporariosRef.current.clear();
      if (paths.length && profile?.clinica_id) void removerLaudosSemVinculo(profile.clinica_id, paths).catch(error => {
        toast.warning('Não foi possível remover todos os PDFs temporários do parceiro.', { description: mensagemDeErro(error) });
      });
    };
  }, []);

  const laboratoriosParceiros = useQuery({
    queryKey: ['lab-parceiros-guia', profile?.clinica_id], enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('laboratorios').select('id, nome')
        .eq('clinica_id', profile!.clinica_id).eq('ativo', true).order('nome');
      if (error) throw error; return data ?? [];
    },
  });
  const eventosTerceirizacao = useQuery({
    queryKey: ['lab-guia-eventos', guia.id, profile?.clinica_id], enabled: !!profile?.clinica_id,
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
      const anexoAnterior = pathLaudoAnteriorAposSalvar(anexoPersistidoInicialRef.current, terceirizacao.laudo_externo_url);
      anexoPersistidoInicialRef.current = terceirizacao.laudo_externo_url || null;
      setSavedSnapshot(JSON.stringify(terceirizacao));
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
      await onChanged(); void eventosTerceirizacao.refetch(); toast.success('Acompanhamento do laboratório externo salvo.');
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
        if (erroRemocao) toast.warning('A página foi fechada durante o envio e o PDF temporário não pôde ser removido.', { description: mensagemDeErro(erroRemocao) });
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
    onSuccess: async () => { await onChanged(); setConfirmarCancelamento(false); setMotivoCancelamento(''); toast.success('Guia atualizada'); },
    onError: (e: any) => toast.error('Não foi possível atualizar a guia', { description: mensagemDeErro(e) }),
  });

  const enviarParaFila = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      if (!['recebida', 'em_analise', 'agendada'].includes(guia.status)) {
        throw new Error('Esta guia já foi encaminhada ou não aceita envio para a fila. Atualize a lista.');
      }
      if (autorizacaoBloqueia) throw new Error('A autorização do convênio está vencida. Peça uma nova autorização antes de enviar para a coleta.');
      const pacienteId = await obterOuCriarPacienteDaGuia(guia, profile?.clinica_id);
      const { error } = await (supabase as any).rpc('encaminhar_guia_externa_para_fila', {
        p_guia_id: guia.id,
        p_clinica_id: profile.clinica_id,
        p_paciente_id: pacienteId,
      });
      if (error) throw error;
    },
    onSuccess: async () => { await onChanged(); toast.success('Guia enviada para a fila de coleta'); },
    onError: (e: any) => toast.error('Não foi possível enviar para a fila', { description: mensagemDeErro(e) }),
  });

  const gerarAgendamento = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      if (!['recebida', 'em_analise'].includes(guia.status)) throw new Error('Esta guia já foi agendada ou encaminhada. Atualize a lista.');
      if (autorizacaoBloqueia) throw new Error('A autorização do convênio está vencida. Peça uma nova autorização antes de agendar.');
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
    onSuccess: async () => { await onChanged(); toast.success('Coleta agendada'); setAgendando(false); setDataAg(''); setHoraAg(''); },
    onError: (e: any) => toast.error('Não foi possível agendar a coleta', { description: mensagemDeErro(e) }),
  });

  // 42: transforma os exames soltos da guia em pedido de exames do paciente.
  const converterEmPedido = useMutation({
    mutationFn: async () => {
      if (!nomesExames.length) throw new Error('A guia não tem exames para converter.');
      return obterOuCriarPacienteDaGuia(guia, profile?.clinica_id);
    },
    onSuccess: (pacienteId: string) => {
      const repetirExames = nomesExames.map((nome) => exameDoTipoGravado(nome));
      navigate(`/exames/nova?paciente=${encodeURIComponent(pacienteId)}`, {
        state: { returnTo: '/exames', repetirExames, repetirIndicacao: guia.observacoes || '' },
      });
    },
    onError: (e: any) => toast.error('Não foi possível converter em pedido', { description: mensagemDeErro(e) }),
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

  const busy = uploadingRetorno || salvarTerceirizacao.isPending || updateStatus.isPending || enviarParaFila.isPending || gerarAgendamento.isPending || converterEmPedido.isPending;
  const dirty = JSON.stringify(terceirizacao) !== savedSnapshot || (agendando && !!(dataAg || horaAg));
  return <div className="mx-auto max-w-6xl space-y-6 pb-24 lg:pb-8">
    <UnsavedChangesGuard dirty={dirty} busy={busy} completed={completed} />
    <PageHeader title="Guia externa" icon={<FileText className="h-5 w-5" />} description={`Recebida em ${formatarDataHoraSaoPaulo(guia.data_recebimento, true)} · ${ORIGEM_LABEL[guia.origem] || guia.origem}`} actions={<Button asChild variant="outline"><Link to="/guias-externas" state={{ guiaFilters: location.state?.guiaFilters }}>Voltar às guias</Link></Button>} />
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"><h2 className="text-2xl font-semibold break-words">{guia.paciente_nome}</h2><div className="flex flex-wrap gap-2">{rotuloAut && <Badge variant="outline" className={autorizacao.situacao === 'vencida' ? 'gap-1 border-destructive/40 bg-destructive/10 text-destructive' : 'gap-1 border-warning/40 bg-warning/10 text-warning-foreground'}><ShieldAlert aria-hidden="true" className="h-3 w-3" />{rotuloAut}</Badge>}<Badge variant="outline">{STATUS_LABEL[guia.status]?.label || guia.status}</Badge></div></div>
    {autorizacaoBloqueia && STATUS_GUIA_EM_ATENDIMENTO.has(guia.status) && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">A autorização do convênio venceu. Agendamento e envio para a fila ficam bloqueados até uma nova autorização ser registrada.</p>}
    <fieldset disabled={busy} className="min-w-0 space-y-6" aria-busy={busy}>
        <div className="space-y-4">
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <Info label="CPF" value={guia.paciente_cpf} />
            <Info label="Nascimento" value={guia.paciente_nascimento ? guia.paciente_nascimento.split('-').reverse().join('/') : null} />
            <Info label="Telefone" value={guia.paciente_telefone} />
            <Info label="Convênio" value={guia.convenio_nome} />
            <Info label="Médico solicitante" value={guia.medico_externo_nome} />
            <Info label="CRM" value={guia.medico_externo_crm ? `${guia.medico_externo_crm}/${guia.medico_externo_uf || ''}` : null} />
            <Info label="Nº autorização" value={guia.numero_autorizacao} />
            <Info label="Validade da autorização" value={guia.validade_autorizacao ? guia.validade_autorizacao.split('-').reverse().join('/') : null} />
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

          {nomesExames.length > 0 && guia.status !== 'cancelada' && (
            <section aria-labelledby={`guia-${guia.id}-preparo`} className="space-y-2">
              <h3 id={`guia-${guia.id}-preparo`} className="text-sm font-semibold">Preparo do paciente</h3>
              <PreparoExamesAcoes exames={nomesExames} pacienteNome={guia.paciente_nome || 'paciente'} telefone={guia.paciente_telefone} />
            </section>
          )}

          <section className="border-y">
            <CardHeader className="border-b px-0 py-4"><CardTitle className="text-sm">Acompanhamento do laboratório parceiro</CardTitle><CardDescription>Parceiro, prazo, custo e retorno ficam vinculados a esta guia da clínica.</CardDescription></CardHeader>
            <CardContent className="space-y-4 px-0 py-4">
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
                <input id={`laudo-parceiro-${guia.id}`} aria-label="Laudo PDF do laboratório parceiro" type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => { void enviarLaudoParceiro(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                {terceirizacao.laudo_externo_url && <Button variant="ghost" size="sm" onClick={() => void abrirLaudoParceiro()}><ExternalLink className="mr-1 h-4 w-4" />Abrir PDF privado</Button>}
                <Button size="sm" className="ml-auto" onClick={() => salvarTerceirizacao.mutate()} disabled={salvarTerceirizacao.isPending || uploadingRetorno}>{salvarTerceirizacao.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Salvar acompanhamento</Button>
              </div>
              <div className="border-t pt-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Histórico de acompanhamento · últimas 30 atualizações</p>{eventosTerceirizacao.isLoading ? <p role="status" className="text-xs text-muted-foreground">Carregando histórico…</p> : eventosTerceirizacao.error ? <ErrorState compact error={eventosTerceirizacao.error} onRetry={() => void eventosTerceirizacao.refetch()} /> : (eventosTerceirizacao.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">Nenhum acompanhamento registrado para esta guia.</p> : <ul className="space-y-1.5">{eventosTerceirizacao.data?.map((evento: any) => <li key={evento.id} className="flex justify-between gap-3 text-xs"><span>{evento.tipo === 'parceiro_registrado' ? 'Acompanhamento iniciado' : 'Acompanhamento atualizado'}</span><time className="text-muted-foreground">{formatarDataHoraSaoPaulo(evento.created_at, true)}</time></li>)}</ul>}</div>
            </CardContent>
          </section>

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

        <div className="flex flex-wrap justify-end gap-2 border-t pt-4 scroll-mb-24">
          {guia.status !== 'cancelada' && guia.status !== 'finalizada' && guia.status !== 'encaminhada_fila' && (
            <>
              <Button variant="outline" onClick={() => { setMotivoCancelamento(''); setConfirmarCancelamento(true); }} disabled={updateStatus.isPending || enviarParaFila.isPending || gerarAgendamento.isPending || uploadingRetorno}>
                <X aria-hidden="true" className="h-4 w-4 mr-1" /> Cancelar guia
              </Button>
              {podeCriarPedido && nomesExames.length > 0 && (
                <Button variant="outline" className="gap-1.5" onClick={() => converterEmPedido.mutate()} disabled={converterEmPedido.isPending || uploadingRetorno}>
                  {converterEmPedido.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <ClipboardList aria-hidden="true" className="h-4 w-4" />}
                  Converter em pedido
                </Button>
              )}
              {!agendando && ['recebida', 'em_analise'].includes(guia.status) && (
                <Button variant="outline" onClick={() => setAgendando(true)} disabled={autorizacaoBloqueia || updateStatus.isPending || enviarParaFila.isPending || gerarAgendamento.isPending || uploadingRetorno} className="gap-1.5">
                  <CalendarPlus className="h-4 w-4" /> Agendar coleta
                </Button>
              )}
              <Button onClick={() => enviarParaFila.mutate()} disabled={autorizacaoBloqueia || enviarParaFila.isPending || gerarAgendamento.isPending || updateStatus.isPending || uploadingRetorno} className="gap-1.5">
                {enviarParaFila.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Enviar para fila de coleta
              </Button>
            </>
          )}
        </div>
    </fieldset>
    <ConfirmDialog
      open={confirmarCancelamento}
      onOpenChange={(aberto) => { if (!aberto && !updateStatus.isPending) setConfirmarCancelamento(false); }}
      title="Cancelar esta guia externa?"
      description="A guia sai da fila de atendimento. Informe o motivo; ele fica registrado nas observações da guia."
      confirmLabel="Cancelar guia"
      cancelLabel="Manter guia"
      variant="destructive"
      isLoading={updateStatus.isPending}
      closeOnConfirm={false}
      onConfirm={() => {
        const motivo = motivoCancelamento.trim();
        if (motivo.length < 5) { toast.error('Descreva o motivo do cancelamento (mínimo de 5 caracteres).'); return; }
        updateStatus.mutate({ status: 'cancelada', observacoes: [guia.observacoes?.trim(), `Cancelamento: ${motivo}`].filter(Boolean).join('\n') });
      }}
    >
      <div className="space-y-1.5 pt-2">
        <Label htmlFor={`guia-${guia.id}-motivo-cancelamento`}>Motivo do cancelamento *</Label>
        <Textarea id={`guia-${guia.id}-motivo-cancelamento`} value={motivoCancelamento} onChange={(event) => setMotivoCancelamento(event.target.value)} maxLength={300} rows={3} />
      </div>
    </ConfirmDialog>
  </div>;
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '—'}</p>
    </div>
  );
}

