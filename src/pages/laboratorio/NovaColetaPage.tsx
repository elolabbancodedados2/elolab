import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Activity, ClipboardCheck, Clock, Droplets, FileText, Link2, MapPin, Package, TestTube, User } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { mensagemDeErro } from '@/lib/erros';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';

const FUSO_CLINICA = 'America/Sao_Paulo';

function dataHoraLocalDaClinica(instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_CLINICA,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function dataHoraDaClinicaParaIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const targetWallTime = Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), Number(hourText), Number(minuteText));
  const initial = new Date(targetWallTime);
  const clinicParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_CLINICA,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(initial);
  const part = (type: string) => Number(clinicParts.find(item => item.type === type)?.value || 0);
  const representedWallTime = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  const instant = new Date(targetWallTime - (representedWallTime - targetWallTime));
  const resolved = dataHoraLocalDaClinica(instant);
  return resolved === value ? instant.toISOString() : null;
}

const CONDICOES_AMOSTRA = ['Hemólise', 'Lipemia', 'Icterícia', 'Coagulada', 'Volume insuficiente'];

const SITIOS_COLETA = [
  'Braço direito (veia cubital)', 'Braço esquerdo (veia cubital)',
  'Mão direita', 'Mão esquerda', 'Acesso venoso central',
  'Veia jugular', 'Cateter', 'Outro',
];

const TUBOS = [
  { value: 'EDTA (Roxo)', color: 'bg-purple-500' },
  { value: 'Soro (Amarelo)', color: 'bg-yellow-400' },
  { value: 'Seco (Vermelho)', color: 'bg-red-500' },
  { value: 'Citrato (Azul)', color: 'bg-blue-400' },
  { value: 'Fluoreto (Cinza)', color: 'bg-gray-400' },
  { value: 'Heparina (Verde)', color: 'bg-green-500' },
  { value: 'Coletor Urina', color: 'bg-amber-300' },
  { value: 'Coletor Fezes', color: 'bg-amber-700' },
  { value: 'Swab (Laranja)', color: 'bg-orange-400' },
];

export default function NovaColetaPage() {
  const { profile } = useSupabaseAuth();
  return <NovaColetaWorkspace key={profile?.clinica_id ?? ''} />;
}

function NovaColetaWorkspace() {
  const { user, profile } = useSupabaseAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const completed = useRef(false);
  const saveLock = useRef(false);
  const returnTo = typeof location.state?.laboratorioSearch === 'string' ? `/laboratorio${location.state.laboratorioSearch.startsWith('?') ? location.state.laboratorioSearch : ''}` : '/laboratorio';
  const returnState = { buscaPaciente: location.state?.buscaPaciente ?? '' };
  const back = () => navigate(returnTo, { state: returnState });
  const [newColetaForm, setNewColetaForm] = useState({
    paciente_id: '', medico_solicitante_id: '', tipo_amostra: 'sangue',
    tubo: '', observacoes: '', jejum_necessario: false, jejum_horas: 0, urgente: false,
    coletado_por: user?.id || '', data_coleta: dataHoraLocalDaClinica(),
    exame_id: '', volume_ml: '', condicao_amostra: [] as string[], sitio_coleta: '', lote_insumo: '',
    finalidade: 'diagnostico', indicacao_clinica: '', categoria_exame: '',
    numero_guia: '', material: '', trouxe_material: false, cid: '', procedimento_codigo: '', convenio_id: '', grupo: '', setor_id: '',
  });
  const initial = useRef(JSON.stringify(newColetaForm));
  const dirty = JSON.stringify(newColetaForm) !== initial.current;
  const medicosQuery = useQuery({
    queryKey: ['medicos-lab', profile?.clinica_id, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('medicos').select('id, nome, crm, especialidade').eq('clinica_id', profile!.clinica_id!).order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });
  const medicos = medicosQuery.data;

  const funcionariosQuery = useQuery({
    queryKey: ['funcionarios-lab', profile?.clinica_id, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, nome').eq('clinica_id', profile!.clinica_id!).order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });
  const funcionarios = funcionariosQuery.data;

  const conveniosQuery = useQuery({
    queryKey: ['convenios-lab', profile?.clinica_id, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('convenios').select('id, nome, codigo').eq('clinica_id', profile!.clinica_id!).eq('ativo', true).order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });
  const convenios = conveniosQuery.data;

  const setoresQuery = useQuery({
    queryKey: ['lab-setores-worklist', profile?.clinica_id],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('laboratorio_setores')
        .select('id, nome').eq('clinica_id', profile!.clinica_id!).eq('ativo', true).order('nome');
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string }>;
    },
  });

  // 36: lote escolhido entre os disponíveis (saldo e validade); texto livre só como alternativa.
  const [loteId, setLoteId] = useState('');
  const [loteManual, setLoteManual] = useState(false);
  const lotesQuery = useQuery({
    queryKey: ['lab-lotes-coleta', profile?.clinica_id],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('laboratorio_lotes_insumos')
        .select('id, nome, lote, validade, quantidade, unidade')
        .eq('clinica_id', profile!.clinica_id!).eq('status', 'disponivel').gt('quantidade', 0)
        .order('validade', { ascending: true }).limit(200);
      if (error) throw error;
      const hoje = todaySaoPauloDateOnly();
      return ((data ?? []) as Array<{ id: string; nome: string; lote: string; validade: string | null; quantidade: number; unidade: string | null }>)
        .filter(item => !item.validade || item.validade >= hoje);
    },
  });
  const textoDoLote = (item: { nome: string; lote: string }) => `${item.nome} · lote ${item.lote}`;

  const examesPendentesQuery = useQuery({
    queryKey: ['exames-pendentes-lab', profile?.clinica_id, user?.id, newColetaForm.paciente_id],
    queryFn: async () => {
      if (!newColetaForm.paciente_id) return { items: [], hasMore: false };
      const { data, error } = await (supabase as any).from('exames').select('id, tipo_exame, paciente_id, pacientes(nome), tipo_exames_catalog(setor_id)')
        .eq('clinica_id', profile!.clinica_id!)
        .eq('paciente_id', newColetaForm.paciente_id)
        .in('status', ['solicitado', 'agendado'])
        .order('data_solicitacao', { ascending: false })
        .order('id', { ascending: true })
        .limit(201);
      if (error) throw error;
      const pedidos = data ?? [];
      return { items: pedidos.slice(0, 200), hasMore: pedidos.length > 200 };
    },
    enabled: !!profile?.clinica_id && !!newColetaForm.paciente_id,
  });

  const createColeta = useMutation({
    mutationFn: async (form: any) => {
      if (!profile?.clinica_id || !user?.id) throw new Error('Usuário ou clínica não identificados.');
      if (form.exame_id) {
        const { data: coletaExistente, error: erroConsulta } = await supabase
          .from('coletas_laboratorio')
          .select('id')
          .eq('clinica_id', profile.clinica_id)
          .eq('exame_id', form.exame_id)
          .limit(1)
          .maybeSingle();
        if (erroConsulta) throw erroConsulta;
        if (coletaExistente) {
          throw new Error('Este pedido já possui uma coleta. Localize a amostra existente na worklist para continuar o atendimento.');
        }
      }
      const payload = { ...form, clinica_id: profile.clinica_id };
      const { error } = await supabase.from('coletas_laboratorio').insert(payload);
      if (error) throw error;
      // Baixa de uma unidade do lote usado. A coleta já está salva: falha aqui só avisa.
      const lote = (lotesQuery.data ?? []).find(item => item.id === loteId);
      if (lote) {
        const restante = Math.max(0, Number(lote.quantidade) - 1);
        const { data: baixa, error: erroBaixa } = await (supabase as any).from('laboratorio_lotes_insumos')
          .update({ quantidade: restante, ...(restante === 0 ? { status: 'esgotado' } : {}) })
          .eq('id', lote.id).eq('clinica_id', profile.clinica_id).eq('quantidade', lote.quantidade).select('id').maybeSingle();
        if (erroBaixa || !baixa) toast.warning('Coleta registrada, mas a baixa do lote não foi feita.', { description: erroBaixa ? mensagemDeErro(erroBaixa) : 'O saldo mudou; confira em Gestão do laboratório.' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-lotes-coleta', profile?.clinica_id] });
      queryClient.invalidateQueries({ queryKey: ['lab-gestao-lotes', profile?.clinica_id] });
      queryClient.invalidateQueries({ queryKey: ['coletas-laboratorio', profile?.clinica_id] });
      queryClient.invalidateQueries({ queryKey: ['exames-pendentes-lab', profile?.clinica_id] });
      toast.success('Coleta registrada com sucesso!');
      completed.current = true;
      back();
    },
    onError: (e) => toast.error('Erro ao registrar coleta', { description: mensagemDeErro(e) }),
    onSettled: () => { saveLock.current = false; },
  });

  const toggleCondicao = (cond: string) => {
    setNewColetaForm(prev => ({
      ...prev,
      condicao_amostra: prev.condicao_amostra.includes(cond)
        ? prev.condicao_amostra.filter(c => c !== cond)
        : [...prev.condicao_amostra, cond],
    }));
  };

  const examesFiltrados = examesPendentesQuery.data?.items ?? [];

  if (!profile?.clinica_id) return <ErrorState title="Clínica não identificada" description="Aguarde a identificação da clínica antes de registrar uma coleta." />;
  return <div className="space-y-5 pb-24 lg:pb-8">
    <UnsavedChangesGuard dirty={dirty} busy={createColeta.isPending} completed={completed} />
    <Button asChild variant="outline"><Link to={returnTo} state={returnState}>Voltar ao laboratório</Link></Button>
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Nova coleta de amostra" icon={<TestTube className="h-5 w-5" />} description="Registre uma amostra já coletada. Confira paciente, responsável e horário antes de salvar; o código será gerado no registro." />
          <form onSubmit={(e) => {
            e.preventDefault();
            if (saveLock.current) return;
            if (!newColetaForm.paciente_id) { toast.error('Selecione o paciente.'); return; }
            if (medicosQuery.isLoading || funcionariosQuery.isLoading || conveniosQuery.isLoading || setoresQuery.isLoading) {
              toast.info('Aguarde o carregamento das listas de profissionais e convênios.');
              return;
            }
            if (medicosQuery.isError || funcionariosQuery.isError || conveniosQuery.isError || setoresQuery.isError) {
              toast.error('Não foi possível confirmar os dados auxiliares da coleta.', {
                description: 'Atualize as listas de médicos, profissionais, convênios e setores antes de salvar para evitar um vínculo incorreto.',
              });
              return;
            }
            const dataColetaIso = dataHoraDaClinicaParaIso(newColetaForm.data_coleta);
            if (!dataColetaIso) {
              toast.error('Informe uma data e horário válidos para a coleta.');
              return;
            }
            if (new Date(dataColetaIso).getTime() > Date.now()) {
              toast.error('A coleta não pode ser registrada no futuro.', {
                description: 'Este formulário registra uma amostra já coletada. Para uma coleta futura, mantenha o pedido como pendente até a realização.',
              });
              return;
            }
            if (!newColetaForm.coletado_por) {
              toast.error('Informe o profissional que realizou a coleta.');
              return;
            }
            saveLock.current = true;
            createColeta.mutate({
              paciente_id: newColetaForm.paciente_id,
              medico_solicitante_id: newColetaForm.medico_solicitante_id || null,
              tipo_amostra: newColetaForm.tipo_amostra,
              tubo: newColetaForm.tubo || null,
              observacoes: newColetaForm.observacoes || null,
              jejum_necessario: newColetaForm.jejum_necessario,
              jejum_horas: newColetaForm.jejum_horas || null,
              urgente: newColetaForm.urgente,
              status: 'coletado',
              coletado_por: newColetaForm.coletado_por || null,
              data_coleta: dataColetaIso,
              exame_id: newColetaForm.exame_id && newColetaForm.exame_id !== '__none__' ? newColetaForm.exame_id : null,
              volume_ml: newColetaForm.volume_ml ? parseFloat(newColetaForm.volume_ml) : null,
              condicao_amostra: newColetaForm.condicao_amostra.length > 0 ? newColetaForm.condicao_amostra : null,
              sitio_coleta: newColetaForm.sitio_coleta && newColetaForm.sitio_coleta !== '__none__' ? newColetaForm.sitio_coleta : null,
              lote_insumo: newColetaForm.lote_insumo.trim() || null,
              finalidade: newColetaForm.finalidade || 'diagnostico',
              indicacao_clinica: newColetaForm.indicacao_clinica || null,
              categoria_exame: newColetaForm.categoria_exame || null,
              numero_guia: newColetaForm.numero_guia || null,
              material: newColetaForm.material || null,
              trouxe_material: newColetaForm.trouxe_material,
              cid: newColetaForm.cid || null,
              procedimento_codigo: newColetaForm.procedimento_codigo || null,
              convenio_id: newColetaForm.convenio_id && newColetaForm.convenio_id !== '__none__' ? newColetaForm.convenio_id : null,
              grupo: newColetaForm.grupo || null,
              setor_id: newColetaForm.setor_id || null,
            } as any);
          }} className="rounded-xl border bg-card p-4 sm:p-6" aria-busy={createColeta.isPending}>
            <fieldset disabled={createColeta.isPending} className="min-w-0 space-y-5 border-0 p-0">

            {/* Paciente + Médico */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="coleta-paciente_id" className="text-xs font-medium">Paciente *</Label>
                <PacienteCombobox id="coleta-paciente_id" value={newColetaForm.paciente_id} onChange={v => setNewColetaForm(p => ({ ...p, paciente_id: v, exame_id: '' }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coleta-medico_solicitante_id" className="text-xs font-medium">Médico Solicitante</Label>
                {medicosQuery.isError ? (
                  <ErrorState compact description="Não foi possível carregar os médicos" error={medicosQuery.error} onRetry={() => void medicosQuery.refetch()} />
                ) : (
                  <Select value={newColetaForm.medico_solicitante_id} onValueChange={v => setNewColetaForm(p => ({ ...p, medico_solicitante_id: v }))} disabled={medicosQuery.isLoading}>
                    <SelectTrigger id="coleta-medico_solicitante_id" aria-label="Médico solicitante"><SelectValue placeholder={medicosQuery.isLoading ? 'Carregando…' : 'Selecione...'} /></SelectTrigger>
                    <SelectContent>{medicos?.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.nome || `CRM ${m.crm}`} — {m.especialidade || 'Clínico'}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Rastreabilidade */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />Rastreabilidade
              </h2>
              <p className="text-xs text-muted-foreground">Código gerado automaticamente ao salvar.</p>
              <div className="space-y-1.5">
                <Label htmlFor="coleta-lote_escolha" className="text-xs">Lote do insumo (tubo ou agulha)</Label>
                <Select
                  value={loteId || (loteManual ? '__outro__' : '__none__')}
                  disabled={lotesQuery.isLoading}
                  onValueChange={value => {
                    if (value === '__none__') { setLoteId(''); setLoteManual(false); setNewColetaForm(p => ({ ...p, lote_insumo: '' })); return; }
                    if (value === '__outro__') { setLoteId(''); setLoteManual(true); setNewColetaForm(p => ({ ...p, lote_insumo: '' })); return; }
                    const lote = (lotesQuery.data ?? []).find(item => item.id === value);
                    setLoteId(value);
                    setLoteManual(false);
                    setNewColetaForm(p => ({ ...p, lote_insumo: lote ? textoDoLote(lote) : '' }));
                  }}
                >
                  <SelectTrigger id="coleta-lote_escolha"><SelectValue placeholder={lotesQuery.isLoading ? 'Carregando lotes…' : 'Selecione o lote'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Não informado</SelectItem>
                    {(lotesQuery.data ?? []).map(item => (
                      <SelectItem key={item.id} value={item.id}>{textoDoLote(item)} · saldo {item.quantidade}{item.unidade ? ` ${item.unidade}` : ''}{item.validade ? ` · val. ${item.validade.split('-').reverse().join('/')}` : ''}</SelectItem>
                    ))}
                    <SelectItem value="__outro__">Outro lote (digitar)</SelectItem>
                  </SelectContent>
                </Select>
                {lotesQuery.isError && <p className="text-xs text-muted-foreground">Não foi possível carregar os lotes; digite o lote abaixo.</p>}
                {!loteId && (loteManual || lotesQuery.isError) && (
                  <Input id="coleta-lote_insumo" aria-label="Lote do insumo digitado" value={newColetaForm.lote_insumo}
                    onChange={e => setNewColetaForm(p => ({ ...p, lote_insumo: e.target.value }))}
                    placeholder="Ex: LOT-2026-03-ABC123" />
                )}
              </div>
            </div>

            {/* Dados da solicitação */}
            <div className="border-y py-5 space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />Dados da Solicitação
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="coleta-convenio_id" className="text-xs font-medium">Convênio</Label>
                  {conveniosQuery.isError ? (
                    <ErrorState compact description="Não foi possível carregar os convênios" error={conveniosQuery.error} onRetry={() => void conveniosQuery.refetch()} />
                  ) : (
                    <Select value={newColetaForm.convenio_id || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, convenio_id: v === '__none__' ? '' : v }))} disabled={conveniosQuery.isLoading}>
                      <SelectTrigger id="coleta-convenio_id" aria-label="Convênio"><SelectValue placeholder={conveniosQuery.isLoading ? 'Carregando…' : 'Particular'} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Particular</SelectItem>
                        {convenios?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome} ({c.codigo})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="coleta-numero_guia" className="text-xs font-medium">Nº da Guia</Label>
                  <Input id="coleta-numero_guia" aria-label="Número da guia" value={newColetaForm.numero_guia}
                    onChange={e => setNewColetaForm(p => ({ ...p, numero_guia: e.target.value }))}
                    placeholder="Ex: 2600015029" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="coleta-cid" className="text-xs font-medium">CID-10</Label>
                  <Input id="coleta-cid" aria-label="CID-10" value={newColetaForm.cid}
                    onChange={e => setNewColetaForm(p => ({ ...p, cid: e.target.value }))}
                    placeholder="Ex: E11, D50" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="coleta-procedimento_codigo" className="text-xs font-medium">Código do Procedimento</Label>
                  <Input id="coleta-procedimento_codigo" aria-label="Código do procedimento" value={newColetaForm.procedimento_codigo}
                    onChange={e => setNewColetaForm(p => ({ ...p, procedimento_codigo: e.target.value.toUpperCase() }))}
                    placeholder="Ex: COL, HDL, HEM" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="coleta-grupo" className="text-xs font-medium">Grupo</Label>
                  <Input id="coleta-grupo" aria-label="Grupo" value={newColetaForm.grupo}
                    onChange={e => setNewColetaForm(p => ({ ...p, grupo: e.target.value.toUpperCase() }))}
                    placeholder="Ex: CTF, HEM" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="coleta-material" className="text-xs font-medium">Material</Label>
                  <Select value={newColetaForm.material || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, material: v === '__none__' ? '' : v }))}>
                    <SelectTrigger id="coleta-material" aria-label="Material"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Não informado</SelectItem>
                      <SelectItem value="SORO">Soro</SelectItem>
                      <SelectItem value="PLASMA">Plasma</SelectItem>
                      <SelectItem value="SANGUE_TOTAL">Sangue Total</SelectItem>
                      <SelectItem value="URINA">Urina</SelectItem>
                      <SelectItem value="FEZES">Fezes</SelectItem>
                      <SelectItem value="LIQUOR">Líquor</SelectItem>
                      <SelectItem value="ESCARRO">Escarro</SelectItem>
                      <SelectItem value="SECRECAO">Secreção</SelectItem>
                      <SelectItem value="SWAB">Swab</SelectItem>
                      <SelectItem value="OUTRO">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="coleta-trouxe_material" aria-label="Trouxe material" checked={newColetaForm.trouxe_material} onCheckedChange={v => setNewColetaForm(p => ({ ...p, trouxe_material: !!v }))} />
                <Label htmlFor="coleta-trouxe_material" className="text-sm flex items-center gap-1"><Package className="h-3.5 w-3.5" />Trouxe Material</Label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coleta-setor_id" className="text-xs font-medium">Setor responsável</Label>
                {setoresQuery.isError && <ErrorState compact description="Não foi possível carregar os setores. Atualize a lista antes de registrar a coleta." onRetry={() => void setoresQuery.refetch()} />}
                <Select disabled={setoresQuery.isLoading || setoresQuery.isError} value={newColetaForm.setor_id || '__none__'} onValueChange={value => setNewColetaForm(p => ({ ...p, setor_id: value === '__none__' ? '' : value }))}>
                  <SelectTrigger id="coleta-setor_id" aria-label="Setor responsável"><SelectValue placeholder="Sem setor definido" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">Sem setor definido</SelectItem>{(setoresQuery.data ?? []).map(setor => <SelectItem key={setor.id} value={setor.id}>{setor.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Vincular a Exame */}
            <div className="space-y-1.5">
              <Label htmlFor="coleta-exame_id" className="text-xs font-medium flex items-center gap-1"><Link2 className="h-3 w-3" />Vincular a Pedido de Exame</Label>
              {!newColetaForm.paciente_id ? (
                <p className="text-xs text-muted-foreground">Selecione o paciente para localizar os pedidos em aberto.</p>
              ) : examesPendentesQuery.isLoading ? (
                <p role="status" className="text-xs text-muted-foreground">Buscando pedidos de exame do paciente…</p>
              ) : examesPendentesQuery.isError ? (
                <ErrorState compact description="Não foi possível carregar os pedidos deste paciente" error={examesPendentesQuery.error} onRetry={() => void examesPendentesQuery.refetch()} />
              ) : (
                <>
                  <Select value={newColetaForm.exame_id || '__none__'} onValueChange={v => { const exame = examesFiltrados.find((item: any) => item.id === v); const catalogo = Array.isArray(exame?.tipo_exames_catalog) ? exame.tipo_exames_catalog[0] : exame?.tipo_exames_catalog; setNewColetaForm(p => ({ ...p, exame_id: v === '__none__' ? '' : v, setor_id: v === '__none__' ? p.setor_id : (catalogo?.setor_id || p.setor_id) })); }} disabled={examesFiltrados.length === 0}>
                    <SelectTrigger id="coleta-exame_id" aria-label="Pedido de exame"><SelectValue placeholder={examesFiltrados.length ? 'Opcional' : 'Nenhum pedido em aberto'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhum (coleta avulsa)</SelectItem>
                      {examesFiltrados.map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.tipo_exame} — {(e as any).pacientes?.nome || ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {examesPendentesQuery.data?.hasMore && (
                    <p role="status" className="text-xs text-warning-foreground">A lista atingiu 200 pedidos em aberto; os mais antigos podem não aparecer neste seletor.</p>
                  )}
                </>
              )}
            </div>

            {/* Finalidade + Categoria do Exame */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="coleta-finalidade" className="text-xs font-medium flex items-center gap-1"><FileText className="h-3 w-3" />Para quê é o exame? *</Label>
                <Select value={newColetaForm.finalidade} onValueChange={v => setNewColetaForm(p => ({ ...p, finalidade: v }))}>
                  <SelectTrigger id="coleta-finalidade" aria-label="Finalidade"><SelectValue placeholder="Finalidade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diagnostico">Diagnóstico</SelectItem>
                    <SelectItem value="checkup">Check-up / Rotina</SelectItem>
                    <SelectItem value="pre_operatorio">Pré-operatório</SelectItem>
                    <SelectItem value="acompanhamento">Acompanhamento de tratamento</SelectItem>
                    <SelectItem value="controle">Controle periódico</SelectItem>
                    <SelectItem value="urgencia">Urgência / Emergência</SelectItem>
                    <SelectItem value="pre_natal">Pré-natal</SelectItem>
                    <SelectItem value="admissional">Admissional / Periódico</SelectItem>
                    <SelectItem value="retorno">Retorno / Reavaliação</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coleta-categoria_exame" className="text-xs font-medium">Categoria do Exame</Label>
                <Select value={newColetaForm.categoria_exame || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, categoria_exame: v === '__none__' ? '' : v }))}>
                  <SelectTrigger id="coleta-categoria_exame" aria-label="Categoria do exame"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Não informado</SelectItem>
                    <SelectItem value="hematologia">Hematologia</SelectItem>
                    <SelectItem value="bioquimica">Bioquímica</SelectItem>
                    <SelectItem value="hormonal">Hormonal</SelectItem>
                    <SelectItem value="imunologia">Imunologia / Sorologia</SelectItem>
                    <SelectItem value="microbiologia">Microbiologia</SelectItem>
                    <SelectItem value="urinanalise">Urinálise</SelectItem>
                    <SelectItem value="coagulacao">Coagulação</SelectItem>
                    <SelectItem value="parasitologia">Parasitologia</SelectItem>
                    <SelectItem value="toxicologia">Toxicologia</SelectItem>
                    <SelectItem value="genetica">Genética / Molecular</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Indicação Clínica */}
            <div className="space-y-1.5">
              <Label htmlFor="coleta-indicacao_clinica" className="text-xs font-medium">Indicação Clínica</Label>
              <Input id="coleta-indicacao_clinica" aria-label="Indicação clínica" value={newColetaForm.indicacao_clinica}
                onChange={e => setNewColetaForm(p => ({ ...p, indicacao_clinica: e.target.value }))}
                placeholder="Ex: Suspeita de anemia, controle glicêmico, investigação tireoidiana..." />
            </div>

            <Separator />

            {/* Data/Hora + Profissional */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="coleta-data_coleta" className="text-xs font-medium flex items-center gap-1"><Clock className="h-3 w-3" />Data e Hora da Coleta (horário da clínica)</Label>
                <Input id="coleta-data_coleta" aria-label="Data e hora da coleta" type="datetime-local" value={newColetaForm.data_coleta}
                  onChange={e => setNewColetaForm(p => ({ ...p, data_coleta: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coleta-coletado_por" className="text-xs font-medium flex items-center gap-1"><User className="h-3 w-3" />Profissional</Label>
                {funcionariosQuery.isError ? (
                  <ErrorState compact description="Não foi possível carregar os profissionais" error={funcionariosQuery.error} onRetry={() => void funcionariosQuery.refetch()} />
                ) : (
                  <Select value={newColetaForm.coletado_por || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, coletado_por: v === '__none__' ? '' : v }))} disabled={funcionariosQuery.isLoading}>
                    <SelectTrigger id="coleta-coletado_por" aria-label="Profissional"><SelectValue placeholder={funcionariosQuery.isLoading ? 'Carregando…' : 'Quem realizou'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Não informado</SelectItem>
                      {funcionarios?.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <Separator />

            {/* Amostra */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="coleta-tipo_amostra" className="text-xs">Tipo de Amostra</Label>
                <Select value={newColetaForm.tipo_amostra} onValueChange={v => setNewColetaForm(p => ({ ...p, tipo_amostra: v }))}>
                  <SelectTrigger id="coleta-tipo_amostra" aria-label="Tipo de amostra"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['sangue', 'urina', 'fezes', 'escarro', 'secreção', 'líquor', 'outro'].map(t => (
                      <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coleta-tubo" className="text-xs">Tubo</Label>
                <Select value={newColetaForm.tubo || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, tubo: v === '__none__' ? '' : v }))}>
                  <SelectTrigger id="coleta-tubo" aria-label="Tubo"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione</SelectItem>
                    {TUBOS.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        <span className="flex items-center gap-2">
                          <span className={`h-3 w-2 rounded-sm ${t.color}`} />{t.value}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coleta-volume_ml" className="text-xs flex items-center gap-1"><Droplets className="h-3 w-3" />Volume (mL)</Label>
                <Input id="coleta-volume_ml" aria-label="Volume (mL)" type="number" step="0.1" min="0" value={newColetaForm.volume_ml}
                  onChange={e => setNewColetaForm(p => ({ ...p, volume_ml: e.target.value }))} placeholder="Ex: 5" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coleta-sitio_coleta" className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3" />Sítio de Coleta</Label>
                <Select value={newColetaForm.sitio_coleta || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, sitio_coleta: v === '__none__' ? '' : v }))}>
                  <SelectTrigger id="coleta-sitio_coleta" aria-label="Sítio de coleta"><SelectValue placeholder="Local" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Não informado</SelectItem>
                    {SITIOS_COLETA.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Condições */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Condições da Amostra</Label>
              <div className="flex flex-wrap gap-3">
                {CONDICOES_AMOSTRA.map(cond => (
                  <div key={cond} className="flex items-center gap-1.5">
                    <Checkbox id={`cond-${cond}`} checked={newColetaForm.condicao_amostra.includes(cond)}
                      onCheckedChange={() => toggleCondicao(cond)} />
                    <Label htmlFor={`cond-${cond}`} className="text-xs cursor-pointer">{cond}</Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Jejum + Urgência */}
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <Checkbox id="coleta-jejum_necessario" aria-label="Jejum necessário" checked={newColetaForm.jejum_necessario} onCheckedChange={v => setNewColetaForm(p => ({ ...p, jejum_necessario: !!v }))} />
                <Label htmlFor="coleta-jejum_necessario" className="text-sm">Jejum necessário</Label>
              </div>
              {newColetaForm.jejum_necessario && (
                <div className="flex items-center gap-2">
                  <Input id="coleta-jejum_horas" aria-label="Horas de jejum" type="number" className="w-20" value={newColetaForm.jejum_horas}
                    onChange={e => setNewColetaForm(p => ({ ...p, jejum_horas: +e.target.value }))} />
                  <span className="text-sm text-muted-foreground">horas</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Checkbox id="coleta-urgente" aria-label="Urgente" checked={newColetaForm.urgente} onCheckedChange={v => setNewColetaForm(p => ({ ...p, urgente: !!v }))} />
                <Label htmlFor="coleta-urgente" className="text-sm text-warning-foreground font-medium">Urgente</Label>
              </div>
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label htmlFor="coleta-observacoes" className="text-xs">Observações</Label>
              <Textarea id="coleta-observacoes" aria-label="Observações" value={newColetaForm.observacoes} onChange={e => setNewColetaForm(p => ({ ...p, observacoes: e.target.value }))}
                placeholder="Instruções especiais..." rows={2} />
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t pt-4 scroll-mb-24">
              <span role="status" className="mr-auto w-full text-xs text-muted-foreground sm:w-auto">{createColeta.isPending ? 'Registrando coleta…' : dirty ? 'Alterações não salvas' : 'Sem alterações'}</span>
              <Button type="button" variant="outline" onClick={back}>Cancelar</Button>
              <Button type="submit" disabled={!newColetaForm.paciente_id || createColeta.isPending} className="gap-1">
                {createColeta.isPending && <Clock className="h-4 w-4 animate-spin" />}
                <TestTube className="h-4 w-4" />Registrar Coleta
              </Button>
            </div>
            </fieldset>
          </form>
    </div>
  </div>;
}
