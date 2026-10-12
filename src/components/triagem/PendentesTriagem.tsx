import { Activity, LoaderCircle } from 'lucide-react';
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
      <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl border border-[#D8E8F4] bg-white p-4 text-sm text-[#0C1F54]/70">
        <LoaderCircle className="h-4 w-4 animate-spin text-[#005ECC]" />
        Carregando pacientes aguardando triagem
      </div>
    );
  }

  if (appointments.length === 0) return null;

  return (
    <section aria-label="Pacientes aguardando triagem" className="space-y-2 rounded-xl border border-info/30 bg-info/5 p-4">
      <p className="flex items-center gap-2 text-xs font-medium text-info">
        <Activity className="h-3.5 w-3.5" />
        {appointments.length === 1
          ? '1 paciente aguardando triagem'
          : `${appointments.length} pacientes aguardando triagem`}
      </p>
      <div className="space-y-1.5 pt-1">
        {appointments.slice(0, 12).map(appointment => {
          const patient = appointment.pacientes;
          return (
            <div key={appointment.id} className="flex items-center justify-between gap-3 rounded-lg bg-background/60 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{patient?.nome_social || patient?.nome || 'Paciente'}</p>
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  {String(appointment.hora_inicio).slice(0, 5)} · {appointment.tipo || 'consulta'}
                </p>
              </div>
              <Button size="sm" className="h-8 shrink-0 gap-1 text-xs" onClick={() => onTriage(appointment.paciente_id, appointment.id)}>
                <Activity className="h-3 w-3" /> Triar
              </Button>
            </div>
          );
        })}
        {appointments.length > 12 && (
          <p className="px-3 text-[10px] text-muted-foreground">
            e mais {appointments.length - 12}…
          </p>
        )}
      </div>
    </section>
  );
}
