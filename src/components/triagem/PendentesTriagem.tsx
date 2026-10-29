import { Activity, CheckCircle2, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Appointment = {
  id: string;
  paciente_id: string;
  hora_inicio: string;
  tipo?: string | null;
  pacientes?: { nome?: string | null; nome_social?: string | null } | null;
};

type Props = {
  loading: boolean;
  appointments: Appointment[];
  onTriage: (patientId: string, appointmentId: string) => void;
};

export function PendentesTriagem({ loading, appointments, onTriage }: Props) {
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
          <p className="mt-0.5 text-xs text-muted-foreground">Em ordem de horário do atendimento</p>
        </div>
        <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground" aria-label={`${appointments.length} pacientes aguardando triagem`}>
          {appointments.length}
        </span>
      </header>
      <ol aria-label="Fila de pacientes aguardando triagem" className="divide-y divide-border">
        {appointments.map((appointment, index) => {
          const patient = appointment.pacientes;
          const patientName = patient?.nome_social || patient?.nome || 'Paciente';
          return (
            <li key={appointment.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-xs tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{patientName}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {String(appointment.hora_inicio).slice(0, 5)} · {appointment.tipo || 'consulta'}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="min-h-11 w-full gap-1.5 rounded-md bg-primary text-xs text-primary-foreground shadow-none hover:bg-primary/90 sm:w-auto"
                aria-label={`Triar ${patientName}`}
                onClick={() => onTriage(appointment.paciente_id, appointment.id)}
              >
                <Activity aria-hidden="true" className="h-3.5 w-3.5" /> Triar
              </Button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
