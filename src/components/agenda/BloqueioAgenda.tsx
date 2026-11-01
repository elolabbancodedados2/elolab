import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { formatWithDatePreference as format } from '@/lib/datePreference';
import { nomeMedico } from '@/lib/formatters';
import { parseISO } from 'date-fns';
import { AlertTriangle, ArrowLeft, Ban, CalendarDays, Clock3, Edit3 as Pencil, Info, Plus, Trash2 } from '@/components/icons/elolabIcons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { useMedicos, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LoadingButton } from '@/components/ui/loading-button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { consultasEmConflito } from '@/lib/bloqueioConflitos';

interface Bloqueio {
  id: string;
  medico_id: string;
  data_inicio: string;
  data_fim: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  dia_inteiro: boolean;
  motivo: string | null;
  tipo: string;
}

interface FormState {
  medico_ids: string[];
  data_inicio: string;
  data_fim: string;
  hora_inicio: string;
  hora_fim: string;
  dia_inteiro: boolean;
  motivo: string;
  tipo: string;
}

interface BloqueioAgendaProps {
  creationPage?: boolean;
}

const emptyForm: FormState = {
  medico_ids: [], data_inicio: '', data_fim: '', hora_inicio: '', hora_fim: '',
  dia_inteiro: true, motivo: '', tipo: 'bloqueio',
};

const tiposBloqueio = [
  ['bloqueio', 'Bloqueio'], ['ferias', 'Férias'], ['almoco', 'Almoço'],
  ['reuniao', 'Reunião'], ['folga', 'Folga'],
] as const;

const LIMITE_CONFLITOS = 200;

function agendaReturnPath(value: unknown) {
  return typeof value === 'string' && /^\/agenda(?:\?[^#]*)?$/.test(value) ? value : '/agenda';
}

function dataValida(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function horaValida(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function formatarData(value: string) {
  return dataValida(value) ? format(parseISO(value), 'dd/MM/yyyy') : value;
}

function formDoBloqueio(b: Bloqueio): FormState {
  return {
    medico_ids: [b.medico_id],
    data_inicio: b.data_inicio,
    data_fim: b.data_fim,
    hora_inicio: b.hora_inicio?.slice(0, 5) || '',
    hora_fim: b.hora_fim?.slice(0, 5) || '',
    dia_inteiro: !!b.dia_inteiro,
    motivo: b.motivo || '',
    tipo: b.tipo || 'bloqueio',
  };
}

export function BloqueioAgenda({ creationPage = false }: BloqueioAgendaProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { bloqueioId } = useParams();
  const editando = creationPage && !!bloqueioId;
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const currentMedico = useCurrentMedico();
  const medicosQuery = useMedicos();
  const { data: medicos = [] } = medicosQuery;
  const agendaReturnTo = agendaReturnPath(location.state?.agendaReturnTo);
  const agendaFilters = location.state?.agendaFilters;
  const navigationContext = { agendaReturnTo, agendaFilters };
  const returnTo = creationPage ? '/agenda/bloqueios' : agendaReturnTo;
  const hoje = todaySaoPauloDateOnly();

  const bloqueioEditadoQuery = useQuery({
    queryKey: ['bloqueio-edicao', profile?.clinica_id, bloqueioId],
    enabled: editando && !!profile?.clinica_id,
    gcTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await (supabase.from('bloqueios_agenda' as any)
        .select('*').eq('id', bloqueioId!).eq('clinica_id', profile!.clinica_id!).maybeSingle() as any);
      if (error) throw error;
      return data as Bloqueio | null;
    },
  });
  const bloqueioEditado = bloqueioEditadoQuery.data ?? null;

  const initialForm = useMemo<FormState>(() => {
    if (editando) return bloqueioEditado ? formDoBloqueio(bloqueioEditado) : emptyForm;
    const medicoInicial = currentMedico.isMedicoOnly ? currentMedico.medicoId : location.state?.initial?.medico_id;
    return { ...emptyForm, medico_ids: medicoInicial ? [medicoInicial] : [] };
  }, [editando, bloqueioEditado, currentMedico.isMedicoOnly, currentMedico.medicoId, location.state]);
  const [form, setForm] = useState<FormState>(initialForm);
  useEffect(() => { setForm(initialForm); }, [initialForm]);
  const [errorMessage, setErrorMessage] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [bloqueioParaRemover, setBloqueioParaRemover] = useState<Bloqueio | null>(null);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const completed = useRef(false);
  // Só os bloqueios que ainda valem; os encerrados não ajudam a decidir nada.
  const bloqueiosQuery = useSupabaseQuery<Bloqueio>('bloqueios_agenda', {
    orderBy: { column: 'data_inicio', ascending: true },
    filters: [{ column: 'data_fim', operator: 'gte', value: hoje }],
    enabled: !creationPage,
  });
  const { data: bloqueios = [], isLoading } = bloqueiosQuery;

  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const medicoIds = currentMedico.isMedicoOnly && currentMedico.medicoId ? [currentMedico.medicoId] : form.medico_ids;
  // O médico sem papel operacional gerencia só os próprios bloqueios.
  const podeGerir = (b: Bloqueio) => !currentMedico.isMedicoOnly || b.medico_id === currentMedico.medicoId;

  const getMedicoLabel = (id: string) => {
    const medico = medicos.find(item => item.id === id);
    return medico ? `${nomeMedico(medico.nome || medico.crm)} · ${medico.especialidade || 'Geral'}` : id;
  };

  // Consultas que colidem com o período: o banco recusa o bloqueio enquanto existirem.
  const periodoCompleto = medicoIds.length > 0 && dataValida(form.data_inicio) && dataValida(form.data_fim) && form.data_fim >= form.data_inicio
    && (form.dia_inteiro || (horaValida(form.hora_inicio) && horaValida(form.hora_fim) && form.hora_fim > form.hora_inicio));
  const conflitosQuery = useQuery({
    queryKey: ['bloqueio-conflitos', profile?.clinica_id, [...medicoIds].sort().join(','), form.data_inicio, form.data_fim],
    enabled: creationPage && periodoCompleto && !!profile?.clinica_id,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('agendamentos')
        .select('id, medico_id, data, hora_inicio, hora_fim, status, pacientes(nome, nome_social)')
        .eq('clinica_id', profile!.clinica_id!)
        .in('medico_id', medicoIds)
        .gte('data', form.data_inicio)
        .lte('data', form.data_fim)
        .not('status', 'in', '(cancelado,faltou)')
        .order('data', { ascending: true })
        .limit(LIMITE_CONFLITOS);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const conflitos = periodoCompleto && conflitosQuery.data
    ? consultasEmConflito(conflitosQuery.data, { ...form, medico_ids: medicoIds })
    : [];

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    if (!profile?.clinica_id) {
      setErrorMessage('Não foi possível identificar a clínica da sessão. Atualize a página e tente novamente.');
      return;
    }
    if (!medicoIds.length || !form.data_inicio || !form.data_fim) {
      setErrorMessage('Informe o profissional e o período do bloqueio.');
      return;
    }
    if (!dataValida(form.data_inicio) || !dataValida(form.data_fim) || form.data_fim < form.data_inicio) {
      setErrorMessage('Informe um período válido. A data final deve ser igual ou posterior à data inicial.');
      return;
    }
    if (!form.dia_inteiro) {
      if (!horaValida(form.hora_inicio) || !horaValida(form.hora_fim)) {
        setErrorMessage('Informe horários válidos para o início e o fim do bloqueio.');
        return;
      }
      if (form.hora_fim <= form.hora_inicio) {
        setErrorMessage('O horário final deve ser posterior ao horário inicial.');
        return;
      }
    }

    const campos = {
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      hora_inicio: form.dia_inteiro ? null : form.hora_inicio,
      hora_fim: form.dia_inteiro ? null : form.hora_fim,
      dia_inteiro: form.dia_inteiro,
      motivo: form.motivo.trim() || null,
      tipo: form.tipo,
    };
    setSalvando(true);
    try {
      if (editando) {
        if (!bloqueioEditado) throw new Error('O bloqueio não foi encontrado.');
        const { data, error } = await (supabase.from('bloqueios_agenda' as any)
          .update({ ...campos, medico_id: medicoIds[0] })
          .eq('id', bloqueioEditado.id)
          .eq('clinica_id', profile.clinica_id)
          .select('id') as any);
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Bloqueio não encontrado ou sem permissão para alterar.');
      } else {
        // Uma linha por profissional, num único insert: ou bloqueia todos, ou nenhum.
        const { error } = await supabase.from('bloqueios_agenda' as any).insert(
          medicoIds.map(medico_id => ({ ...campos, medico_id, clinica_id: profile.clinica_id })),
        );
        if (error) throw error;
      }

      completed.current = true;
      toast.success(editando ? 'Bloqueio atualizado' : medicoIds.length > 1 ? `Horário bloqueado para ${medicoIds.length} profissionais` : 'Horário bloqueado com sucesso');
      void queryClient.invalidateQueries({ queryKey: ['bloqueios_agenda'] });
      navigate('/agenda/bloqueios', { replace: true, state: navigationContext });
    } catch (error) {
      const conflito = String((error as { message?: string })?.message || '').includes('AGENDA_BLOQUEIO_CONFLITO');
      const description = conflito
        ? 'Existe uma consulta marcada neste período. Remarque a consulta ou escolha outro intervalo.'
        : mensagemDeErro(error);
      setErrorMessage(conflito
        ? `Não foi possível bloquear este período. ${description}`
        : `Erro ao salvar o bloqueio. ${description}`);
      toast.error(conflito ? 'Não foi possível bloquear este período' : 'Erro ao salvar o bloqueio', { description });
      if (conflito) void conflitosQuery.refetch();
    } finally {
      setSalvando(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a página e tente novamente.');
      return;
    }
    setRemovendoId(id);
    try {
      const { data, error } = await (supabase.from('bloqueios_agenda' as any)
        .delete()
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id)
        .select('id') as any);
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error('Bloqueio não encontrado ou sem permissão para remover.');
        return;
      }
      toast.success('Bloqueio removido. Novos agendamentos podem ocupar esse período.');
      void queryClient.invalidateQueries({ queryKey: ['bloqueios_agenda'] });
      setBloqueioParaRemover(null);
    } catch (error) {
      toast.error('Erro ao remover bloqueio', { description: mensagemDeErro(error) });
    } finally {
      setRemovendoId(null);
    }
  };

  const pageTitle = editando ? 'Editar bloqueio de agenda' : creationPage ? 'Novo bloqueio de agenda' : 'Bloqueios da agenda';
  const backLink = creationPage ? returnTo : agendaReturnTo;
  const medicosAtivos = medicos.filter(medico => medico.ativo || (editando && form.medico_ids.includes(medico.id)));

  const alternarMedico = (id: string, marcado: boolean) => setForm(previous => ({
    ...previous,
    medico_ids: marcado ? [...new Set([...previous.medico_ids, id])] : previous.medico_ids.filter(item => item !== id),
  }));

  return (
    <main className="mx-auto max-w-5xl space-y-6 pb-8" data-testid="agenda-blocks-page">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
          <Link to={backLink} state={creationPage ? navigationContext : { agendaFilters }}>
            <ArrowLeft className="mr-2 h-4 w-4" />{creationPage ? 'Voltar aos bloqueios' : 'Voltar à agenda'}
          </Link>
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Agenda · disponibilidade</p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{pageTitle}</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {creationPage
                ? 'Registre férias, reuniões, folgas ou outro período sem disponibilidade para novos agendamentos.'
                : 'Períodos em vigor ou futuros. Bloqueios encerrados deixam de aparecer.'}
            </p>
          </div>
          {!creationPage && (
            <Button asChild className="w-full shrink-0 sm:w-auto">
              <Link to="/agenda/bloqueios/novo" state={{ ...navigationContext, initial: location.state?.initial }}>
                <Plus className="mr-2 h-4 w-4" />Novo bloqueio
              </Link>
            </Button>
          )}
        </div>
      </div>

      {creationPage ? (
        editando && bloqueioEditadoQuery.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Carregando bloqueio…</p>
        ) : editando && (bloqueioEditadoQuery.isError || !bloqueioEditado || !podeGerir(bloqueioEditado)) ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {bloqueioEditadoQuery.isError ? `Não foi possível carregar o bloqueio. ${mensagemDeErro(bloqueioEditadoQuery.error)}` : 'Bloqueio não encontrado ou sem permissão para alterar.'}
            </AlertDescription>
          </Alert>
        ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <form onSubmit={handleSave} className="min-w-0 space-y-6" noValidate>
              <Card>
                <CardHeader className="border-b border-border pb-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarDays className="h-4 w-4" />Profissional e período
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5 pt-5">
                  {medicosQuery.isError && (
                    <Alert variant="destructive" role="alert">
                      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                        Não foi possível carregar os profissionais.
                        <Button type="button" size="sm" variant="outline" onClick={() => void medicosQuery.refetch()}>Tentar novamente</Button>
                      </AlertDescription>
                    </Alert>
                  )}
                  {currentMedico.isMedicoOnly && currentMedico.isLoading && <p role="status" className="text-sm text-muted-foreground">Identificando seu vínculo profissional…</p>}
                  {currentMedico.isMedicoOnly && currentMedico.error && (
                    <Alert variant="destructive" role="alert"><AlertDescription>Não foi possível identificar seu vínculo profissional. Atualize os dados e tente novamente.</AlertDescription></Alert>
                  )}
                  {!currentMedico.isMedicoOnly && editando && (
                    <div className="space-y-2">
                      <Label htmlFor="block-doctor">Profissional *</Label>
                      <Select value={form.medico_ids[0] || ''} onValueChange={medico_id => setForm(previous => ({ ...previous, medico_ids: [medico_id] }))}>
                        <SelectTrigger id="block-doctor" aria-label="Profissional *">
                          <SelectValue placeholder="Selecione o profissional" />
                        </SelectTrigger>
                        <SelectContent data-elo-font-preview="agenda">
                          {medicosAtivos.map(medico => (
                            <SelectItem key={medico.id} value={medico.id}>
                              {nomeMedico(medico.nome || medico.crm)} · {medico.especialidade || 'Geral'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {!currentMedico.isMedicoOnly && !editando && (
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">Profissionais *</legend>
                      <p className="text-xs text-muted-foreground">Marque um ou mais: feriados e reuniões costumam valer para todos.</p>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => setForm(previous => ({ ...previous, medico_ids: medicosAtivos.map(m => m.id) }))}>
                          Todos
                        </Button>
                        {form.medico_ids.length > 0 && (
                          <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setForm(previous => ({ ...previous, medico_ids: [] }))}>
                            Limpar
                          </Button>
                        )}
                      </div>
                      <div className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
                        {medicosAtivos.map(medico => (
                          <label key={medico.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-muted/50">
                            <Checkbox
                              checked={form.medico_ids.includes(medico.id)}
                              onCheckedChange={v => alternarMedico(medico.id, v === true)}
                              aria-label={nomeMedico(medico.nome || medico.crm)}
                            />
                            <span className="min-w-0 truncate text-sm">{nomeMedico(medico.nome || medico.crm)} · {medico.especialidade || 'Geral'}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}

                  {currentMedico.isMedicoOnly && (
                    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
                      <span className="text-muted-foreground">Profissional: </span>
                      <span className="font-medium text-foreground">{currentMedico.currentMedico?.nome || 'Sua agenda'}</span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="block-type">Motivo do bloqueio *</Label>
                    <Select value={form.tipo} onValueChange={tipo => setForm(previous => ({ ...previous, tipo }))}>
                      <SelectTrigger id="block-type" aria-label="Motivo do bloqueio *"><SelectValue /></SelectTrigger>
                      <SelectContent data-elo-font-preview="agenda">
                        {tiposBloqueio.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="block-start-date">Data inicial *</Label>
                      <Input id="block-start-date" type="date" required value={form.data_inicio}
                        onChange={event => setForm(previous => ({
                          ...previous,
                          data_inicio: event.target.value,
                          data_fim: !previous.data_fim || previous.data_fim < event.target.value ? event.target.value : previous.data_fim,
                        }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="block-end-date">Data final *</Label>
                      <Input id="block-end-date" type="date" required min={form.data_inicio || undefined}
                        value={form.data_fim} onChange={event => setForm(previous => ({ ...previous, data_fim: event.target.value }))} />
                    </div>
                  </div>

                  <div className="space-y-4 rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="block-full-day" className="cursor-pointer">Dia inteiro</Label>
                        <p className="text-xs text-muted-foreground">Desative para reservar apenas uma faixa horária.</p>
                      </div>
                      <Switch id="block-full-day" checked={form.dia_inteiro}
                        onCheckedChange={dia_inteiro => setForm(previous => ({ ...previous, dia_inteiro }))} />
                    </div>
                    {!form.dia_inteiro && (
                      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="block-start-time">Horário inicial *</Label>
                          <Input id="block-start-time" type="time" required value={form.hora_inicio}
                            onChange={event => setForm(previous => ({ ...previous, hora_inicio: event.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="block-end-time">Horário final *</Label>
                          <Input id="block-end-time" type="time" required min={form.hora_inicio || undefined}
                            value={form.hora_fim} onChange={event => setForm(previous => ({ ...previous, hora_fim: event.target.value }))} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="block-reason">Observação</Label>
                    <Textarea id="block-reason" maxLength={500} value={form.motivo}
                      onChange={event => setForm(previous => ({ ...previous, motivo: event.target.value }))}
                      placeholder="Ex.: férias, reunião clínica ou manutenção." rows={3} />
                    <p className="text-right text-xs text-muted-foreground">{form.motivo.length}/500</p>
                  </div>

                  {periodoCompleto && conflitos.length > 0 && (
                    <section aria-labelledby="block-conflicts" className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
                      <h2 id="block-conflicts" className="flex items-center gap-2 text-sm font-semibold text-warning-foreground">
                        <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                        {conflitos.length} consulta{conflitos.length === 1 ? '' : 's'} no período
                      </h2>
                      <p className="text-xs text-muted-foreground">Remarque ou cancele estas consultas antes de salvar; o sistema não bloqueia horário ocupado.</p>
                      <ul className="divide-y divide-border/60 text-sm">
                        {conflitos.slice(0, 10).map(c => (
                          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                            <span className="min-w-0">
                              <span className="font-medium tabular-nums">{formatarData(c.data)} {String(c.hora_inicio).slice(0, 5)}</span>
                              {' · '}{c.pacientes?.nome_social || c.pacientes?.nome || 'Paciente'}
                              {medicoIds.length > 1 && <span className="text-muted-foreground"> · {nomeMedico(medicos.find(m => m.id === c.medico_id)?.nome || '')}</span>}
                            </span>
                            <Link to={`/agenda?data=${c.data}&view=daily&agendamento=${c.id}`} className="text-xs font-semibold underline underline-offset-2">Abrir</Link>
                          </li>
                        ))}
                      </ul>
                      {conflitos.length > 10 && <p className="text-xs text-muted-foreground">E mais {conflitos.length - 10}.</p>}
                    </section>
                  )}
                  {periodoCompleto && conflitosQuery.isError && (
                    <p role="status" className="text-xs text-muted-foreground">Não foi possível conferir as consultas do período; o sistema ainda confere ao salvar.</p>
                  )}

                  {errorMessage && <Alert variant="destructive" role="alert"><AlertDescription>{errorMessage}</AlertDescription></Alert>}
                </CardContent>
              </Card>

              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => navigate(returnTo, { state: navigationContext })}>
                  Cancelar
                </Button>
                <LoadingButton type="submit" isLoading={salvando} loadingText="Salvando…" disabled={medicosQuery.isLoading || medicosQuery.isError || currentMedico.isMedicoOnly && (!currentMedico.medicoId || currentMedico.isLoading || !!currentMedico.error)}>
                  {editando ? 'Salvar alterações' : 'Salvar bloqueio'}
                </LoadingButton>
              </div>
            </form>

            <aside className="space-y-4 lg:pt-1" aria-label="Informações sobre bloqueios">
              <div className="space-y-3 border-l-2 border-border pl-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><Info className="h-4 w-4" />Antes de salvar</h2>
                <p className="text-sm leading-6 text-muted-foreground">O sistema impede o bloqueio de um período que já tenha consulta marcada. A lista do formulário mostra quais consultas estão no caminho.</p>
                <p className="text-sm leading-6 text-muted-foreground">A remoção posterior do bloqueio libera o período para novos agendamentos; consultas existentes não são alteradas.</p>
              </div>
            </aside>
          </div>
          <UnsavedChangesGuard dirty={dirty} busy={salvando} completed={completed} />
        </>
        )
      ) : (
        <>
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Ban className="h-4 w-4" />Períodos indisponíveis
                {!isLoading && !bloqueiosQuery.isError && <Badge variant="secondary" className="ml-1">{bloqueios.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <p role="status" className="px-5 py-8 text-sm text-muted-foreground">Carregando bloqueios…</p>
              ) : bloqueiosQuery.isError ? (
                <div role="alert" className="space-y-3 px-5 py-8">
                  <p className="text-sm text-destructive">Não foi possível carregar os períodos bloqueados.</p>
                  <Button size="sm" variant="outline" onClick={() => void bloqueiosQuery.refetch()}>Tentar novamente</Button>
                </div>
              ) : bloqueios.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
                  <h2 className="mt-3 text-sm font-semibold">Nenhum bloqueio em vigor</h2>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Cadastre férias, folgas ou outro período para que a agenda considere a indisponibilidade.</p>
                  <Button asChild className="mt-5"><Link to="/agenda/bloqueios/novo" state={navigationContext}><Plus className="mr-2 h-4 w-4" />Novo bloqueio</Link></Button>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {bloqueios.map(bloqueio => (
                    <li key={bloqueio.id} className="flex min-w-0 items-start justify-between gap-3 px-4 py-4 sm:px-5">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground" aria-hidden="true">
                          <Ban className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="break-words text-sm font-medium text-foreground">{getMedicoLabel(bloqueio.medico_id)}</span>
                            <Badge variant="outline" className="gap-1 border-border bg-muted text-[10px] text-foreground">
                              <Clock3 aria-hidden="true" className="h-3 w-3" />
                              {tiposBloqueio.find(([value]) => value === bloqueio.tipo)?.[1] || bloqueio.tipo}
                            </Badge>
                            {bloqueio.data_inicio <= hoje && <Badge variant="outline" className="border-border text-[10px] text-muted-foreground">Em vigor</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {formatarData(bloqueio.data_inicio)}{bloqueio.data_inicio !== bloqueio.data_fim && ` a ${formatarData(bloqueio.data_fim)}`}
                          </p>
                          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                            {bloqueio.dia_inteiro ? 'Dia inteiro' : `${bloqueio.hora_inicio?.slice(0, 5)}–${bloqueio.hora_fim?.slice(0, 5)}`}
                            {bloqueio.motivo && <><span aria-hidden="true">·</span><span className="break-words">{bloqueio.motivo}</span></>}
                          </p>
                        </div>
                      </div>
                      {podeGerir(bloqueio) && (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-11 w-11" asChild aria-label={`Editar bloqueio de ${getMedicoLabel(bloqueio.medico_id)}`}>
                            <Link to={`/agenda/bloqueios/${bloqueio.id}/editar`} state={navigationContext}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Remover bloqueio de ${getMedicoLabel(bloqueio.medico_id)}`} onClick={() => setBloqueioParaRemover(bloqueio)} disabled={!!removendoId}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <ConfirmDialog
            open={!!bloqueioParaRemover}
            onOpenChange={open => { if (!open && !removendoId) setBloqueioParaRemover(null); }}
            title="Remover bloqueio da agenda?"
            description={bloqueioParaRemover
              ? `Após remover o bloqueio de ${getMedicoLabel(bloqueioParaRemover.medico_id)}, novos agendamentos poderão ocupar ${formatarData(bloqueioParaRemover.data_inicio)}${bloqueioParaRemover.data_inicio !== bloqueioParaRemover.data_fim ? ` a ${formatarData(bloqueioParaRemover.data_fim)}` : ''}${!bloqueioParaRemover.dia_inteiro && bloqueioParaRemover.hora_inicio && bloqueioParaRemover.hora_fim ? `, das ${bloqueioParaRemover.hora_inicio.slice(0, 5)} às ${bloqueioParaRemover.hora_fim.slice(0, 5)}` : ', durante o dia inteiro'}.`
              : ''}
            confirmLabel="Remover bloqueio"
            variant="destructive"
            isLoading={removendoId === bloqueioParaRemover?.id}
            closeOnConfirm={false}
            onConfirm={() => { if (bloqueioParaRemover) void handleDelete(bloqueioParaRemover.id); }}
          />
        </>
      )}
    </main>
  );
}
