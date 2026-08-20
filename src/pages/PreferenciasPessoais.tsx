import { useEffect, useState } from 'react';
import { Bell, CalendarDays, LayoutPanelTop, Loader2, Save, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type Preferences = {
  density: 'comfortable' | 'compact';
  start_page: '/dashboard' | '/agenda' | '/tarefas' | '/notificacoes';
  date_format: 'DD/MM/YYYY' | 'YYYY-MM-DD';
  browser_notifications: boolean;
  email_daily_summary: boolean;
};

const defaults: Preferences = {
  density: 'comfortable', start_page: '/dashboard', date_format: 'DD/MM/YYYY',
  browser_notifications: true, email_daily_summary: false,
};

export default function PreferenciasPessoais() {
  const { user, profile } = useSupabaseAuth();
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    if (!user?.id || !profile?.clinica_id) return;
    setLoading(true); setLoadError(null);
    const { data, error } = await (supabase as any).from('user_preferences')
      .select('density,start_page,date_format,browser_notifications,email_daily_summary')
      .eq('user_id', user.id).eq('clinica_id', profile.clinica_id).maybeSingle();
    if (error) setLoadError('Não foi possível carregar suas preferências. Tente novamente.');
    else {
      const next = data ? { ...defaults, ...data } as Preferences : defaults;
      setPreferences(next);
      document.documentElement.dataset.density = next.density;
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [user?.id, profile?.clinica_id]);

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences(current => ({ ...current, [key]: value }));
    if (key === 'density') document.documentElement.dataset.density = String(value);
  }

  async function save() {
    if (!user?.id || !profile?.clinica_id) return;
    setSaving(true);
    const { error } = await (supabase as any).from('user_preferences').upsert({
      user_id: user.id, clinica_id: profile.clinica_id, ...preferences,
    }, { onConflict: 'user_id,clinica_id' });
    setSaving(false);
    if (error) return toast.error('Não foi possível salvar', { description: 'Nada foi perdido. Revise sua conexão e tente novamente.' });
    localStorage.setItem(`elolab_preferences_${profile.clinica_id}_${user.id}`, JSON.stringify(preferences));
    window.dispatchEvent(new CustomEvent('elolab:preferences-changed', { detail: preferences }));
    toast.success('Preferências salvas');
  }

  if (loading) return <div className="flex min-h-[320px] items-center justify-center" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando preferências…</div>;

  return <main className="mx-auto w-full max-w-4xl space-y-6 pb-24 sm:pb-8">
    <header><h1 className="flex items-center gap-2 text-2xl font-bold"><SlidersHorizontal className="h-6 w-6 text-primary" />Minhas preferências</h1><p className="mt-1 text-sm text-muted-foreground">Personalize sua experiência nesta clínica sem alterar a configuração dos demais usuários.</p></header>
    {loadError && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center justify-between gap-3">{loadError}<Button variant="outline" size="sm" onClick={() => void load()}>Tentar novamente</Button></AlertDescription></Alert>}
    <div className="grid gap-5 md:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><LayoutPanelTop className="h-5 w-5" />Interface</CardTitle><CardDescription>Ajustes visuais aplicados só à sua sessão.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="space-y-2"><Label htmlFor="density">Densidade de conteúdo</Label><Select value={preferences.density} onValueChange={v => update('density', v as Preferences['density'])}><SelectTrigger id="density"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="comfortable">Confortável</SelectItem><SelectItem value="compact">Compacta</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Compacta exibe mais informações por tela.</p></div>
        <div className="space-y-2"><Label htmlFor="start-page">Página inicial</Label><Select value={preferences.start_page} onValueChange={v => update('start_page', v as Preferences['start_page'])}><SelectTrigger id="start-page"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="/dashboard">Dashboard</SelectItem><SelectItem value="/agenda">Agenda</SelectItem><SelectItem value="/tarefas">Tarefas</SelectItem><SelectItem value="/notificacoes">Notificações</SelectItem></SelectContent></Select></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-5 w-5" />Datas e avisos</CardTitle><CardDescription>Escolha como acompanhar sua rotina.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="space-y-2"><Label htmlFor="date-format">Formato de data</Label><Select value={preferences.date_format} onValueChange={v => update('date_format', v as Preferences['date_format'])}><SelectTrigger id="date-format"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DD/MM/YYYY">DD/MM/AAAA</SelectItem><SelectItem value="YYYY-MM-DD">AAAA-MM-DD</SelectItem></SelectContent></Select></div>
        <div className="flex min-h-11 items-center justify-between gap-4"><div><Label htmlFor="browser-notifications">Avisos no navegador</Label><p className="text-xs text-muted-foreground">Exibe alertas enquanto a plataforma estiver aberta.</p></div><Switch id="browser-notifications" checked={preferences.browser_notifications} onCheckedChange={v => update('browser_notifications', v)} /></div>
        <div className="flex min-h-11 items-center justify-between gap-4"><div><Label htmlFor="daily-summary">Resumo diário por e-mail</Label><p className="text-xs text-muted-foreground">Receba um resumo operacional no e-mail da conta.</p></div><Switch id="daily-summary" checked={preferences.email_daily_summary} onCheckedChange={v => update('email_daily_summary', v)} /></div>
      </CardContent></Card>
    </div>
    <div className="flex justify-end"><Button className="min-h-11 w-full sm:w-auto" disabled={saving || !!loadError} onClick={() => void save()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{saving ? 'Salvando…' : 'Salvar preferências'}</Button></div>
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Bell className="h-4 w-4" />Essas opções ficam separadas por usuário e por clínica.</p>
  </main>;
}
