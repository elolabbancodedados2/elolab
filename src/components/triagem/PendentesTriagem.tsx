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
      <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-2xl border border-[#DCE6F2] bg-white p-4 text-sm text-muted-foreground shadow-xs">
        <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-[#1080CA]" />
        Carregando pacientes aguardando triagem
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success/5 p-4 text-sm text-foreground">
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <div>
          <p className="font-medium">Nenhum paciente aguardando triagem</p>
          <p className="mt-0.5 text-muted-foreground">Os pacientes com check-in e sem triagem aparecerão aqui.</p>
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Pacientes aguardando triagem" className="space-y-2 rounded-2xl border border-[#BFD8EE] bg-[#F3F8FC] p-4 shadow-xs">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm">
          <Activity className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold text-foreground">
          {appointments.length === 1
            ? '1 paciente aguardando triagem'
            : `${appointments.length} pacientes aguardando triagem`}
        </p>
      </div>
      <div className="space-y-1.5 pt-1">
        {appointments.slice(0, 12).map((appointment, index) => {
          const patient = appointment.pacientes;
          return (
            <div key={appointment.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#DCE6F2] bg-white px-3 py-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden="true" className={index === 0
                  ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white'
                  : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground'}>
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{patient?.nome_social || patient?.nome || 'Paciente'}</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {String(appointment.hora_inicio).slice(0, 5)} · {appointment.tipo || 'consulta'}
                  </p>
                </div>
              </div>
              <Button size="sm" className="h-9 shrink-0 gap-1 rounded-full bg-[#1080CA] text-xs text-white hover:bg-[#1080CA] hover:brightness-110" aria-label={`Triar ${patient?.nome_social || patient?.nome || 'paciente'}`} onClick={() => onTriage(appointment.paciente_id, appointment.id)}>
                <Activity aria-hidden="true" className="h-3 w-3" /> Triar
              </Button>
            </div>
          );
        })}
        {appointments.length > 12 && (
          <p className="px-3 text-[11px] text-muted-foreground">
            e mais {appointments.length - 12}…
          </p>
        )}
      </div>
    </section>
  );
}
