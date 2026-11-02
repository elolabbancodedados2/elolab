import { Activity, CheckCircle2, LoaderCircle, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Appointment = {
  id: string;
  paciente_id: string;
  hora_inicio: string;
  tipo?: string | null;
  pacientes?: { nome?: string | null; nome_social?: string | null } | null;
  /** Prioridade da linha da fila (urgente, preferencial ou normal). */
  prioridade?: string | null;
};

type Props = {
  loading: boolean;
  appointments: Appointment[];
  onTriage: (patientId: string, appointmentId: string) => void;
  /** Chama o paciente pelo painel da sala de espera. Sem a função, o botão não aparece. */
  onCall?: (appointmentId: string) => void;
  /** Agendamento sendo chamado agora (desabilita o botão correspondente). */
  callingId?: string | null;
};

const SELO_PRIORIDADE: Record<string, string> = {
  urgente: 'Urgente',
  preferencial: 'Preferencial',
};

export function PendentesTriagem({ loading, appointments, onTriage, onCall, callingId }: Props) {
  if (loading) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="flex min-h-14 items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
        Carregando pacientes aguardando triagem
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground">
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <div>
          <p className="font-medium">Nenhum paciente aguardando triagem</p>
          <p className="mt-0.5 text-muted-foreground">Pacientes com check-in e sem triagem aparecerão aqui.</p>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="triagem-pendentes-titulo" className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 id="triagem-pendentes-titulo" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Activity aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
            Pacientes aguardando triagem
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Urgentes e preferenciais primeiro; depois, por ordem de chegada</p>
        </div>
        <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground" aria-label={`${appointments.length} pacientes aguardando triagem`}>
          {appointments.length}
        </span>
      </header>
      <ol aria-label="Fila de pacientes aguardando triagem" className="divide-y divide-border">
        {appointments.map((appointment, index) => {
          const patient = appointment.pacientes;
          const patientName = patient?.nome_social || patient?.nome || 'Paciente';
          const selo = appointment.prioridade ? SELO_PRIORIDADE[appointment.prioridade] : undefined;
          return (
            <li key={appointment.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-xs tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                    <span className="truncate">{patientName}</span>
                    {selo && (
                      <span className={appointment.prioridade === 'urgente'
                        ? 'shrink-0 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive'
                        : 'shrink-0 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning-foreground'}
                      >
                        {selo}
                      </span>
                    )}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {String(appointment.hora_inicio).slice(0, 5)} · {appointment.tipo || 'consulta'}
                  </p>
                </div>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                {onCall && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 w-full gap-1.5 rounded-md text-xs shadow-none sm:w-auto"
                    aria-label={`Chamar ${patientName} para triagem`}
                    disabled={callingId === appointment.id}
                    onClick={() => onCall(appointment.id)}
                  >
                    {callingId === appointment.id
                      ? <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                      : <Megaphone aria-hidden="true" className="h-3.5 w-3.5" />}
                    Chamar para triagem
                  </Button>
                )}
                <Button
                  size="sm"
                  className="min-h-11 w-full gap-1.5 rounded-md bg-primary text-xs text-primary-foreground shadow-none hover:bg-primary/90 sm:w-auto"
                  aria-label={`Triar ${patientName}`}
                  onClick={() => onTriage(appointment.paciente_id, appointment.id)}
                >
                  <Activity aria-hidden="true" className="h-3.5 w-3.5" /> Triar
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
