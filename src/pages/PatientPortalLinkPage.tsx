import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Link2, Loader2, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

interface PatientPortalContext {
  id: string;
  nome: string;
  nome_social: string | null;
  ativo: boolean | null;
}

interface PortalLinkRouteState {
  patientId?: unknown;
  returnTo?: unknown;
  returnState?: unknown;
  returnScrollTop?: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function safeReturnTo(value: unknown, patientId: string) {
  if (typeof value !== 'string' || value.includes('#')) return '';
  if (value === '/recepcao') return value;
  if (!value.startsWith('/pacientes')) return '';
  const [pathname, query = ''] = value.split('?');
  if (pathname === `/pacientes/${patientId}`) return value;
  if (pathname === '/pacientes' && new URLSearchParams(query).get('paciente') === patientId) return value;
  if (pathname === '/pacientes' && !query) return value;
  return '';
}

function validatePortalLink(value: unknown) {
  if (typeof value !== 'string') throw new Error('O servidor não retornou um link válido.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('O servidor retornou um link inválido.');
  }
  const token = url.searchParams.get('token');
  if (url.origin !== 'https://app.elolab.com.br' || url.pathname !== '/portal-paciente' || !token || !/^[a-f0-9]{64}$/i.test(token)) {
    throw new Error('O servidor retornou um link em formato inesperado. O acesso não foi exibido.');
  }
  return url.toString();
}

export default function PatientPortalLinkPage() {
  const { patientId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, isLoading: authLoading } = useSupabaseAuth();
  const routeState = location.state as PortalLinkRouteState | null;
  const routeMatchesPatient = routeState?.patientId === patientId;
  const returnTo = routeMatchesPatient ? safeReturnTo(routeState?.returnTo, patientId) || '/pacientes' : '/pacientes';
  const inheritedState = routeMatchesPatient && isObject(routeState?.returnState) ? routeState.returnState : null;
  const returnScrollTop = routeMatchesPatient && typeof routeState?.returnScrollTop === 'number'
    ? Math.max(0, routeState.returnScrollTop)
    : null;
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyNotice, setCopyNotice] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [qrCodeError, setQrCodeError] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const submissionLock = useRef(false);
  const completed = useRef(false);

  useEffect(() => {
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    if (!generatedUrl) {
      setQrCodeUrl('');
      setQrCodeError(false);
      return () => { active = false; };
    }
    setQrCodeUrl('');
    setQrCodeError(false);
    void QRCode.toDataURL(generatedUrl, { width: 224, margin: 2 })
      .then(url => { if (active) setQrCodeUrl(url); })
      .catch(() => { if (active) setQrCodeError(true); });
    return () => { active = false; };
  }, [generatedUrl]);

  const patientQuery = useQuery({
    queryKey: ['patient-portal-link-context', profile?.clinica_id ?? null, patientId],
    enabled: Boolean(profile?.clinica_id && patientId),
    queryFn: async (): Promise<PatientPortalContext | null> => {
      if (!profile?.clinica_id || !patientId) throw new Error('Clínica ou paciente não identificado.');
      const { data, error } = await supabase
        .from('pacientes')
        .select('id, nome, nome_social, ativo')
        .eq('clinica_id', profile.clinica_id)
        .eq('id', patientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const returnToPatient = () => navigate(returnTo, {
    replace: true,
    state: {
      ...(inheritedState ?? {}),
      ...(returnScrollTop !== null ? { returnScrollTop } : {}),
    },
  });

  const copyLink = async () => {
    if (!generatedUrl) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Cópia indisponível neste navegador.');
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setCopyNotice('Link copiado. Os links anteriores foram invalidados pela rotação.');
    } catch {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
      setCopyNotice('Cópia automática indisponível. O link está selecionado; pressione Ctrl+C (ou ⌘C no Mac).');
    }
  };

  const generateLink = async () => {
    if (!patientQuery.data || patientQuery.data.ativo === false || generating || submissionLock.current) return;
    submissionLock.current = true;
    setGenerating(true);
    setGenerationError('');
    try {
      const { data, error } = await supabase.rpc('link_portal_paciente', { p_paciente_id: patientQuery.data.id });
      if (error) throw error;
      if (!data) throw new Error('Paciente não encontrado nesta clínica.');
      const url = validatePortalLink(data);
      setGeneratedUrl(url);
      setCopied(false);
      setCopyNotice('');
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Cópia indisponível neste navegador.');
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setCopyNotice('Link gerado e copiado. Os links anteriores do Portal foram invalidados.');
      } catch {
        setCopyNotice('Link gerado. Copie o endereço exibido nesta tela para compartilhar com o paciente.');
      }
    } catch (error) {
      setGenerationError(mensagemDeErro(error));
    } finally {
      submissionLock.current = false;
      setGenerating(false);
    }
  };

  if (!UUID.test(patientId)) {
    return <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6"><PageHeader title="Gerar link do Portal" icon={<Link2 />} /><Alert variant="destructive"><AlertTitle>Ficha inválida</AlertTitle><AlertDescription>Volte à lista e abra o Portal pela ficha correta do paciente.</AlertDescription></Alert><Button type="button" variant="outline" onClick={returnToPatient}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button></main>;
  }

  if (authLoading || patientQuery.isLoading) {
    return <main className="mx-auto flex min-h-48 w-full max-w-4xl items-center justify-center gap-3 px-4 text-sm text-muted-foreground sm:px-6" aria-busy="true" role="status"><Loader2 className="h-5 w-5 animate-spin" />Carregando a ficha do paciente…</main>;
  }

  if (patientQuery.isError) {
    return <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6"><PageHeader title="Gerar link do Portal" icon={<Link2 />} actions={<Button type="button" variant="outline" onClick={returnToPatient}><ArrowLeft className="mr-2 h-4 w-4" />Voltar à ficha</Button>} /><ErrorState title="Não foi possível carregar o paciente" error={patientQuery.error} onRetry={() => void patientQuery.refetch()} /></main>;
  }

  const patient = patientQuery.data;
  if (!patient) {
    return <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6"><PageHeader title="Gerar link do Portal" icon={<Link2 />} actions={<Button type="button" variant="outline" onClick={returnToPatient}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>} /><Alert variant="destructive"><AlertTitle>Paciente indisponível</AlertTitle><AlertDescription>Esta ficha não pertence à clínica ativa ou não está mais disponível.</AlertDescription></Alert></main>;
  }

  const displayName = patient.nome_social || patient.nome;
  const isActive = patient.ativo !== false;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 pb-24 sm:px-6 md:pb-6">
      <PageHeader
        title="Acesso ao Portal do Paciente"
        description="Gere um link para compartilhar diretamente com a pessoa."
        icon={<Link2 />}
        actions={<Button type="button" variant="outline" onClick={returnToPatient} disabled={generating} className="gap-2 rounded-full"><ArrowLeft className="h-4 w-4" />Voltar à ficha</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.75fr)]">
        <Card>
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Ficha do paciente</p>
            <CardTitle className="text-xl">{displayName}</CardTitle>
            <CardDescription>O link dá acesso ao Portal deste paciente até expirar ou ser revogado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!isActive ? (
              <Alert variant="destructive"><AlertTitle>Paciente inativo</AlertTitle><AlertDescription>Reative a ficha antes de gerar um novo link para o Portal.</AlertDescription></Alert>
            ) : generatedUrl ? (
              <div className="space-y-4">
                <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>Link ativo por até um ano</AlertTitle><AlertDescription>{copyNotice || 'O token é exibido apenas nesta tela e permanece somente em memória do navegador. Ao sair, você precisará gerar outro link para vê-lo novamente.'}</AlertDescription></Alert>
                <div className="space-y-2">
                  <div className="flex flex-col items-center gap-2 rounded-xl border bg-background p-4 text-center">
                    {qrCodeUrl ? <img src={qrCodeUrl} alt="QR code para abrir o Portal do Paciente" className="h-56 w-56" /> : qrCodeError ? <p role="status" className="max-w-xs py-8 text-sm text-muted-foreground">Não foi possível gerar o QR code. Use o link abaixo para compartilhar com o paciente.</p> : <Loader2 aria-label="Gerando QR code" className="h-8 w-8 animate-spin text-muted-foreground" />}
                    <p className="max-w-sm text-xs text-muted-foreground">Para o pré-atendimento, confirme a identidade da pessoa antes de mostrar o QR ou compartilhar o link. O acesso inclui todo o Portal do Paciente.</p>
                  </div>
                  <label htmlFor="patient-portal-link" className="text-sm font-medium">Link para compartilhar</label>
                  <Input ref={linkInputRef} id="patient-portal-link" value={generatedUrl} readOnly onFocus={(event) => event.currentTarget.select()} onCopy={() => { setCopied(true); setCopyNotice('Link copiado. Os links anteriores foram invalidados pela rotação.'); }} aria-label="Link de acesso ao portal do paciente" />
                </div>
                <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={returnToPatient} className="gap-2"><ArrowLeft className="h-4 w-4" />Voltar à ficha</Button>
                  <Button type="button" onClick={() => void copyLink()} className="gap-2">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copiar novamente' : 'Copiar link'}</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={(event) => { event.preventDefault(); void generateLink(); }} className="space-y-5">
                <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>A emissão substitui o link anterior</AlertTitle><AlertDescription>O link anterior será revogado. O novo acesso dura até um ano, e o token completo aparecerá somente nesta tela e no clipboard.</AlertDescription></Alert>
                {generationError && <Alert variant="destructive"><AlertTitle>Não foi possível gerar o link</AlertTitle><AlertDescription>{generationError}</AlertDescription></Alert>}
                <div className="flex justify-end border-t border-border pt-4">
                  <Button type="submit" disabled={generating} className="w-full gap-2 sm:w-auto">
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
                    {generating ? 'Gerando link…' : 'Gerar e substituir link anterior'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <aside aria-labelledby="portal-security" className="space-y-4 lg:border-l lg:border-border lg:pl-6">
          <div>
            <h2 id="portal-security" className="text-base font-semibold">Compartilhamento seguro</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">Envie o link somente ao paciente ou responsável após confirmar a identidade.</p>
          </div>
          <div className="flex gap-3 border-t border-border pt-4"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="h-4 w-4" /></span><p className="text-sm leading-5">Cada emissão invalida os links anteriores. A ação também pode ser revogada na ficha do paciente.</p></div>
          <p className="text-sm text-muted-foreground">Este endereço de tarefa não contém o token. Ele não é gravado em URL, local storage ou armazenamento de sessão.</p>
        </aside>
      </div>

      <UnsavedChangesGuard dirty={Boolean(generatedUrl && !copied)} busy={generating} completed={completed} />
    </main>
  );
}
