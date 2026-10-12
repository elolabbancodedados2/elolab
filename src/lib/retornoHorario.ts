/** Compara data/hora do Postgres no fuso da clínica (São Paulo). */
export function horarioAgendadoJaChegou(data: string, hora: string, agora = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(hora)) return false;
  const instante = new Date(`${data}T${hora.slice(0, 5)}:00-03:00`);
  return Number.isFinite(instante.getTime()) && instante <= agora;
}
