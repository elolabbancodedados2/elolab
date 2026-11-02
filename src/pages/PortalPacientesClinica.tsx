import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Link2, ShieldCheck, UsersRound } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import type { PacienteResumo } from '@/hooks/useBuscaPacientes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const ETAPAS = [
  { titulo: 'Selecione o paciente', texto: 'Busque por nome, CPF ou telefone.' },
  { titulo: 'Gere o link individual', texto: 'Vale por até um ano e substitui o anterior.' },
  { titulo: 'Compartilhe com segurança', texto: 'Copie o link ou mostre o QR code ao paciente.' },
];

/**
 * Atalho para o acesso ao portal a partir do menu. A emissão do link acontece
 * numa tela só (/pacientes/:id/portal/link), a mesma usada pela ficha: a
 * validação do link, o QR code e o aviso de rotação ficam num lugar.
 */
export default function PortalPacientesClinica() {
  const navigate = useNavigate();
  const [paciente, setPaciente] = useState<PacienteResumo | null>(null);

  const abrirEmissao = () => {
    if (!paciente) return;
    navigate(`/pacientes/${encodeURIComponent(paciente.id)}/portal/link`, {
      state: { patientId: paciente.id, returnTo: '/portal-pacientes' },
    });
  };

  const nomePaciente = paciente ? paciente.nome_social || paciente.nome : '';

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Acesso ao portal do paciente"
        description="Gere um link individual e privado para cada paciente consultar as informações liberadas pela clínica."
        icon={<UsersRound />}
        actions={(
          <Button variant="outline" className="h-11 gap-2 rounded-full" onClick={() => navigate('/pacientes')}>
            <UsersRound aria-hidden="true" className="h-4 w-4" /> Pacientes
          </Button>
        )}
      />

      <Card className="overflow-hidden rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
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
              onChange={(_id, selecionado) => setPaciente(selecionado)}
              placeholder="Busque por nome, CPF ou telefone..."
            />
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{paciente ? nomePaciente : 'Nenhum paciente selecionado'}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{paciente ? paciente.telefone || 'Sem telefone cadastrado' : 'Escolha o paciente para continuar.'}</p>
            </div>
            <Button type="button" onClick={abrirEmissao} disabled={!paciente} className="h-11 shrink-0 gap-2 rounded-full">
              <Link2 aria-hidden="true" className="h-4 w-4" />Gerar link de acesso
            </Button>
          </div>

          <div className="flex gap-3 rounded-xl border border-border bg-secondary p-4 text-sm text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
            <p>Compartilhe este link somente com o paciente ou responsável autorizado. O endereço contém uma credencial individual de acesso.</p>
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="portal-como-funciona" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="portal-como-funciona" className="text-base font-semibold text-foreground">Como funciona</h2>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Check aria-hidden="true" className="h-4 w-4" /> O link novo desativa o anterior.
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {ETAPAS.map((etapa, index) => (
            <Card key={etapa.titulo} className="rounded-2xl border-border/60 shadow-xs">
              <CardContent className="flex items-start gap-3 p-4">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
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
