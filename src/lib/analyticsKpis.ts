const STATUS_FINALIZADO = new Set(['finalizado', 'atendimento_finalizado']);

export function calculateAttendanceRate(appointments: readonly { status: string }[]) {
  const attended = appointments.filter((appointment) => STATUS_FINALIZADO.has(appointment.status)).length;
  const missed = appointments.filter((appointment) => appointment.status === 'faltou').length;
  const denominator = attended + missed;

  return {
    attended,
    missed,
    denominator,
    rate: denominator > 0 ? Math.round((attended / denominator) * 100) : null,
  };
}
