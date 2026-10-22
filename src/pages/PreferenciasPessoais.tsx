import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CalendarDays, LayoutPanelTop, Loader2, RotateCcw, Save, Shield, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { applyUIPreferences } from '@/lib/uiPreferences';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type Preferences = {
  density: 'comfortable' | 'compact';
  high_contrast: boolean;
  text_size: 'normal' | 'large';
  start_page: '/dashboard' | '/agenda' | '/tarefas' | '/notificacoes';
  date_format: 'DD/MM/YYYY' | 'YYYY-MM-DD';
  browser_notifications: boolean;
  email_daily_summary: boolean;
};

const defaults: Preferences = {
  density: 'comfortable', high_contrast: false, text_size: 'normal', start_page: '/dashboard', date_format: 'DD/MM/YYYY',
  browser_notifications: true, email_daily_summary: false,
};

export default function PreferenciasPessoais() {
  const { user, profile } = useSupabaseAuth();
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (!user?.id || !profile?.clinica_id) {
      setLoading(false);
      setLoadError('Não foi possível identificar sua conta e clínica. Atualize a página ou entre novamente.');
      return;
    }
    setLoading(true); setLoadError(null);
    try {
      const { data, error } = await (supabase as any).from('user_preferences')
        .select('density,high_contrast,text_size,start_page,date_format,browser_notifications,email_daily_summary')
        .eq('user_id', user.id).eq('clinica_id', profile.clinica_id).maybeSingle();
      if (generation !== loadGeneration.current) return;
      if (error) setLoadError('Não foi possível carregar suas preferências. Tente novamente.');
      else {
        const next = data ? { ...defaults, ...data } as Preferences : defaults;
        setPreferences(next);
        applyUIPreferences(next);
      }
    } catch {
      if (generation === loadGeneration.current) setLoadError('Não foi possível carregar suas preferências. Tente novamente.');
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [user?.id, profile?.clinica_id]);

  useEffect(() => {
    void load();
    return () => { loadGeneration.current += 1; };
  }, [load]);

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    applyUIPreferences(next);
  }

  // email_daily_summary não tem efeito na tela (indisponível), por isso fica fora da contagem.
  const changedCount = (Object.keys(defaults) as (keyof Preferences)[])
    .filter(key => key !== 'email_daily_summary' && preferences[key] !== defaults[key]).length;

  function restoreDefaults() {
    const next = { ...defaults, email_daily_summary: preferences.email_daily_summary };
    setPreferences(next);
    applyUIPreferences(next);
  }

  async function save() {
    if (!user?.id || !profile?.clinica_id) return;
    setSaving(true);
    const snapshot = preferences;
    try {
      try {
        const { error } = await (supabase as any).from('user_preferences').upsert({
          user_id: user.id, clinica_id: profile.clinica_id, ...snapshot,
        }, { onConflict: 'user_id,clinica_id' });
        if (error) throw error;
      } catch {
        toast.error('Não foi possível salvar', { description: 'Nada foi perdido. Revise sua conexão e tente novamente.' });
        return;
      }
      try {
        localStorage.setItem(`elolab_preferences_${profile.clinica_id}_${user.id}`, JSON.stringify(snapshot));
      } catch {
        // O registro foi salvo no servidor; a cópia local é apenas auxiliar.
      }
      window.dispatchEvent(new CustomEvent('elolab:preferences-changed', { detail: snapshot }));
      toast.success('Preferências salvas');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex min-h-[320px] items-center justify-center" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando preferências…</div>;

  return <main className="mx-auto w-full max-w-4xl space-y-6 pb-24 sm:pb-8">
    <PageHeader
      title="Minhas preferências"
      icon={<SlidersHorizontal />}
      description={<>Personalize sua experiência nesta clínica sem alterar a configuração dos demais usuários.{changedCount > 0 && <> · {changedCount} {changedCount === 1 ? 'ajuste diferente do padrão' : 'ajustes diferentes do padrão'}</>}</>}
      actions={<>
        <Button asChild variant="outline" className="rounded-full gap-2"><Link to="/seguranca"><Shield className="h-4 w-4" />Segurança da conta</Link></Button>
        <Button asChild variant="outline" className="rounded-full gap-2"><Link to="/notificacoes"><Bell className="h-4 w-4" />Notificações</Link></Button>
      </>}
    />
    {loadError && <Alert variant="destructive" className="rounded-xl"><AlertDescription className="flex flex-wrap items-center justify-between gap-3">{loadError}<Button variant="outline" size="sm" className="rounded-full" onClick={() => void load()}>Tentar novamente</Button></AlertDescription></Alert>}
    <fieldset disabled={loading || saving || !!loadError} className="space-y-5 border-0 p-0 m-0 min-w-0">
    <div className="grid gap-5 md:grid-cols-2">
      <Card className="rounded-2xl border-border/60 shadow-xs"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white"><LayoutPanelTop className="h-4 w-4" /></span>Interface</CardTitle><CardDescription>Ajustes salvos para sua conta nesta clínica.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="space-y-2"><Label htmlFor="density">Densidade de conteúdo</Label><Select value={preferences.density} onValueChange={v => update('density', v as Preferences['density'])}><SelectTrigger id="density"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="comfortable">Confortável</SelectItem><SelectItem value="compact">Compacta</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Compacta exibe mais informações por tela.</p></div>
        <div className="space-y-2"><Label htmlFor="text-size">Tamanho do texto</Label><Select value={preferences.text_size} onValueChange={v => update('text_size', v as Preferences['text_size'])}><SelectTrigger id="text-size"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Padrão</SelectItem><SelectItem value="large">Maior</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Amplia o texto e os controles da interface.</p></div>
        <div className="flex min-h-11 items-center justify-between gap-4"><div><Label htmlFor="high-contrast">Alto contraste</Label><p className="text-xs text-muted-foreground">Reforça texto, bordas e indicadores de foco.</p></div><Switch id="high-contrast" checked={preferences.high_contrast} onCheckedChange={v => update('high_contrast', v)} /></div>
        <div className="space-y-2"><Label htmlFor="start-page">Página inicial</Label><Select value={preferences.start_page} onValueChange={v => update('start_page', v as Preferences['start_page'])}><SelectTrigger id="start-page"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="/dashboard">Dashboard</SelectItem>{profile?.roles.some(role => ['admin', 'recepcao', 'enfermagem', 'medico'].includes(role)) && <SelectItem value="/agenda">Agenda</SelectItem>}<SelectItem value="/tarefas">Tarefas</SelectItem><SelectItem value="/notificacoes">Notificações</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Aplicada ao abrir o painel inicial na próxima sessão.</p></div>
      </CardContent></Card>
      <Card className="rounded-2xl border-border/60 shadow-xs"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white"><CalendarDays className="h-4 w-4" /></span>Datas e avisos</CardTitle><CardDescription>Escolha como acompanhar sua rotina.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="space-y-2"><Label htmlFor="date-format">Formato curto de data</Label><Select value={preferences.date_format} onValueChange={v => update('date_format', v as Preferences['date_format'])}><SelectTrigger id="date-format"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DD/MM/YYYY">DD/MM/AAAA</SelectItem><SelectItem value="YYYY-MM-DD">AAAA-MM-DD</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Aplicado às datas numéricas e aos vencimentos. Datas por extenso seguem o formato local.</p></div>
        <div className="flex min-h-11 items-center justify-between gap-4"><div><Label htmlFor="browser-notifications">Avisos no navegador</Label><p className="text-xs text-muted-foreground">Exibe alertas enquanto a plataforma estiver aberta.</p></div><Switch id="browser-notifications" checked={preferences.browser_notifications} onCheckedChange={v => update('browser_notifications', v)} /></div>
        <div className="rounded-xl border border-dashed border-[#BFD8EE] bg-[#F3F8FC] p-3 text-sm text-muted-foreground" role="status"><span className="font-medium text-foreground">Resumo diário por e-mail indisponível.</span> O EloLab ainda não envia esse resumo; esta opção não está ativa e nenhum e-mail será enviado.</div>
      </CardContent></Card>
    </div>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{changedCount > 0 && <Button type="button" variant="outline" className="min-h-11 w-full rounded-full gap-2 sm:w-auto" onClick={restoreDefaults}><RotateCcw className="h-4 w-4" />Restaurar padrão</Button>}<Button className="min-h-11 w-full rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110 sm:w-auto" onClick={() => void save()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{saving ? 'Salvando…' : 'Salvar preferências'}</Button></div>
    </fieldset>
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Bell className="h-4 w-4" />Essas opções ficam separadas por usuário e por clínica.</p>
  </main>;
}
