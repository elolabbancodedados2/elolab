import { type FormEvent, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, FileEdit, Loader2, Lock, Plus, ScrollText } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { ProntuarioAdendos } from '@/components/clinical/ProntuarioAdendos';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { registrarAcessoProntuario, registrarAdendoProntuario } from '@/lib/prontuarioAudit';
import { parseDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';
import { toast } from 'sonner';

type TipoAdendo = 'retificacao' | 'complemento' | 'erratum';
type Relacao<T> = T | T[] | null;
type AdendoContext = {
  id: string;
  paciente_id: string;
  medico_id: string;
  data: string;
  assinado: boolean;
  pacientes: Relacao<{ nome: string | null; nome_social: string | null }>;
  medicos: Relacao<{ nome: string | null; crm: string | null }>;
};

function relacaoUnica<T>(value: Relacao<T> | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function formatarData(data: string) {
  const parsed = parseDateOnly(data);
  return parsed ? format(parsed, 'dd/MM/yyyy', { locale: ptBR }) : data;
}

export default function NovoAdendoProntuarioPage() {
  const { prontuarioId = '' } = useParams();
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const { medicoId, currentMedico, isLoading: medicoCarregando, error: erroMedico } = useCurrentMedico();
  const clinicaId = profile?.clinica_id;
  const [tipo, setTipo] = useState<TipoAdendo>('complemento');
  const [motivo, setMotivo] = useState('');
  const [texto, setTexto] = useState('');
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroGravacao, setErroGravacao] = useState<string | null>(null);
  const submitLock = useRef(false);
  const paginaConcluida = useRef(false);

  const contextoQuery = useQuery({
    queryKey: ['novo-adendo-prontuario', clinicaId, medicoId, prontuarioId],
    enabled: Boolean(clinicaId && medicoId && prontuarioId),
    queryFn: async (): Promise<AdendoContext> => {
      await registrarAcessoProntuario(prontuarioId, 'visualizacao');
      const { data, error } = await supabase
        .from('prontuarios')
        .select('id,paciente_id,medico_id,data,assinado,pacientes(nome,nome_social),medicos(nome,crm)')
        .eq('id', prontuarioId)
        .eq('clinica_id', clinicaId!)
        .eq('medico_id', medicoId!)
        .eq('assinado', true)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('O prontuário não está disponível para este profissional nesta clínica.');
      const clinician = relacaoUnica(data.medicos);
      if (!clinician?.crm?.trim()) throw new Error('O CRM vinculado ao prontuário não está disponível. Contate a administração da clínica.');
      return data as AdendoContext;
    },
  });

  const contexto = contextoQuery.data;
  const paciente = relacaoUnica(contexto?.pacientes);
  const medico = relacaoUnica(contexto?.medicos);
  const nomePaciente = paciente?.nome_social || paciente?.nome || 'Paciente';
  const nomeMedico = medico?.nome || currentMedico?.nome || 'Profissional responsável';
  const returnTo = useMemo(() => contexto
    ? `/prontuarios?paciente=${encodeURIComponent(contexto.paciente_id)}&prontuario=${encodeURIComponent(contexto.id)}&secao=adendos`
    : '/prontuarios', [contexto]);

  const motivoInvalido = tentouEnviar && !motivo.trim();
  const textoInvalido = tentouEnviar && !texto.trim();
  const dirty = Boolean(tipo !== 'complemento' || motivo.trim() || texto.trim());
  const loading = medicoCarregando || contextoQuery.isLoading;
  const error = erroMedico ?? contextoQuery.error;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTentouEnviar(true);
    setErroGravacao(null);
    if (submitLock.current || !contexto || !motivo.trim() || !texto.trim()) return;

    submitLock.current = true;
    setSalvando(true);
    try {
      await registrarAdendoProntuario(contexto.id, tipo, motivo, texto);
      paginaConcluida.current = true;
      toast.success('Adendo registrado', { description: 'O registro imutável foi adicionado ao prontuário.' });
      navigate(returnTo, { replace: true });
    } catch (saveError) {
      const message = `${mensagemDeErro(saveError)} O texto foi mantido nesta página.`;
      setErroGravacao(message);
      toast.error('Não foi possível registrar o adendo', { description: message });
    } finally {
      submitLock.current = false;
      setSalvando(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-24 sm:pb-8">
      <UnsavedChangesGuard dirty={dirty} busy={salvando} completed={paginaConcluida} />
      <PageHeader
        title="Novo adendo ao prontuário"
        description="Registre uma complementação ou correção sem alterar a evolução assinada. O novo registro recebe autoria, data e hash de integridade."
        icon={<FileEdit />}
        actions={contexto && (
          <Button type="button" variant="outline" onClick={() => navigate(returnTo)}>
            <ArrowLeft className="mr-2 h-4 w-4" />Voltar à ficha
          </Button>
        )}
      />

      {loading ? (
        <div role="status" className="flex min-h-32 items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />Verificando prontuário e vínculo profissional…
        </div>
      ) : error || !contexto ? (
        <section role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <h2 className="font-semibold text-foreground">Não foi possível abrir este prontuário</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Confirme o acesso clínico e tente novamente.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {contextoQuery.isError && <Button variant="outline" onClick={() => void contextoQuery.refetch()}>Tentar novamente</Button>}
            <Button variant="outline" onClick={() => navigate('/prontuarios')}>Voltar aos prontuários</Button>
          </div>
        </section>
      ) : (
        <>
          <section aria-label="Contexto do prontuário" className="grid gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:grid-cols-3 sm:divide-x sm:divide-border sm:px-5">
            <div className="min-w-0 sm:pr-4">
              <p className="text-xs font-medium text-muted-foreground">Paciente</p>
              <p className="mt-1 truncate font-semibold text-foreground">{nomePaciente}</p>
            </div>
            <div className="min-w-0 sm:px-4">
              <p className="text-xs font-medium text-muted-foreground">Evolução assinada</p>
              <p className="mt-1 font-semibold text-foreground">{formatarData(contexto.data)}</p>
            </div>
            <div className="min-w-0 sm:pl-4">
              <p className="text-xs font-medium text-muted-foreground">Profissional responsável</p>
              <p className="mt-1 truncate font-semibold text-foreground">{nomeMedico}</p>
              <p className="text-xs text-muted-foreground">CRM {medico?.crm}</p>
            </div>
          </section>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <section className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
              <div className="flex items-start gap-3 border-b border-border pb-4">
                <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <h2 className="font-semibold text-foreground">Registro complementar imutável</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Correções e complementos ficam anexados à evolução original. Depois de registrados, não podem ser editados ou excluídos.
                  </p>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
                <div className="space-y-2">
                  <Label htmlFor="adendo-tipo">Tipo de registro <span aria-hidden="true">*</span></Label>
                  <Select value={tipo} onValueChange={(value) => setTipo(value as TipoAdendo)} disabled={salvando}>
                    <SelectTrigger id="adendo-tipo" aria-label="Tipo de registro"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="complemento">Complemento</SelectItem>
                      <SelectItem value="retificacao">Retificação</SelectItem>
                      <SelectItem value="erratum">Erratum</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-5 text-muted-foreground">Escolha conforme a finalidade do novo registro.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adendo-motivo">Motivo <span aria-hidden="true">*</span></Label>
                  <Textarea
                    id="adendo-motivo"
                    required
                    aria-invalid={motivoInvalido}
                    aria-describedby={motivoInvalido ? 'adendo-motivo-erro' : undefined}
                    placeholder="Explique por que esta informação precisa ser acrescentada ou corrigida."
                    value={motivo}
                    onChange={(event) => setMotivo(event.target.value)}
                    disabled={salvando}
                    rows={3}
                  />
                  {motivoInvalido && <p id="adendo-motivo-erro" className="text-sm text-destructive">Informe o motivo do adendo.</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adendo-conteudo">Conteúdo do adendo <span aria-hidden="true">*</span></Label>
                <Textarea
                  id="adendo-conteudo"
                  required
                  aria-invalid={textoInvalido}
                  aria-describedby={textoInvalido ? 'adendo-conteudo-erro' : undefined}
                  placeholder="Escreva a informação complementar ou a correção clínica."
                  value={texto}
                  onChange={(event) => setTexto(event.target.value)}
                  disabled={salvando}
                  rows={8}
                  className="min-h-40 resize-y"
                />
                {textoInvalido && <p id="adendo-conteudo-erro" className="text-sm text-destructive">Informe o conteúdo do adendo.</p>}
              </div>

              {erroGravacao && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-foreground">{erroGravacao}</div>}

              <div data-testid="adendo-mobile-actions" className="-mx-4 flex flex-col-reverse gap-2 border-t border-border bg-background p-4 sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:pt-1">
                <Button type="button" variant="outline" disabled={salvando} onClick={() => navigate(returnTo)}>Cancelar</Button>
                <Button type="submit" disabled={salvando || !contexto}>
                  {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  {salvando ? 'Registrando…' : 'Registrar adendo imutável'}
                </Button>
              </div>
            </section>
          </form>

          <section className="space-y-3 border-t border-border pt-5" aria-labelledby="historico-adendos-heading">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary" />
              <h2 id="historico-adendos-heading" className="font-semibold text-foreground">Adendos anteriores</h2>
            </div>
            <ProntuarioAdendos prontuarioId={contexto.id} />
          </section>
        </>
      )}
    </div>
  );
}
