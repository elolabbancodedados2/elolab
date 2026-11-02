import { useState, useMemo, useRef } from 'react';
import { Plus, Search, Clock, Phone, CheckCircle, XCircle, AlertTriangle, Users, Bell, MessageCircle, CalendarPlus, RefreshCw, X, Hourglass } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { compararPorPrioridade, getPrioridadeListaEspera } from '@/lib/listaEsperaPrioridade';
import { especialidadeAtende, especialidadesCadastradas } from '@/lib/waitingListSlotCompatibility';
import { buscarVagas, type VagaEncontrada } from '@/lib/buscaVaga';
import { minutosAgoraSaoPaulo } from '@/lib/proximaVagaLivre';
import { mensagemDeErro } from '@/lib/erros';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { LoadingButton } from '@/components/ui/loading-button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, differenceInCalendarDays } from 'date-fns';
import { useMedicos } from '@/hooks/useSupabaseData';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { ErrorState } from '@/components/ErrorState';
import { linkWhatsApp } from '@/lib/whatsapp';
import { nomeMedico } from '@/lib/formatters';

const STATUS_COLORS: Record<string, string> = {
  aguardando: 'border-warning/40 bg-warning/10 text-warning-foreground',
  notificado: 'border-primary/30 bg-primary/10 text-primary',
  confirmado: 'border-success/30 bg-success/10 text-success',
  agendado: 'border-transparent bg-primary text-primary-foreground',
  desistiu: 'border-border bg-muted text-muted-foreground',
};

const PREFERENCIA_LABELS: Record<string, string> = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };

type OrdenacaoEspera = 'prioridade' | 'mais_antigos' | 'mais_recentes';

const STATUS_LABELS: Record<string, string> = {
  aguardando: 'Aguardando',
  notificado: 'Notificado',
  confirmado: 'Confirmado',
  agendado: 'Agendado',
  desistiu: 'Desistiu',
};

const STATUS_ATIVOS = ['aguardando', 'notificado', 'confirmado'];
const LIMITE_HISTORICO = 500;

// Usada só quando nenhum profissional ativo tem especialidade cadastrada.
const ESPECIALIDADES_PADRAO = [
  'Clínico Geral',
  'Cardiologia',
  'Dermatologia',
  'Endocrinologia',
  'Gastroenterologia',
  'Ginecologia',
  'Neurologia',
  'Oftalmologia',
  'Ortopedia',
  'Pediatria',
  'Psiquiatria',
  'Urologia',
];

interface FormData {
  paciente_id: string;
  medico_id: string;
  especialidade: string;
  prioridade: string;
  motivo: string;
  preferencia_horario: string;
  observacoes: string;
}

const initialFormData: FormData = {
  paciente_id: '',
  medico_id: '',
  especialidade: '',
  prioridade: 'normal',
  motivo: '',
  preferencia_horario: '',
  observacoes: '',
};

export default function ListaEspera({ creationPage = false }: { creationPage?: boolean }) {
  const location = useLocation();
  return <ListaEsperaWorkspace key={location.pathname} creationPage={creationPage} />;
}

function ListaEsperaWorkspace({ creationPage }: { creationPage: boolean }) {
  const location = useLocation();
  const completed = useRef(false);
  const saveLock = useRef(false);
  const returnTo = typeof location.state?.returnTo === 'string' && /^\/gestao-fluxo(?:\?|$)/.test(location.state.returnTo) ? location.state.returnTo : '/gestao-fluxo?tab=espera';
  const leaveForm = () => navigate(returnTo, { state: { waitingFilters: location.state?.waitingFilters } });
  const [searchTerm, setSearchTerm] = useState(location.state?.waitingFilters?.search ?? '');
  const [statusFilter, setStatusFilter] = useState(location.state?.waitingFilters?.status ?? 'aguardando');
  const [prioridadeFilter, setPrioridadeFilter] = useState<'todas' | 'urgente' | 'preferencial' | 'normal'>(location.state?.waitingFilters?.priority ?? 'todas');
  const [ordenacao, setOrdenacao] = useState<OrdenacaoEspera>(location.state?.waitingFilters?.order ?? 'prioridade');
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [desistindo, setDesistindo] = useState<{ id: string; nome: string; status: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { user, profile, hasAnyRole } = useSupabaseAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const medicosQuery = useMedicos();
  const { data: medicos = [], isLoading: loadingMedicos } = medicosQuery;

  // Pedidos ativos vêm sempre; o histórico (agendados, desistências) só é
  // buscado quando o filtro pede, do mais recente para o mais antigo.
  const listaQuery = useQuery({
    queryKey: ['lista_espera', user?.id ?? null, profile?.clinica_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lista_espera')
        .select('*, pacientes(nome, nome_social, cpf, telefone, email), medicos(nome, crm, especialidade)')
        .eq('clinica_id', profile?.clinica_id ?? '')
        .or(`status.is.null,status.in.(${STATUS_ATIVOS.join(',')})`)
        .order('data_cadastro', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!user && !!profile?.clinica_id && !creationPage,
  });
  const precisaHistorico = !STATUS_ATIVOS.includes(statusFilter);
  const historicoQuery = useQuery({
    queryKey: ['lista_espera', 'historico', user?.id ?? null, profile?.clinica_id ?? null, statusFilter],
    queryFn: async () => {
      let consulta = supabase
        .from('lista_espera')
        .select('*, pacientes(nome, nome_social, cpf, telefone, email), medicos(nome, crm, especialidade)')
        .eq('clinica_id', profile?.clinica_id ?? '');
      consulta = statusFilter === 'todos'
        ? consulta.not('status', 'in', `(${STATUS_ATIVOS.join(',')})`)
        : consulta.eq('status', statusFilter);
      const { data, error } = await consulta
        .order('data_cadastro', { ascending: false })
        .limit(LIMITE_HISTORICO);
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!profile?.clinica_id && !creationPage && precisaHistorico,
  });
  const lista = useMemo(
    () => [...(listaQuery.data ?? []), ...(precisaHistorico ? historicoQuery.data ?? [] : [])],
    [listaQuery.data, historicoQuery.data, precisaHistorico],
  );
  const podeRemoverPermanentemente = hasAnyRole(['admin']);

  const isLoading = listaQuery.isLoading || loadingMedicos;

  const diasDeEspera = (dataCadastro: string | null) => {
    if (!dataCadastro) return 0;
    const data = parseDateOnly(dataCadastro);
    return data ? Math.max(0, differenceInCalendarDays(parseDateOnly(todaySaoPauloDateOnly())!, data)) : 0;
  };

  // As especialidades dos profissionais da clínica, não uma lista fixa.
  const especialidades = useMemo(() => {
    const cadastradas = especialidadesCadastradas(medicos as any[]);
    const base = cadastradas.length ? cadastradas : ESPECIALIDADES_PADRAO;
    return formData.especialidade && !base.includes(formData.especialidade) ? [formData.especialidade, ...base] : base;
  }, [medicos, formData.especialidade]);

  // "Encontrar vaga": próxima vaga do médico pedido ou de quem atende a especialidade.
  const [vagas, setVagas] = useState<Record<string, { carregando: boolean; vaga?: VagaEncontrada | null; erro?: string }>>({});
  const encontrarVaga = async (item: any) => {
    if (!profile?.clinica_id) return;
    const candidatos = (medicos as any[]).filter(m => m.ativo !== false && (
      item.medico_id ? m.id === item.medico_id : especialidadeAtende(m.especialidade, item.especialidade)
    ));
    setVagas(atual => ({ ...atual, [item.id]: { carregando: true } }));
    try {
      const encontradas = await buscarVagas({
        clinicaId: profile.clinica_id,
        medicos: candidatos.slice(0, 12),
        hoje: todaySaoPauloDateOnly(),
        agoraMinutos: minutosAgoraSaoPaulo(),
        dias: 30,
        periodo: item.preferencia_horario,
      });
      setVagas(atual => ({ ...atual, [item.id]: { carregando: false, vaga: encontradas[0] ?? null } }));
    } catch (error) {
      setVagas(atual => ({ ...atual, [item.id]: { carregando: false, erro: mensagemDeErro(error) } }));
    }
  };
  const agendarPedido = (item: any) => navigate(`/agenda?espera=${encodeURIComponent(item.id)}&paciente=${encodeURIComponent(item.paciente_id)}`);

  const filteredLista = useMemo(() => {
    const filtrada = lista.filter(item => {
      const paciente = (item as any).pacientes;
      const matchesSearch = pacienteCorresponde(paciente || {}, searchTerm);
      const matchesStatus = statusFilter === 'todos' || item.status === statusFilter;
      const prioridade = getPrioridadeListaEspera(item.prioridade).value ?? 'normal';
      const matchesPrioridade = prioridadeFilter === 'todas' || prioridade === prioridadeFilter;
      return matchesSearch && matchesStatus && matchesPrioridade;
    });
    const ordenada = [...filtrada];
    if (ordenacao === 'prioridade') ordenada.sort(compararPorPrioridade);
    else if (ordenacao === 'mais_antigos') ordenada.sort((a, b) => String(a.data_cadastro ?? '').localeCompare(String(b.data_cadastro ?? '')));
    else ordenada.sort((a, b) => String(b.data_cadastro ?? '').localeCompare(String(a.data_cadastro ?? '')));
    return ordenada;
  }, [lista, searchTerm, statusFilter, prioridadeFilter, ordenacao]);

  const ativos = useMemo(() => lista.filter(i => ['aguardando', 'notificado', 'confirmado'].includes(i.status || 'aguardando')), [lista]);
  const aguardando = useMemo(() => lista.filter(i => (i.status || 'aguardando') === 'aguardando'), [lista]);
  const proximoAChamar = useMemo(() => [...aguardando].sort(compararPorPrioridade)[0] ?? null, [aguardando]);
  const acimaDeTrintaDias = useMemo(() => ativos.filter(i => diasDeEspera(i.data_cadastro) > 30).length, [ativos]);
  const urgentesAtivos = ativos.filter(i => getPrioridadeListaEspera(i.prioridade).value === 'urgente').length;
  const temFiltro = searchTerm.trim() !== '' || statusFilter !== 'aguardando' || prioridadeFilter !== 'todas';
  const limparFiltros = () => { setSearchTerm(''); setStatusFilter('aguardando'); setPrioridadeFilter('todas'); };

  const mensagemWhatsApp = (nome: string, especialidade: string | null) =>
    `Olá, ${nome}! Aqui é da clínica. Surgiu uma vaga${especialidade ? ` em ${especialidade}` : ''} e você está na nossa lista de espera. Podemos agendar?`;

  const handleOpenNew = () => navigate('/gestao-fluxo/espera/nova', { state: { returnTo: location.pathname + location.search, waitingFilters: { search: searchTerm, status: statusFilter, priority: prioridadeFilter, order: ordenacao } } });

  const handleSave = async () => {
    if (saveLock.current) return;
    if (!formData.paciente_id || !formData.especialidade) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a página e tente novamente.');
      return;
    }

    saveLock.current = true;
    setIsSubmitting(true);
    try {
      let duplicadoQuery = supabase.from('lista_espera')
        .select('id, status')
        .eq('clinica_id', profile.clinica_id)
        .eq('paciente_id', formData.paciente_id)
        .eq('especialidade', formData.especialidade)
        .in('status', ['aguardando', 'notificado', 'confirmado']);
      duplicadoQuery = formData.medico_id
        ? duplicadoQuery.eq('medico_id', formData.medico_id)
        : duplicadoQuery.is('medico_id', null);
      const { data: existente, error: erroDuplicado } = await duplicadoQuery.limit(1).maybeSingle();
      if (erroDuplicado) throw erroDuplicado;
      if (existente) {
        toast.error('Este pedido já está na lista de espera.', {
          description: `Encontre a inscrição existente no filtro “Todos” (status: ${STATUS_LABELS[existente.status] || existente.status}).`,
        });
        return;
      }

      const { error } = await supabase.from('lista_espera').insert({
        paciente_id: formData.paciente_id,
        medico_id: formData.medico_id || null,
        especialidade: formData.especialidade,
        prioridade: formData.prioridade,
        motivo: formData.motivo || null,
        preferencia_horario: formData.preferencia_horario || null,
        observacoes: formData.observacoes || null,
        status: 'aguardando',
        data_cadastro: todaySaoPauloDateOnly(),
        clinica_id: profile.clinica_id,
      });

      if (error) throw error;
      
      toast.success('Paciente adicionado à lista de espera!');
      queryClient.invalidateQueries({ queryKey: ['lista_espera'] });
      completed.current = true;
      leaveForm();
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Erro ao adicionar:', error);
      if (error?.code === '23505' && (
        error?.constraint === 'lista_espera_pedido_ativo_unico' ||
        String(error?.message || '').includes('já está na lista de espera')
      )) {
        void queryClient.invalidateQueries({ queryKey: ['lista_espera'] });
        toast.error('Este pedido já está na lista de espera.', {
          description: 'Outro usuário adicionou o mesmo pedido agora. A lista será atualizada para você localizá-lo.',
        });
      } else {
        toast.error(error.message || 'Erro ao adicionar à lista');
      }
    } finally {
      saveLock.current = false;
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, expectedStatus: string, newStatus: string) => {
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a página e tente novamente.');
      return;
    }
    if (updatingId) return;
    const transicoesPermitidas: Record<string, string[]> = {
      aguardando: ['notificado', 'desistiu'],
      notificado: ['confirmado', 'desistiu'],
      confirmado: ['desistiu'],
    };
    if (!transicoesPermitidas[expectedStatus]?.includes(newStatus)) {
      toast.error('Esta mudança de status não é permitida. Atualize a lista e tente novamente.');
      return;
    }
    setUpdatingId(id);
    try {
      const { data: atualizado, error } = await supabase
        .from('lista_espera')
        .update({ status: newStatus })
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id)
        .eq('status', expectedStatus)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!atualizado) throw new Error('O status foi alterado por outro fluxo. Atualize a lista antes de tentar novamente.');
      
      toast.success('Status atualizado!');
      queryClient.invalidateQueries({ queryKey: ['lista_espera'] });
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Erro ao atualizar:', error);
      toast.error(error.message || 'Erro ao atualizar status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemove = async (id: string) => {
    if (isRemoving) return;
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a página e tente novamente.');
      return;
    }
    setIsRemoving(true);
    try {
      const { data: removido, error } = await supabase
        .from('lista_espera')
        .delete()
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!removido) throw new Error('Este registro não existe mais ou você não tem permissão para removê-lo.');
      
      toast.success('Removido da lista de espera!');
      queryClient.invalidateQueries({ queryKey: ['lista_espera'] });
      setRemoveId(null);
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Erro ao remover:', error);
      toast.error(error.message || 'Erro ao remover');
    } finally {
      setIsRemoving(false);
    }
  };

  const getPacienteInfo = (item: any) => {
    const paciente = item.pacientes;
    return {
      nome: paciente?.nome_social || paciente?.nome || 'Desconhecido',
      telefone: paciente?.telefone || '-',
    };
  };

  const getDiasEspera = diasDeEspera;

  // Mesmas ações na tabela (desktop) e nas fichas (celular).
  const acoesDoPedido = (item: any, nome: string, whatsapp: string | null, encerrado: boolean) => {
    const ativo = ['aguardando', 'notificado', 'confirmado'].includes(item.status || 'aguardando');
    const busca = vagas[item.id];
    return (
      <div className="flex flex-col items-stretch gap-1.5 md:items-end">
        <div className="flex flex-wrap items-center justify-end gap-1">
          {whatsapp && !encerrado && (
            <Button aria-label={`Chamar ${nome} no WhatsApp`} asChild variant="ghost" size="icon" className="h-11 w-11 rounded-full md:h-9 md:w-9">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Chamar ${nome} no WhatsApp`} title="Chamar no WhatsApp">
                <MessageCircle className="h-4 w-4" />
              </a>
            </Button>
          )}
          {item.status === 'aguardando' && (
            <Button
              variant="outline"
              size="sm"
              className="h-11 rounded-full text-xs md:h-9"
              title="Registra o contato manual; esta ação não envia mensagem."
              onClick={() => handleUpdateStatus(item.id, item.status || 'aguardando', 'notificado')}
              disabled={updatingId !== null}
            >
              {updatingId === item.id ? 'Salvando...' : 'Registrar contato'}
            </Button>
          )}
          {item.status === 'notificado' && (
            <Button
              variant="outline"
              size="sm"
              className="h-11 rounded-full text-xs md:h-9"
              onClick={() => handleUpdateStatus(item.id, item.status || 'aguardando', 'confirmado')}
              disabled={updatingId !== null}
            >
              {updatingId === item.id ? 'Salvando...' : 'Confirmar'}
            </Button>
          )}
          {ativo && (
            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-1 rounded-full text-xs md:h-9"
              onClick={() => void encontrarVaga(item)}
              disabled={busca?.carregando}
              title="Procura a próxima vaga do médico pedido ou da especialidade, no período preferido."
            >
              <Search aria-hidden="true" className="h-3.5 w-3.5" /> {busca?.carregando ? 'Procurando…' : 'Encontrar vaga'}
            </Button>
          )}
          {/* Agendar em qualquer status ativo: antes exigia contato e confirmação (três cliques). */}
          {ativo && (
            <Button
              size="sm"
              className="h-11 gap-1 rounded-full text-xs md:h-9"
              onClick={() => agendarPedido(item)}
              disabled={updatingId !== null}
              title="Abre a agenda para criar a consulta; o status só muda após salvar."
            >
              <CalendarPlus aria-hidden="true" className="h-3.5 w-3.5" /> Agendar
            </Button>
          )}
          {ativo && (
            <Button
              aria-label={`Marcar ${nome} como desistente`}
              title={`Marcar ${nome} como desistente`}
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-full text-muted-foreground md:h-9 md:w-9"
              onClick={() => setDesistindo({ id: item.id, nome, status: item.status || 'aguardando' })}
              disabled={isRemoving || updatingId !== null}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          )}
          {podeRemoverPermanentemente && <Button
            aria-label={`Remover ${nome} permanentemente da lista de espera`}
            title={`Remover ${nome} permanentemente`}
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full md:h-9 md:w-9"
            onClick={() => setRemoveId(item.id)}
            disabled={isRemoving || updatingId !== null}
          >
            <XCircle className="h-4 w-4 text-destructive" />
          </Button>}
        </div>
        {busca && !busca.carregando && (
          <p role="status" className="text-xs text-muted-foreground">
            {busca.erro ? `Não foi possível procurar: ${busca.erro}`
              : busca.vaga ? (
                <>
                  Vaga: <span className="font-semibold text-foreground">{busca.vaga.data.split('-').reverse().join('/')} às {busca.vaga.hora_inicio}</span>
                  {' com '}{nomeMedico((medicos as any[]).find(m => m.id === busca.vaga!.medico_id)?.nome || '')}
                  {' · '}
                  <button type="button" className="font-semibold text-foreground underline underline-offset-2" onClick={() => navigate(`/agenda?data=${busca.vaga!.data}&view=daily`)}>ver na agenda</button>
                </>
              ) : 'Sem vaga nos próximos 30 dias para este pedido.'}
          </p>
        )}
      </div>
    );
  };

  if (isLoading && !creationPage) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (listaQuery.isError && !creationPage) {
    return <ErrorState title="Não foi possível carregar a lista de espera" error={listaQuery.error} onRetry={() => void listaQuery.refetch()} />;
  }
  if (medicosQuery.isError && !creationPage) {
    return <ErrorState title="Não foi possível carregar os médicos para a lista de espera" error={medicosQuery.error} onRetry={() => void medicosQuery.refetch()} />;
  }

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      <UnsavedChangesGuard dirty={creationPage && JSON.stringify(formData) !== JSON.stringify(initialFormData)} busy={isSubmitting} completed={completed} />
      {creationPage && <Button variant="outline" onClick={leaveForm}>Voltar à lista de espera</Button>}
      {!creationPage && <>
      <PageHeader
        title="Lista de Espera"
        description={ativos.length > 0
          ? `${ativos.length} pedido${ativos.length === 1 ? '' : 's'} ativo${ativos.length === 1 ? '' : 's'}${urgentesAtivos > 0 ? ` · ${urgentesAtivos} urgente${urgentesAtivos === 1 ? '' : 's'}` : ''}${acimaDeTrintaDias > 0 ? ` · ${acimaDeTrintaDias} acima de 30 dias` : ''}`
          : 'Gerencie pacientes aguardando agendamento'}
        icon={<Clock />}
        actions={(
          <>
            <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={() => void listaQuery.refetch()} aria-label="Atualizar lista de espera" title="Atualizar lista">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={handleOpenNew} className="shrink-0 gap-2 rounded-full">
              <Plus className="h-4 w-4" />
              Adicionar à Lista
            </Button>
          </>
        )}
      />

      {/* Indicadores */}
      <section role="group" aria-label="Resumo da lista de espera" className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {([
          { key: 'aguardando', icon: Clock, label: 'Aguardando', value: aguardando.length, caption: 'ainda sem contato', color: 'text-foreground', surface: 'bg-secondary', escuro: false },
          { key: 'notificado', icon: Phone, label: 'Notificados', value: lista.filter(i => i.status === 'notificado').length, caption: 'aguardando resposta', color: 'text-primary', surface: 'bg-primary/10', escuro: false },
          { key: 'confirmado', icon: CheckCircle, label: 'Confirmados', value: lista.filter(i => i.status === 'confirmado').length, caption: 'prontos para agendar', color: 'text-success', surface: 'bg-success/10', escuro: false },
          { key: 'agendado', icon: CalendarPlus, label: 'Agendados', value: precisaHistorico && historicoQuery.data ? lista.filter(i => i.status === 'agendado').length : '—', caption: precisaHistorico && historicoQuery.data ? `${lista.length} no total` : 'toque para ver o histórico', color: 'text-foreground', surface: 'bg-muted', escuro: false },
        ]).map(s => {
          const Icon = s.icon;
          const ativo = statusFilter === s.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={ativo}
              onClick={() => setStatusFilter(ativo ? 'todos' : s.key)}
              className={cn(
                'rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
                    <h3 className={cn('text-xs font-semibold leading-tight', s.escuro ? 'text-primary-foreground/90' : 'text-foreground')}>{s.label}</h3>
                    <span className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</span>
                  </div>
                  <p className={cn('text-[11px] leading-snug', s.escuro ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{s.caption}</p>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {/* Próximo a chamar */}
      {proximoAChamar && (() => {
        const info = getPacienteInfo(proximoAChamar);
        const dias = getDiasEspera(proximoAChamar.data_cadastro);
        const prioridade = getPrioridadeListaEspera(proximoAChamar.prioridade);
        const whatsapp = linkWhatsApp(info.telefone, mensagemWhatsApp(info.nome.split(' ')[0], proximoAChamar.especialidade));
        const medicoPref = (proximoAChamar as any).medicos;
        return (
          <Card className="overflow-hidden rounded-2xl border-primary/30 shadow-xs">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
                  <Bell className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Próximo a chamar</p>
                  <h2 className="truncate text-lg font-bold text-foreground">{info.nome}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{proximoAChamar.especialidade || 'Sem especialidade'}</span>
                    {medicoPref && <span>{nomeMedico(medicoPref.nome || medicoPref.crm)}</span>}
                    {proximoAChamar.preferencia_horario && <span>Prefere: {PREFERENCIA_LABELS[proximoAChamar.preferencia_horario] ?? proximoAChamar.preferencia_horario}</span>}
                    <span className={cn('inline-flex items-center gap-1 font-medium', dias > 30 ? 'text-destructive' : dias > 14 ? 'text-warning-foreground' : '')}>
                      <Hourglass aria-hidden="true" className="h-3 w-3" /> {dias} dia{dias === 1 ? '' : 's'} na lista
                    </span>
                    <Badge variant="outline" className={cn('rounded-full text-[10px]', prioridade.className)}>{prioridade.label}</Badge>
                  </div>
                  {proximoAChamar.motivo && <p className="mt-1 truncate text-xs text-muted-foreground" title={proximoAChamar.motivo}>Motivo: {proximoAChamar.motivo}</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {whatsapp ? (
                  <Button asChild variant="outline" className="h-10 gap-1.5 rounded-full border-primary/30 text-primary hover:bg-primary/10 hover:text-primary">
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" className="h-4 w-4" /> WhatsApp</a>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Sem telefone válido</span>
                )}
                <Button
                  className="h-10 gap-1.5 rounded-full"
                  onClick={() => handleUpdateStatus(proximoAChamar.id, proximoAChamar.status || 'aguardando', 'notificado')}
                  disabled={updatingId !== null}
                  title="Registra o contato manual; esta ação não envia mensagem."
                >
                  <Phone aria-hidden="true" className="h-4 w-4" />
                  {updatingId === proximoAChamar.id ? 'Salvando...' : 'Registrar contato'}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Pacientes na lista <span className="text-muted-foreground">({filteredLista.length})</span></CardTitle>
              {precisaHistorico && historicoQuery.isFetching && <p role="status" className="text-xs text-muted-foreground">Carregando histórico…</p>}
              {precisaHistorico && historicoQuery.isError && (
                <p role="alert" className="text-xs text-destructive">
                  Não foi possível carregar o histórico.{' '}
                  <button type="button" className="underline" onClick={() => void historicoQuery.refetch()}>Tentar novamente</button>
                </p>
              )}
              {precisaHistorico && (historicoQuery.data?.length ?? 0) >= LIMITE_HISTORICO && <p className="text-xs text-muted-foreground">Mostrando os {LIMITE_HISTORICO} registros mais recentes do histórico.</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Select value={ordenacao} onValueChange={(v: OrdenacaoEspera) => setOrdenacao(v)}>
                  <SelectTrigger className="h-10 w-48 rounded-full" aria-label="Ordenar lista de espera">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prioridade">Prioridade e tempo</SelectItem>
                    <SelectItem value="mais_antigos">Mais tempo de espera</SelectItem>
                    <SelectItem value="mais_recentes">Mais recentes</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-10 w-40 rounded-full" aria-label="Filtrar lista por status">
                    <SelectValue placeholder="Filtrar status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative w-full sm:w-72">
                  <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Buscar paciente por nome, CPF, telefone ou e-mail"
                    placeholder="Nome, CPF, telefone ou e-mail..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 rounded-full pl-10"
                  />
                </div>
              </div>
            </div>
            <div role="group" aria-label="Filtrar por prioridade" className="flex flex-wrap items-center gap-1.5">
              {([
                { key: 'todas', label: 'Todas as prioridades' },
                { key: 'urgente', label: 'Urgente' },
                { key: 'preferencial', label: 'Preferencial' },
                { key: 'normal', label: 'Normal' },
              ] as const).map(opt => {
                const ativo = prioridadeFilter === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setPrioridadeFilter(opt.key)}
                    className={cn(
                      'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      ativo ? 'border-transparent bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
              {temFiltro && (
                <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full text-xs text-muted-foreground" onClick={limparFiltros}>
                  <X aria-hidden="true" className="h-3 w-3" /> Limpar filtros
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* No celular a tabela vira fichas: sem rolagem lateral e com alvos de 44px. */}
          {filteredLista.length > 0 && (
            <ul className="space-y-2 md:hidden" aria-label="Pacientes na lista de espera">
              {filteredLista.map((item, index) => {
                const { nome, telefone } = getPacienteInfo(item);
                const diasEspera = getDiasEspera(item.data_cadastro);
                const prioridade = getPrioridadeListaEspera(item.prioridade);
                const whatsapp = linkWhatsApp(telefone, mensagemWhatsApp(nome.split(' ')[0], item.especialidade));
                const medicoPref = (item as any).medicos;
                const encerrado = ['agendado', 'desistiu'].includes(item.status || '');
                return (
                  <li key={item.id} className={cn('space-y-2 rounded-xl border border-border bg-card p-3', proximoAChamar?.id === item.id && 'border-foreground/40')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground"><span className="mr-1.5 tabular-nums text-muted-foreground">{index + 1}.</span>{nome}</p>
                        <p className="text-xs text-muted-foreground">{telefone}</p>
                      </div>
                      <Badge variant="outline" className={cn('shrink-0 rounded-full', STATUS_COLORS[item.status || 'aguardando'])}>
                        {STATUS_LABELS[item.status || 'aguardando']}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.especialidade || 'Sem especialidade'} · {medicoPref ? nomeMedico(medicoPref.nome || medicoPref.crm) : 'Qualquer médico'}
                      {item.preferencia_horario ? ` · ${PREFERENCIA_LABELS[item.preferencia_horario] ?? item.preferencia_horario}` : ''}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={cn('rounded-full text-[11px]', prioridade.className)}>{prioridade.label}</Badge>
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums', diasEspera > 30 ? 'bg-destructive/10 text-destructive' : diasEspera > 14 ? 'bg-warning/10 text-warning-foreground' : 'bg-muted text-muted-foreground')}>
                        {diasEspera} dia{diasEspera === 1 ? '' : 's'} na lista
                      </span>
                    </div>
                    {acoesDoPedido(item, nome, whatsapp, encerrado)}
                  </li>
                );
              })}
            </ul>
          )}
          <div className={cn('overflow-hidden rounded-xl border border-border/60', filteredLista.length > 0 && 'hidden md:block')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead className="hidden md:table-cell">Pedido</TableHead>
                  <TableHead className="hidden sm:table-cell">Espera</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLista.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
                        <Clock className="h-7 w-7" />
                      </span>
                      <p className="font-medium text-foreground">{lista.length === 0 ? 'Nenhum paciente na lista de espera' : 'Nenhum paciente corresponde aos filtros'}</p>
                      <p className="mt-1 text-sm">{lista.length === 0 ? 'Adicione pacientes que aguardam vaga para acompanhar por aqui.' : 'Ajuste a busca, o status ou a prioridade.'}</p>
                      {lista.length > 0 ? (
                        <Button size="sm" variant="outline" className="mt-4 rounded-full" onClick={limparFiltros}>
                          Limpar filtros
                        </Button>
                      ) : (
                        <p className="mt-4 text-xs">Use “Adicionar à Lista” no topo para incluir o primeiro paciente.</p>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLista.map((item, index) => {
                    const { nome, telefone } = getPacienteInfo(item);
                    const diasEspera = getDiasEspera(item.data_cadastro);
                    const prioridade = getPrioridadeListaEspera(item.prioridade);
                    const whatsapp = linkWhatsApp(telefone, mensagemWhatsApp(nome.split(' ')[0], item.especialidade));
                    const medicoPref = (item as any).medicos;
                    const eProximo = proximoAChamar?.id === item.id;
                    const encerrado = ['agendado', 'desistiu'].includes(item.status || '');
                    const expiraEm = item.oferta_expira_em ? new Date(item.oferta_expira_em) : null;
                    const ofertaAtiva = item.status === 'notificado'
                      && Boolean(item.oferta_agendamento_id)
                      && Boolean(expiraEm && !Number.isNaN(expiraEm.getTime()) && expiraEm.getTime() > Date.now());
                    return (
                      <TableRow key={item.id} className={cn(eProximo && 'bg-primary/5', encerrado && 'text-muted-foreground')}>
                        <TableCell>
                          <span className={cn(
                            'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                            eProximo ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                          )}>
                            {index + 1}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 font-medium text-foreground">
                              <span className="truncate">{nome}</span>
                              {eProximo && <Badge className="rounded-full border-transparent bg-primary text-[9px] text-primary-foreground">Próximo</Badge>}
                            </p>
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone aria-hidden="true" className="h-3 w-3" />
                              {telefone}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <p className="text-sm">{item.especialidade || '-'}</p>
                          <p className="text-xs text-muted-foreground">
                            {medicoPref ? nomeMedico(medicoPref.nome || medicoPref.crm) : 'Qualquer médico'}
                            {item.preferencia_horario ? ` · ${PREFERENCIA_LABELS[item.preferencia_horario] ?? item.preferencia_horario}` : ''}
                          </p>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                            diasEspera > 30 ? 'bg-destructive/10 text-destructive' :
                            diasEspera > 14 ? 'bg-warning/10 text-warning-foreground' : 'bg-muted text-muted-foreground',
                          )}>
                            {diasEspera > 30 && <AlertTriangle aria-hidden="true" className="h-3 w-3" />}
                            {diasEspera} dia{diasEspera === 1 ? '' : 's'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('rounded-full', prioridade.className)}>
                            {prioridade.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant="outline" className={cn('rounded-full', STATUS_COLORS[item.status || 'aguardando'])}>
                              {STATUS_LABELS[item.status || 'aguardando']}
                            </Badge>
                            {ofertaAtiva && expiraEm && (
                              <span className="text-[11px] leading-tight text-primary">
                                Portal até {format(expiraEm, "dd/MM 'às' HH:mm")}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {acoesDoPedido(item, nome, whatsapp, encerrado)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      </>}
      {creationPage && <form onSubmit={event => { event.preventDefault(); void handleSave(); }} className="w-full overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          <header className="border-b border-border/70 px-5 py-5 sm:px-7">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Fluxo de atendimento</p>
            <h1 className="mt-1 font-display text-2xl font-semibold">Adicionar à lista de espera</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Registre quem aguarda uma vaga e as preferências que ajudam a equipe a encontrar o melhor horário.</p>
          </header>
          <div className="px-5 sm:px-7">
            {medicosQuery.isError && <ErrorState compact title="Não foi possível carregar os médicos" error={medicosQuery.error} onRetry={() => void medicosQuery.refetch()} />}
          </div>
          <fieldset disabled={isSubmitting} className="grid min-w-0 gap-x-5 gap-y-4 px-5 py-5 sm:grid-cols-2 sm:px-7">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="espera-paciente">Paciente *</Label>
              <PacienteCombobox
                id="espera-paciente"
                value={formData.paciente_id || null}
                onChange={(id) => setFormData((form) => ({ ...form, paciente_id: id }))}
                placeholder="Buscar paciente por nome, CPF ou telefone..."
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="espera-especialidade">Especialidade *</Label>
              <Select
                value={formData.especialidade}
                onValueChange={(v) => setFormData({ ...formData, especialidade: v })}
              >
                <SelectTrigger id="espera-especialidade">
                  <SelectValue placeholder="Selecione a especialidade" />
                </SelectTrigger>
                <SelectContent>
                  {especialidades.map((esp) => (
                    <SelectItem key={esp} value={esp}>{esp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="espera-medico">Médico Preferencial</Label>
              <Select
                value={formData.medico_id || '__any__'}
                onValueChange={(v) => setFormData({ ...formData, medico_id: v === '__any__' ? '' : v })}
              >
                <SelectTrigger id="espera-medico">
                  <SelectValue placeholder="Qualquer médico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Qualquer médico</SelectItem>
                  {medicos.filter((m) => m.ativo).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome || m.crm} - {m.especialidade || 'Clínico'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
                <Label htmlFor="espera-prioridade">Prioridade</Label>
                <Select
                  value={formData.prioridade}
                  onValueChange={(v) => setFormData({ ...formData, prioridade: v })}
                >
                  <SelectTrigger id="espera-prioridade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="preferencial">Preferencial</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label htmlFor="espera-horario">Preferência de Horário</Label>
                <Select
                  value={formData.preferencia_horario || '__any__'}
                  onValueChange={(v) => setFormData({ ...formData, preferencia_horario: v === '__any__' ? '' : v })}
                >
                  <SelectTrigger id="espera-horario">
                    <SelectValue placeholder="Qualquer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Qualquer horário</SelectItem>
                    <SelectItem value="manha">Manhã</SelectItem>
                    <SelectItem value="tarde">Tarde</SelectItem>
                    <SelectItem value="noite">Noite</SelectItem>
                  </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="espera-motivo">Motivo</Label>
              <Textarea
                id="espera-motivo"
                value={formData.motivo}
                onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
                placeholder="Motivo da consulta..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="espera-observacoes">Observações</Label>
              <Textarea
                id="espera-observacoes"
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Observações adicionais..."
                rows={2}
              />
            </div>
          </fieldset>
          <div className="flex flex-wrap justify-end gap-3 border-t border-border/70 bg-muted/30 px-5 py-4 sm:px-7">
            <Button type="button" variant="outline" onClick={leaveForm} disabled={isSubmitting}>
              Cancelar
            </Button>
            <LoadingButton type="submit" className="scroll-mb-24" isLoading={isSubmitting} loadingText="Salvando...">
              Adicionar
            </LoadingButton>
          </div>
        </form>}

      {/* Preserve the request in history when the patient declines. */}
      <AlertDialog open={!!desistindo} onOpenChange={(open) => !open && !updatingId && setDesistindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar desistência?</AlertDialogTitle>
            <AlertDialogDescription>
              {desistindo?.nome} será marcado como desistente e permanecerá no histórico. O pedido deixará de contar como ativo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updatingId !== null}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!desistindo || updatingId !== null}
              onClick={(event) => {
                event.preventDefault();
                if (!desistindo) return;
                const pendente = desistindo;
                setDesistindo(null);
                void handleUpdateStatus(pendente.id, pendente.status, 'desistiu');
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar desistência
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm remove dialog */}
      <AlertDialog open={!!removeId} onOpenChange={(open) => !open && !isRemoving && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da lista de espera?</AlertDialogTitle>
            <AlertDialogDescription>
              O item será removido permanentemente da lista de espera.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRemoving}
              onClick={(event) => {
                event.preventDefault();
                if (removeId) void handleRemove(removeId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? 'Removendo...' : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
