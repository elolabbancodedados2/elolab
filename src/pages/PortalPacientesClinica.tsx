import { useState } from 'react';
import { Copy, ExternalLink, Link2, MessageCircle, ShieldCheck, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import type { PacienteResumo } from '@/hooks/useBuscaPacientes';
import { supabase } from '@/integrations/supabase/client';
import { abrirUrlSegura } from '@/lib/safeUrl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

function linkWhatsAppSeguro(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'wa.me' ? url.href : null;
  } catch {
    return null;
  }
}

function telefoneWhatsApp(telefone: string) {
  const digitos = telefone.replace(/\D/g, '');
  if (digitos.length < 10 || digitos.length > 13) return null;
  return digitos.startsWith('55') ? digitos : `55${digitos}`;
}

export default function PortalPacientesClinica() {
  const [paciente, setPaciente] = useState<PacienteResumo | null>(null);
  const [link, setLink] = useState('');
  const [gerando, setGerando] = useState(false);

  const gerarLink = async () => {
    if (!paciente) return;
    setGerando(true);
    setLink('');
    try {
      const { data, error } = await (supabase as any).rpc('link_portal_paciente', { p_paciente_id: paciente.id });
      if (error) throw error;
      if (typeof data !== 'string') throw new Error('O link do portal não foi retornado.');
      const url = new URL(data);
      const token = url.searchParams.get('token');
      if (url.pathname !== '/portal-paciente' || !token) throw new Error('O link retornado está incompleto.');
      const localLink = new URL('/portal-paciente', window.location.origin);
      localLink.searchParams.set('token', token);
      setLink(localLink.toString());
      toast.success('Link de acesso gerado para este paciente.');
    } catch (error) {
      toast.error('Não foi possível gerar o link do portal.', {
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setGerando(false);
    }
  };

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  };

  const abrirWhatsApp = () => {
    if (!paciente?.telefone || !link) return;
    const telefone = telefoneWhatsApp(paciente.telefone);
    if (!telefone) {
      toast.error('O telefone deste paciente parece inválido.', { description: 'Corrija o telefone no cadastro e tente novamente.' });
      return;
    }
    const nome = paciente.nome_social || paciente.nome;
    const url = `https://wa.me/${telefone}?text=${encodeURIComponent(`Olá, ${nome}! A clínica está compartilhando seu link de acesso ao Portal do Paciente: ${link}`)}`;
    if (!abrirUrlSegura(url, linkWhatsAppSeguro)) toast.error('Não foi possível abrir o WhatsApp.');
  };

  const selecionarPaciente = (id: string, selecionado: PacienteResumo) => {
    setPaciente(selecionado);
    setLink('');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary"><UsersRound className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Acesso ao Portal do Paciente</h1>
          <p className="mt-1 text-sm text-muted-foreground">Selecione um paciente e compartilhe o link individual para acompanhar consultas, exames e outras informações disponíveis.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" />Enviar acesso</CardTitle>
          <CardDescription>O link é individual e permite consultar somente as informações disponíveis para aquele paciente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="portal-patient-picker">Paciente</label>
            <PacienteCombobox
              id="portal-patient-picker"
              value={paciente?.id}
              onChange={selecionarPaciente}
              placeholder="Busque por nome, CPF ou telefone..."
            />
          </div>

          {paciente && (
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="font-semibold">{paciente.nome_social || paciente.nome}</p>
              <p className="mt-1 text-sm text-muted-foreground">{paciente.telefone || 'Sem telefone cadastrado'}</p>
            </div>
          )}

          <Button type="button" onClick={() => void gerarLink()} disabled={!paciente || gerando} className="w-full sm:w-auto">
            <Link2 className="mr-2 h-4 w-4" />{gerando ? 'Gerando link…' : 'Gerar link de acesso'}
          </Button>

          {link && (
            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.035] p-4">
              <label className="text-sm font-medium" htmlFor="portal-generated-link">Link individual do portal</label>
              <Input id="portal-generated-link" value={link} readOnly onFocus={(event) => event.currentTarget.select()} />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" onClick={abrirWhatsApp} disabled={!paciente?.telefone} className="flex-1">
                  <MessageCircle className="mr-2 h-4 w-4" />Abrir WhatsApp para enviar
                </Button>
                <Button type="button" variant="outline" onClick={() => void copiarLink()} className="flex-1">
                  <Copy className="mr-2 h-4 w-4" />Copiar link
                </Button>
                <Button type="button" variant="ghost" onClick={() => window.open(link, '_blank', 'noopener,noreferrer')} aria-label="Conferir link do portal">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
              {!paciente?.telefone && <p className="text-xs text-muted-foreground">Cadastre um telefone para preparar o envio pelo WhatsApp; você também pode copiar o link.</p>}
            </div>
          )}

          <div className="flex gap-3 rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p>Compartilhe este link somente com o paciente ou responsável autorizado. O endereço contém uma credencial individual de acesso.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
