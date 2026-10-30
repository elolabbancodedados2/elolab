import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MessageSquarePlus } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

const PRIORIDADES = ['baixa', 'normal', 'alta', 'critica'] as const;
const CATEGORIAS = ['duvida', 'incidente', 'financeiro', 'integracao', 'seguranca'] as const;
const prioridadeLabel: Record<(typeof PRIORIDADES)[number], string> = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', critica: 'Crítica' };
const categoriaLabel: Record<(typeof CATEGORIAS)[number], string> = { duvida: 'Dúvida', incidente: 'Incidente', financeiro: 'Financeiro', integracao: 'Integração', seguranca: 'Segurança' };

type TicketPayload = {
  titulo: string;
  descricao: string;
  prioridade: (typeof PRIORIDADES)[number];
  categoria: (typeof CATEGORIAS)[number];
  clinica_id: string;
  solicitante_id: string;
};

type ReturnState = {
  supportReturnTo?: string;
  supportReturnState?: { supportFilters?: Record<string, unknown> };
};

export default function NovoChamadoSuportePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, user } = useSupabaseAuth();
  const completed = useRef(false);
  const createLock = useRef(false);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<(typeof PRIORIDADES)[number]>('normal');
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS)[number]>('duvida');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  const navigationState = (location.state ?? {}) as ReturnState;
  const returnState = navigationState.supportReturnState;
  const returnTo = useMemo(() => ({ pathname: '/suporte', state: returnState }), [returnState]);
  const dirty = Boolean(titulo.trim() || descricao.trim() || prioridade !== 'normal' || categoria !== 'duvida');
  const canSubmit = titulo.trim().length >= 5 && titulo.trim().length <= 120
    && descricao.trim().length >= 10 && descricao.trim().length <= 4000
    && !!profile?.clinica_id && !!user?.id;

  const cancelar = () => navigate(returnTo.pathname, { state: returnTo.state });

  const enviar = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createLock.current || !canSubmit || !profile?.clinica_id || !user?.id) return;
    createLock.current = true;
    setSaving(true);
    setErro('');
    const payload: TicketPayload = {
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      prioridade,
      categoria,
      clinica_id: profile.clinica_id,
      solicitante_id: user.id,
    };

    try {
      const { error } = await (supabase as any).from('support_tickets').insert(payload);
      if (error) throw error;
      completed.current = true;
      await queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast.success('Chamado aberto.');
      navigate(returnTo.pathname, { replace: true, state: returnTo.state });
    } catch (cause) {
      const message = mensagemDeErro(cause);
      setErro(message);
      toast.error('Não foi possível abrir o chamado.', { description: message });
    } finally {
      createLock.current = false;
      setSaving(false);
    }
  };

  if (!profile?.clinica_id || !user?.id) {
    return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
      <PageHeader title="Abrir chamado" description="Registre uma solicitação para a equipe de suporte." icon={<MessageSquarePlus />} actions={<Button variant="outline" onClick={cancelar}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao suporte</Button>} />
      <div role="alert" className="rounded-lg border border-[#DFE7F0] bg-[#F5F8FC] p-4 text-sm text-[#172B4D]">Não foi possível identificar sua clínica nesta sessão. Atualize a página e tente novamente; nenhum chamado foi enviado.</div>
    </div>;
  }

  return <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
    <PageHeader title="Abrir chamado" description="Descreva o que aconteceu para que a equipe consiga entender e encaminhar sua solicitação." icon={<MessageSquarePlus />} actions={<Button variant="outline" onClick={cancelar} disabled={saving}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao suporte</Button>} />

    <Card>
      <CardHeader className="border-b border-border/70">
        <CardTitle className="text-base">Detalhes da solicitação</CardTitle>
        <p className="text-sm text-muted-foreground">Inclua os passos para reproduzir o problema e o resultado esperado. Não informe dados clínicos de pacientes.</p>
      </CardHeader>
      <CardContent className="pt-5">
        <form className="space-y-5" onSubmit={event => void enviar(event)}>
          <div className="space-y-2">
            <Label htmlFor="support-title">Resumo do problema</Label>
            <Input id="support-title" autoFocus value={titulo} onChange={event => { setTitulo(event.target.value); setErro(''); }} maxLength={120} minLength={5} required disabled={saving} aria-describedby="support-title-hint" />
            <p id="support-title-hint" className="text-xs text-muted-foreground">Mínimo de 5 caracteres · {titulo.length}/120</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-description">Descrição</Label>
            <Textarea id="support-description" value={descricao} onChange={event => { setDescricao(event.target.value); setErro(''); }} maxLength={4000} minLength={10} required disabled={saving} rows={7} aria-describedby="support-description-hint" />
            <p id="support-description-hint" className="text-xs text-muted-foreground">Mínimo de 10 caracteres · {descricao.length}/4000</p>
          </div>

          <div className="grid gap-4 border-t border-border/70 pt-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="support-priority">Prioridade</Label>
              <Select value={prioridade} onValueChange={value => setPrioridade(value as typeof prioridade)} disabled={saving}>
                <SelectTrigger id="support-priority"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORIDADES.map(item => <SelectItem key={item} value={item}>{prioridadeLabel[item]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-category">Categoria</Label>
              <Select value={categoria} onValueChange={value => setCategoria(value as typeof categoria)} disabled={saving}>
                <SelectTrigger id="support-category"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map(item => <SelectItem key={item} value={item}>{categoriaLabel[item]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {erro && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p>{erro}</p><p className="mt-1 text-xs">O texto foi mantido. Antes de reenviar após uma falha de conexão, confira a Central de Suporte para evitar um chamado duplicado.</p></div>}

          <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={cancelar} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving || !canSubmit}>
              {saving ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquarePlus aria-hidden="true" className="mr-2 h-4 w-4" />}
              {saving ? 'Enviando chamado…' : 'Enviar chamado'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
    <UnsavedChangesGuard dirty={dirty} busy={saving} completed={completed} />
  </div>;
}
