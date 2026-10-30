import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, Loader2, Shield, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/hooks/use-toast';
import { loadPatientConsentRecords } from '@/lib/patientConsentRecords';
import { supabase } from '@/integrations/supabase/client';
import { type Consentimento, TERMO_LGPD, TIPOS_CONSENTIMENTO } from '@/lib/patientConsent';

type Task = 'novo' | 'revogar';
type ConsentType = (typeof TIPOS_CONSENTIMENTO)[number]['tipo'];

function statusFor(consentimentos: Consentimento[], tipo: string) {
  const consentimento = consentimentos.find((item) => item.tipo_consentimento === tipo);
  if (!consentimento) return 'pendente';
  if (consentimento.revogado) return 'revogado';
  if (consentimento.aceito) return 'aceito';
  return 'recusado';
}

function getPatientReturnTo(requested: unknown, patientId: string) {
  const fallback = `/pacientes/${encodeURIComponent(patientId)}?tab=lgpd`;
  if (typeof requested !== 'string') return fallback;
  try {
    const target = new URL(requested, window.location.origin);
    if (target.origin !== window.location.origin) return fallback;
    if (target.pathname === `/pacientes/${encodeURIComponent(patientId)}`) {
      target.searchParams.set('tab', 'lgpd');
      return `${target.pathname}${target.search}`;
    }
    if (target.pathname === '/pacientes' && target.searchParams.get('paciente') === patientId) {
      target.searchParams.set('tab', 'lgpd');
      return `${target.pathname}${target.search}`;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export default function ConsentimentoLGPDTaskPage({ task }: { task: Task }) {
  const { patientId = '', consentType } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const { toast } = useToast();
  const clinicId = profile?.clinica_id;
  const [aceites, setAceites] = useState<Record<string, boolean>>({});
  const [motivoRevogacao, setMotivoRevogacao] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const completed = useRef(false);

  const patientQuery = useQuery({
    queryKey: ['consentimento-paciente', clinicId, patientId],
    enabled: Boolean(clinicId && patientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pacientes')
        .select('id, nome, nome_social')
        .eq('clinica_id', clinicId!)
        .eq('id', patientId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Este paciente não está disponível para a clínica ativa.');
      return data;
    },
  });
  const consentimentosQuery = useQuery({
    queryKey: ['consentimentos-paciente', clinicId, patientId],
    enabled: Boolean(clinicId && patientQuery.data?.id),
    queryFn: () => loadPatientConsentRecords(clinicId!, patientId),
    staleTime: 0,
  });

  const consentimentos = consentimentosQuery.data ?? [];
  const patientName = patientQuery.data?.nome_social || patientQuery.data?.nome || 'Paciente';
  const selectedConsentType = TIPOS_CONSENTIMENTO.find((item) => item.tipo === consentType);
  const navigationState = location.state && typeof location.state === 'object'
    ? location.state as Record<string, unknown>
    : {};
  const returnTo = getPatientReturnTo(navigationState.consentReturnTo, patientId);
  const returnState = navigationState.consentReturnState;
  const returnToPatient = () => navigate(returnTo, { replace: true, state: returnState });
  const dirty = task === 'novo'
    ? Object.values(aceites).some(Boolean)
    : Boolean(motivoRevogacao.trim());

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(null);
    const tiposAceitos = Object.entries(aceites).filter(([, aceito]) => aceito).map(([tipo]) => tipo);
    if (tiposAceitos.length === 0) {
      toast({ title: 'Atenção', description: 'Selecione pelo menos um tipo de consentimento.', variant: 'destructive' });
      return;
    }
    if (submitLock.current || !clinicId || !patientQuery.data) return;

    submitLock.current = true;
    setSaving(true);
    const tiposPersistidos: string[] = [];
    try {
      const now = new Date().toISOString();
      for (const tipo of tiposAceitos) {
        const existente = consentimentos.find((item) => item.tipo_consentimento === tipo && !item.revogado);
        if (existente) {
          const { data, error } = await supabase
            .from('consentimentos_lgpd')
            .update({ aceito: true, data_aceite: now, revogado: false, data_revogacao: null, motivo_revogacao: null })
            .eq('id', existente.id)
            .select('id')
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error('Não foi possível confirmar a gravação do consentimento.');
        } else {
          const { data, error } = await supabase
            .from('consentimentos_lgpd')
            .insert({
              paciente_id: patientId,
              tipo_consentimento: tipo,
              versao_termo: '1.0',
              aceito: true,
              data_aceite: now,
            })
            .select('id')
            .single();
          if (error) throw error;
          if (!data) throw new Error('Não foi possível confirmar a gravação do consentimento.');
        }
        tiposPersistidos.push(tipo);
      }

      completed.current = true;
      toast({ title: 'Consentimento registrado', description: 'Os termos foram aceitos com sucesso.' });
      returnToPatient();
    } catch (error) {
      console.error('Erro ao registrar consentimento:', error);
      const description = tiposPersistidos.length
        ? 'Alguns consentimentos foram registrados e já foram atualizados na lista. Confirme os itens restantes antes de continuar.'
        : 'Não foi possível registrar o consentimento. Nenhum aceite foi confirmado.';
      setSaveError(description);
      toast({ title: tiposPersistidos.length ? 'Registro parcial' : 'Erro', description, variant: 'destructive' });
      if (tiposPersistidos.length) {
        setAceites((previous) => Object.fromEntries(Object.entries(previous).filter(([tipo]) => !tiposPersistidos.includes(tipo))));
        await consentimentosQuery.refetch();
      }
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  };

  const handleRevoke = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(null);
    if (!selectedConsentType || !motivoRevogacao.trim()) {
      toast({ title: 'Atenção', description: 'Informe o motivo da revogação.', variant: 'destructive' });
      return;
    }
    if (submitLock.current) return;
    const consentimento = consentimentos.find((item) => item.tipo_consentimento === selectedConsentType.tipo && item.aceito && !item.revogado);
    if (!consentimento) {
      setSaveError('Este consentimento não está mais ativo. Atualize a lista e tente novamente.');
      return;
    }

    submitLock.current = true;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('consentimentos_lgpd')
        .update({ revogado: true, data_revogacao: new Date().toISOString(), motivo_revogacao: motivoRevogacao.trim() })
        .eq('id', consentimento.id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Não foi possível confirmar a revogação. Atualize a lista e tente novamente.');

      completed.current = true;
      toast({ title: 'Consentimento revogado', description: 'A revogação foi registrada com sucesso.' });
      returnToPatient();
    } catch (error) {
      console.error('Erro ao revogar consentimento:', error);
      const description = 'Não foi possível revogar o consentimento.';
      setSaveError(description);
      toast({ title: 'Erro', description, variant: 'destructive' });
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  };

  const loading = patientQuery.isLoading || (Boolean(patientQuery.data) && consentimentosQuery.isLoading);
  const error = patientQuery.error || consentimentosQuery.error;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-24 sm:pb-8">
      <UnsavedChangesGuard dirty={dirty} busy={saving} completed={completed} />
      <PageHeader
        title={task === 'novo' ? 'Novo consentimento' : 'Revogar consentimento'}
        description="Registre a manifestação de consentimento na ficha do paciente."
        icon={<Shield />}
        actions={<Button type="button" variant="outline" onClick={returnToPatient}><ArrowLeft className="mr-2 h-4 w-4" />Voltar à ficha</Button>}
      />

      {loading ? (
        <div role="status" className="flex min-h-32 items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />Carregando os dados do paciente…
        </div>
      ) : !clinicId || error || !patientQuery.data ? (
        <section role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <h2 className="font-semibold text-foreground">Não foi possível abrir este consentimento</h2>
          <p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : 'Clínica ou paciente não identificado.'}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {patientQuery.isError && <Button variant="outline" onClick={() => void patientQuery.refetch()}>Tentar novamente</Button>}
            {consentimentosQuery.isError && <Button variant="outline" onClick={() => void consentimentosQuery.refetch()}>Atualizar histórico</Button>}
            <Button variant="outline" onClick={() => navigate('/pacientes')}>Voltar aos pacientes</Button>
          </div>
        </section>
      ) : task === 'revogar' && (!selectedConsentType || statusFor(consentimentos, consentType || '') !== 'aceito') ? (
        <section role="alert" className="rounded-xl border border-border bg-muted/30 p-5">
          <h2 className="font-semibold text-foreground">Este consentimento não está ativo</h2>
          <p className="mt-1 text-sm text-muted-foreground">Atualize o histórico e selecione um consentimento aceito para revogar.</p>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => void consentimentosQuery.refetch()}>Atualizar histórico</Button>
            <Button variant="outline" onClick={returnToPatient}>Voltar à ficha</Button>
          </div>
        </section>
      ) : (
        <>
          <section aria-label="Paciente" className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Paciente</p>
            <p className="mt-1 font-semibold text-foreground">{patientName}</p>
          </section>

          {saveError && <Alert variant="destructive" role="alert"><AlertDescription>{saveError}</AlertDescription></Alert>}

          {task === 'novo' ? (
            <form onSubmit={handleRegister} className="space-y-6">
              <section aria-labelledby="consent-term-title" className="space-y-3">
                <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h2 id="consent-term-title" className="font-semibold">Termo de consentimento</h2></div>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-muted/30 p-4 text-sm leading-6 whitespace-pre-line">{TERMO_LGPD}</div>
              </section>

              <fieldset className="space-y-4">
                <legend className="font-semibold">Consentimentos</legend>
                <p className="text-sm text-muted-foreground">Selecione os itens que serão registrados para este paciente.</p>
                {TIPOS_CONSENTIMENTO.map((tipo) => {
                  const disabled = statusFor(consentimentos, tipo.tipo) === 'aceito';
                  return (
                    <div key={tipo.tipo} className="flex items-start gap-3 border-b border-border pb-4 last:border-b-0">
                      <Checkbox
                        id={tipo.tipo}
                        checked={aceites[tipo.tipo] || false}
                        onCheckedChange={(checked) => setAceites((previous) => ({ ...previous, [tipo.tipo]: checked === true }))}
                        disabled={disabled}
                      />
                      <div className="grid gap-1.5 leading-normal">
                        <Label htmlFor={tipo.tipo} className={disabled ? 'text-muted-foreground' : ''}>
                          {tipo.titulo}{tipo.tipo === 'tratamento_dados' && <span className="ml-1 text-destructive">*</span>}
                          {disabled && <Badge variant="outline" className="ml-2 text-xs">Já aceito</Badge>}
                        </Label>
                        <p className="text-sm text-muted-foreground">{tipo.descricao}</p>
                      </div>
                    </div>
                  );
                })}
              </fieldset>

              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={returnToPatient} disabled={saving}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Registrando…' : 'Registrar Consentimento'}</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRevoke} className="space-y-6">
              <section className="space-y-2">
                <h2 className="font-semibold">{selectedConsentType?.titulo}</h2>
                <p className="text-sm text-muted-foreground">Esta ação irá revogar o consentimento do paciente. Informe o motivo:</p>
                <Label htmlFor="motivo-revogacao">Motivo da revogação</Label>
                <Textarea
                  id="motivo-revogacao"
                  value={motivoRevogacao}
                  onChange={(event) => setMotivoRevogacao(event.target.value)}
                  placeholder="Motivo da revogação..."
                  rows={5}
                  required
                />
              </section>
              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={returnToPatient} disabled={saving}>Cancelar</Button>
                <Button type="submit" variant="destructive" disabled={saving}>
                  {saving ? 'Revogando…' : <><XCircle className="mr-2 h-4 w-4" />Confirmar Revogação</>}
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
