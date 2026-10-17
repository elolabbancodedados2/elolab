import { useState } from 'react';
import { Check, Copy, ExternalLink, Link2, MessageCircle, ShieldCheck, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import type { PacienteResumo } from '@/hooks/useBuscaPacientes';
import { supabase } from '@/integrations/supabase/client';
import { linkWhatsApp } from '@/lib/whatsapp';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const ETAPAS = [
  { titulo: 'Selecione o paciente', texto: 'Busque por nome, CPF ou telefone.' },
  { titulo: 'Gere o link individual', texto: 'Vale por até um ano e substitui o anterior.' },
  { titulo: 'Compartilhe com segurança', texto: 'Copie o link ou envie pelo WhatsApp.' },
];

export default function PortalPacientesClinica() {
  const [paciente, setPaciente] = useState<PacienteResumo | null>(null);
  const [link, setLink] = useState('');
  const [gerando, setGerando] = useState(false);

  const gerarLink = async () => {
    if (!paciente) return;
    setGerando(true);
    setLink('');
    try {
      const { data, error } = await supabase.rpc('link_portal_paciente', { p_paciente_id: paciente.id });
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

  const selecionarPaciente = (id: string, selecionado: PacienteResumo) => {
    setPaciente(selecionado);
    setLink('');
  };

  const nomePaciente = paciente ? paciente.nome_social || paciente.nome : '';
  const whatsapp = link && paciente?.telefone
    ? linkWhatsApp(paciente.telefone, `Olá, ${nomePaciente}! A clínica está compartilhando seu link de acesso ao Portal do Paciente: ${link}`)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Acesso ao portal do paciente"
        description="Gere um link individual e privado para cada paciente consultar as informações liberadas pela clínica."
        icon={<UsersRound />}
        actions={(
          <Button asChild variant="outline" className="rounded-full gap-2">
            <a href="/pacientes"><UsersRound aria-hidden="true" className="h-4 w-4" /> Pacientes</a>
          </Button>
        )}
      />

      <Card className="overflow-hidden rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
              <Link2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-lg">Enviar acesso</CardTitle>
              <CardDescription className="mt-1">O link é individual e permite consultar somente as informações disponíveis para aquele paciente.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="portal-patient-picker">Paciente</label>
            <PacienteCombobox
              id="portal-patient-picker"
              value={paciente?.id}
              onChange={selecionarPaciente}
              disabled={gerando}
              placeholder="Busque por nome, CPF ou telefone..."
            />
          </div>

          {paciente ? (
            <div className="flex flex-col gap-3 rounded-xl border border-[#DCE6F2] bg-[#F3F8FC] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{nomePaciente}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{paciente.telefone || 'Sem telefone cadastrado'}</p>
              </div>
              <Button type="button" onClick={() => void gerarLink()} disabled={gerando} className="shrink-0 gap-2 rounded-full bg-[#111111] text-white shadow-md hover:bg-[#2b2b33]">
                <Link2 aria-hidden="true" className="h-4 w-4" />{gerando ? 'Gerando link…' : 'Gerar link de acesso'}
              </Button>
            </div>
          ) : (
            <Button type="button" disabled className="gap-2 rounded-full bg-[#111111] text-white shadow-md hover:bg-[#2b2b33]">
              <Link2 aria-hidden="true" className="h-4 w-4" />Gerar link de acesso
            </Button>
          )}

          {link && (
            <div className="space-y-3 rounded-xl border border-[#BFD8EE] bg-[#F3F8FC] p-4">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-[#1080CA]" htmlFor="portal-generated-link">Link individual do portal</label>
                <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-full text-[#1080CA] hover:bg-[#1080CA]/10 hover:text-[#1080CA]">
                  <a href={link} target="_blank" rel="noopener noreferrer" aria-label="Conferir link do portal" title="Conferir link do portal">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
              <Input id="portal-generated-link" value={link} readOnly onFocus={(event) => event.currentTarget.select()} className="h-10 rounded-full bg-white font-mono text-xs focus-visible:ring-[#1080CA]" />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => void copiarLink()} className="gap-2 rounded-full">
                  <Copy aria-hidden="true" className="h-4 w-4" />Copiar
                </Button>
                {whatsapp && (
                  <Button asChild className="gap-2 rounded-full bg-gradient-primary text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110">
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                      <MessageCircle aria-hidden="true" className="h-4 w-4" />Enviar por WhatsApp
                    </a>
                  </Button>
                )}
              </div>
              {!whatsapp && <p className="text-xs text-muted-foreground">Cadastre um telefone válido para enviar pelo WhatsApp; por enquanto, copie o link.</p>}
              <p className="text-xs text-muted-foreground">Por segurança, este link substitui os anteriores e vale por até um ano.</p>
            </div>
          )}

          <div className="flex gap-3 rounded-xl border border-[#DCE6F2] bg-[#EEF4FA] p-4 text-sm text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#1080CA]" />
            <p>Compartilhe este link somente com o paciente ou responsável autorizado. O endereço contém uma credencial individual de acesso.</p>
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="portal-como-funciona" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="portal-como-funciona" className="text-base font-semibold text-foreground">Como funciona</h2>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Check aria-hidden="true" className="h-4 w-4 text-success" /> O link novo desativa o anterior.
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {ETAPAS.map((etapa, index) => (
            <Card key={etapa.titulo} className="rounded-2xl border-border/60 shadow-xs">
              <CardContent className="flex items-start gap-3 p-4">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#111111] text-xs font-bold text-white">{index + 1}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{etapa.titulo}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{etapa.texto}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
