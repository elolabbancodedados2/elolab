import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, RefreshCw, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { getRelatorioSaveDraft, setRelatorioSaveDraft, type RelatorioSaveDraft, type RelatorioSaveForm } from '@/lib/relatorioSaveDraft';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { proximaExecucaoSaoPaulo } from '@/lib/dateOnly';
import { podeAcessarRelatorioCompletoDePacientes } from '@/lib/reportAccess';
import { toast } from 'sonner';

const FORM_VAZIO: RelatorioSaveForm = {
  nome: '', descricao: '', frequencia: 'nenhuma', dia_semana: '1', dia_mes: '1',
  hora: '08:00', destinatarios: '', formato: 'csv',
};

interface Preflight {
  emailConfigured: boolean;
  timezone: string;
  recipients: Array<{ id: string; nome: string; email: string }>;
}

interface PreflightResponse {
  emailConfigured: unknown;
  timezone: unknown;
  recipients: unknown;
}

type AuthorizedRecipient = { id: string; nome: string; email: string };
type SavedReportInsert = Database['public']['Tables']['relatorios_salvos']['Insert'];

function formatDateForDisplay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`
    : value;
}

function isAuthorizedRecipient(value: unknown): value is AuthorizedRecipient {
  if (typeof value !== 'object' || value === null) return false;
  const recipient = value as Record<string, unknown>;
  return typeof recipient.id === 'string' && typeof recipient.nome === 'string' && typeof recipient.email === 'string';
}

export default function SalvarRelatorioPage() {
  const [draft, setDraft] = useState<RelatorioSaveDraft | null>(() => getRelatorioSaveDraft());
  const { user, profile } = useSupabaseAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saveForm, setSaveForm] = useState<RelatorioSaveForm>(() => draft?.form ?? FORM_VAZIO);
  const [timezoneConfirmed, setTimezoneConfirmed] = useState(false);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [preflightError, setPreflightError] = useState('');
  const [preflightAttempt, setPreflightAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const completed = useRef(false);

  const updateDraft = useCallback((next: RelatorioSaveDraft | null) => {
    setRelatorioSaveDraft(next);
    setDraft(next);
  }, []);

  useEffect(() => {
    const current = getRelatorioSaveDraft();
    if (!current) {
      setSaveForm(FORM_VAZIO);
      return;
    }
    setSaveForm(current.form);
    setTimezoneConfirmed(false);
    setPreflight(null);
    setPreflightError('');
  }, [draft?.key]);

  const updateSaveForm = useCallback((patch: Partial<RelatorioSaveForm>) => {
    setSaveForm(current => ({ ...current, ...patch }));
    const current = getRelatorioSaveDraft();
    if (current) updateDraft({ ...current, form: { ...current.form, ...patch } });
  }, [updateDraft]);

  const draftKey = draft?.key;
  const draftDataset = draft?.dataset;
  const frequency = saveForm.frequencia;

  useEffect(() => {
    if (!draftKey || !draftDataset || frequency === 'nenhuma') {
      setPreflight(null);
      setPreflightError('');
      setPreflightLoading(false);
      return;
    }
    let cancelled = false;
    setTimezoneConfirmed(false);
    setPreflight(null);
    setPreflightError('');
    setPreflightLoading(true);
    void supabase.functions.invoke<PreflightResponse>('scheduled-reports-runner', {
      body: { action: 'preflight', dataset: draftDataset },
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) throw error;
      if (!data || typeof data.emailConfigured !== 'boolean' || !Array.isArray(data.recipients)) {
        throw new Error('Resposta inválida ao verificar o envio agendado.');
      }
      if (data.timezone !== 'America/Sao_Paulo') throw new Error('O fuso horário retornado pelo servidor não é compatível com este agendamento.');
      const recipients = data.recipients.filter(isAuthorizedRecipient);
      setPreflight({ emailConfigured: data.emailConfigured, timezone: data.timezone, recipients });
      const emailsPermitidos = new Set(recipients.map((item: { email: string }) => item.email.toLocaleLowerCase('pt-BR')));
      const currentDraft = getRelatorioSaveDraft();
      if (!currentDraft) return;
      const currentForm = currentDraft.form;
      const nextForm = {
        ...currentForm,
        destinatarios: currentForm.destinatarios.split(',').map(email => email.trim())
          .filter(email => emailsPermitidos.has(email.toLocaleLowerCase('pt-BR'))).join(', '),
      };
      setSaveForm(nextForm);
      updateDraft({ ...currentDraft, form: nextForm });
    }).catch((error: unknown) => {
      if (!cancelled) setPreflightError(error instanceof Error ? error.message : 'Não foi possível verificar o envio agendado.');
    }).finally(() => {
      if (!cancelled) setPreflightLoading(false);
    });
    return () => { cancelled = true; };
  }, [draftKey, draftDataset, frequency, preflightAttempt, updateDraft]);

  if (!draft) {
    return <div className="space-y-6 pb-8">
      <PageHeader title="Salvar relatório" description="Este espaço é aberto a partir do construtor de relatórios." icon={<Star />} />
      <Card><CardContent className="space-y-3 py-6">
        <p role="alert" className="text-sm text-muted-foreground">Os critérios do relatório não estão mais disponíveis nesta sessão. Volte ao construtor e abra esta etapa novamente.</p>
        <Button onClick={() => navigate('/relatorios')}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar aos relatórios</Button>
      </CardContent></Card>
    </div>;
  }

  const datasetPermitido = draft.dataset === 'lancamentos' || draft.dataset === 'estoque'
    || podeAcessarRelatorioCompletoDePacientes(profile?.roles);
  const clinicMatches = !!profile?.clinica_id && profile.clinica_id === draft.clinicaId;
  const userMatches = !!user?.id && user.id === draft.userId;
  const savedReport = draft.savedReport;
  const canUpdateSavedReport = !!savedReport && savedReport.userId === user?.id;
  const canSchedule = saveForm.frequencia === 'nenhuma' || (
    !preflightLoading && !!preflight?.emailConfigured && timezoneConfirmed && saveForm.destinatarios.trim().length > 0
  );
  const formBlocked = !userMatches || !clinicMatches || !datasetPermitido;

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      if (formBlocked) throw new Error('A clínica, a conta ou a permissão mudou. Volte ao relatório e abra esta etapa novamente.');
      if (!saveForm.nome.trim()) throw new Error('Informe um nome para o relatório.');
      if (draft.config.dataInicio && draft.config.dataFim && draft.config.dataInicio > draft.config.dataFim) {
        throw new Error('A data inicial deve ser anterior ou igual à data final.');
      }
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser || currentUser.id !== draft.userId) throw new Error('A sessão mudou. Volte ao relatório e confirme a conta ativa.');
      const clinicaId = profile?.clinica_id;
      if (!clinicaId || clinicaId !== draft.clinicaId) throw new Error('A clínica não corresponde ao relatório aberto.');
      const dests = saveForm.destinatarios.split(',').map(value => value.trim()).filter(Boolean);
      if (saveForm.frequencia !== 'nenhuma') {
        if (!preflight?.emailConfigured) throw new Error('O canal de e-mail precisa estar ativo e acessível antes de agendar.');
        if (!timezoneConfirmed) throw new Error('Confirme o fuso horário de Brasília para agendar o relatório.');
        const emailsAutorizados = new Set((preflight.recipients ?? []).map(recipient => recipient.email.toLocaleLowerCase('pt-BR')));
        const unicos = [...new Set(dests.map(email => email.toLocaleLowerCase('pt-BR')))];
        if (dests.length === 0) throw new Error('Selecione ao menos um membro autorizado para receber o relatório.');
        if (unicos.length !== dests.length || unicos.some(email => !emailsAutorizados.has(email))) {
          throw new Error('Atualize a lista e selecione somente destinatários autorizados da clínica.');
        }
      }
      const payload: SavedReportInsert = {
        user_id: currentUser.id,
        clinica_id: clinicaId,
        nome: saveForm.nome.trim(),
        descricao: saveForm.descricao || null,
        dataset: draft.dataset,
        config: { ...draft.config },
        formato: saveForm.formato,
        destinatarios: saveForm.frequencia === 'nenhuma' ? [] : dests,
        ativo: canUpdateSavedReport && savedReport ? savedReport.ativo : true,
        frequencia: null,
        dia_semana: null,
        dia_mes: null,
        hora: null,
        proxima_execucao: null,
      };
      if (saveForm.frequencia !== 'nenhuma') {
        payload.frequencia = saveForm.frequencia;
        payload.hora = saveForm.hora + ':00';
        if (saveForm.frequencia === 'semanal') payload.dia_semana = Number(saveForm.dia_semana);
        if (saveForm.frequencia === 'mensal') payload.dia_mes = Number(saveForm.dia_mes);
        payload.proxima_execucao = proximaExecucaoSaoPaulo(
          saveForm.frequencia as 'diaria' | 'semanal' | 'mensal',
          saveForm.hora,
          Number(saveForm.dia_semana),
          Number(saveForm.dia_mes),
        );
      }
      if (canUpdateSavedReport && savedReport && savedReport.userId === currentUser.id) {
        const { data, error } = await supabase
          .from('relatorios_salvos')
          .update(payload)
          .eq('id', savedReport.id)
          .eq('user_id', currentUser.id)
          .eq('clinica_id', clinicaId)
          .eq('updated_at', savedReport.updatedAt)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('O relatório mudou ou não está mais disponível. Reabra-o antes de salvar alterações.');
        toast.success('Relatório atualizado');
      } else {
        const { error } = await supabase.from('relatorios_salvos').insert(payload);
        if (error) throw error;
        toast.success('Relatório salvo com sucesso');
      }
      await queryClient.invalidateQueries({ queryKey: ['relatorios-salvos'] });
      completed.current = true;
      updateDraft({ ...draft, key: `${draft.key}-saved`, savedReport: null, form: FORM_VAZIO });
      navigate('/relatorios', { replace: true });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-6 pb-8">
    <UnsavedChangesGuard
      dirty
      busy={saving}
      completed={completed}
      allowNavigation={(_current, next) => next.pathname === '/relatorios'}
      onDiscard={() => setRelatorioSaveDraft(null)}
    />
    <PageHeader
      title={canUpdateSavedReport ? 'Atualizar relatório salvo' : 'Salvar relatório personalizado'}
      description={`Salve os filtros atuais de ${draft.datasetLabel.toLocaleLowerCase('pt-BR')} ou configure uma entrega recorrente.`}
      icon={<Star />}
      actions={<Button variant="outline" onClick={() => navigate('/relatorios')}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao construtor</Button>}
    />

    {formBlocked && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">A sessão, clínica ou permissão mudou. Volte ao construtor para revisar o relatório.</p>}

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Detalhes do relatório</CardTitle>
          <CardDescription>Os filtros e as colunas que você configurou no construtor serão salvos junto com este relatório.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="saved-report-name">Nome <span aria-hidden="true">*</span></Label>
            <Input id="saved-report-name" aria-label="Nome do relatorio salvo" value={saveForm.nome} maxLength={120} onChange={event => updateSaveForm({ nome: event.target.value })} placeholder="Ex.: Receita mensal" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="saved-report-description">Descrição</Label>
            <Textarea id="saved-report-description" aria-label="Descricao do relatorio salvo" rows={3} value={saveForm.descricao} maxLength={500} onChange={event => updateSaveForm({ descricao: event.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="saved-report-frequency">Frequência de envio</Label>
              <Select value={saveForm.frequencia} onValueChange={frequencia => updateSaveForm({ frequencia })}>
                <SelectTrigger id="saved-report-frequency" aria-label="Frequencia de envio"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Apenas favoritar (sem envio)</SelectItem>
                  <SelectItem value="diaria">Diária</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="saved-report-time">Horário de envio</Label>
              <Input id="saved-report-time" aria-label="Horario de envio" type="time" value={saveForm.hora} onChange={event => updateSaveForm({ hora: event.target.value })} />
            </div>
            {saveForm.frequencia === 'semanal' && <div className="space-y-2">
              <Label htmlFor="saved-report-weekday">Dia da semana</Label>
              <Select value={saveForm.dia_semana} onValueChange={dia_semana => updateSaveForm({ dia_semana })}>
                <SelectTrigger id="saved-report-weekday" aria-label="Dia da semana"><SelectValue /></SelectTrigger>
                <SelectContent>{['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((day, index) => <SelectItem key={day} value={String(index)}>{day}</SelectItem>)}</SelectContent>
              </Select>
            </div>}
            {saveForm.frequencia === 'mensal' && <div className="space-y-2">
              <Label htmlFor="saved-report-monthday">Dia do mês</Label>
              <Input id="saved-report-monthday" aria-label="Dia do mes" type="number" min={1} max={28} value={saveForm.dia_mes} onChange={event => updateSaveForm({ dia_mes: event.target.value })} />
            </div>}
            <div className="space-y-2">
              <Label htmlFor="saved-report-format">Formato</Label>
              <Select value={saveForm.formato} onValueChange={formato => updateSaveForm({ formato })}>
                <SelectTrigger id="saved-report-format" aria-label="Formato do relatorio"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="csv">CSV</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          {saveForm.frequencia !== 'nenhuma' && <section aria-labelledby="report-recipients-title" className="space-y-3 rounded-lg border p-4">
            <div>
              <h2 id="report-recipients-title" className="font-medium">Destinatários autorizados</h2>
              <p className="text-sm text-muted-foreground">Somente contas ativas desta clínica com acesso a {draft.datasetLabel.toLocaleLowerCase('pt-BR')} podem receber o arquivo.</p>
            </div>
            {preflightLoading && <p role="status" className="text-sm text-muted-foreground">Verificando canal e permissões…</p>}
            {preflightError && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{preflightError}</p><Button type="button" variant="outline" size="sm" onClick={() => setPreflightAttempt(attempt => attempt + 1)}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button></div>}
            {!preflightLoading && preflight && !preflight.emailConfigured && <p role="alert" className="text-sm text-destructive">O canal de e-mail está sem configuração válida ou indisponível. O agendamento fica bloqueado até a integração estar ativa.</p>}
            {!preflightLoading && preflight?.recipients.length === 0 && <p role="status" className="text-sm text-muted-foreground">Nenhum membro ativo com acesso a esta fonte pode receber o relatório.</p>}
            {preflight?.recipients.map(recipient => {
              const selected = saveForm.destinatarios.split(',').map(email => email.trim().toLocaleLowerCase('pt-BR')).includes(recipient.email.toLocaleLowerCase('pt-BR'));
              return <label key={recipient.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  aria-label={`Destinatário ${recipient.nome} (${recipient.email})`}
                  checked={selected}
                  onCheckedChange={checked => {
                    const current = saveForm.destinatarios.split(',').map(email => email.trim()).filter(Boolean);
                    const next = checked
                      ? [...current.filter(email => email.toLocaleLowerCase('pt-BR') !== recipient.email.toLocaleLowerCase('pt-BR')), recipient.email]
                      : current.filter(email => email.toLocaleLowerCase('pt-BR') !== recipient.email.toLocaleLowerCase('pt-BR'));
                    updateSaveForm({ destinatarios: next.join(', ') });
                  }}
                />
                <span>{recipient.nome} <span className="text-muted-foreground">({recipient.email})</span></span>
              </label>;
            })}
            <label className="flex cursor-pointer items-start gap-2 border-t pt-3 text-sm">
              <Checkbox aria-label="Confirmo o fuso horário de Brasília" checked={timezoneConfirmed} onCheckedChange={checked => setTimezoneConfirmed(checked === true)} />
              <span>Confirmo que horários e períodos usam o fuso de Brasília (<code>America/Sao_Paulo</code>).</span>
            </label>
          </section>}
          <p className="text-sm text-muted-foreground">Depois de salvar, você pode gerenciar este item em <b>Relatórios → Salvos</b>.</p>
        </CardContent>
      </Card>

      <aside className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Critérios incluídos</CardTitle><CardDescription>Resumo da configuração que será salva.</CardDescription></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><span className="text-muted-foreground">Fonte</span><p className="font-medium">{draft.datasetLabel}</p></div>
            <div><span className="text-muted-foreground">Período</span><p className="font-medium">{draft.config.dataInicio ? formatDateForDisplay(draft.config.dataInicio) : 'Sem início'} — {draft.config.dataFim ? formatDateForDisplay(draft.config.dataFim) : 'Sem fim'}</p></div>
            <div><span className="text-muted-foreground">Limite</span><p className="font-medium">{draft.config.limite.toLocaleString('pt-BR')} registros</p></div>
            <div><span className="text-muted-foreground">Colunas</span><p className="font-medium">{draft.config.colunas.length} selecionadas</p></div>
          </CardContent>
        </Card>
        <div className="flex flex-col-reverse gap-2 sm:flex-row xl:flex-col">
          <Button onClick={() => void save()} disabled={saving || formBlocked || !saveForm.nome.trim() || !canSchedule}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Star className="mr-2 h-4 w-4" />}
            {canUpdateSavedReport ? 'Salvar alterações' : 'Salvar relatório'}
          </Button>
        </div>
      </aside>
    </div>
  </div>;
}
