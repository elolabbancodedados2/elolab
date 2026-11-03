export function podeCheckinPortal(appointment: { data: string; hora_inicio: string | null; status: string }, now = new Date()): boolean {
  if (!['agendado', 'confirmado'].includes(appointment.status) || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(appointment.hora_inicio || '')) return false;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  if (appointment.data !== `${part('year')}-${part('month')}-${part('day')}`) return false;
  const [hour, minute, second = 0] = appointment.hora_inicio!.split(':').map(Number);
  const delta = Number(part('hour')) * 3600 + Number(part('minute')) * 60 + Number(part('second')) - (hour * 3600 + minute * 60 + second);
  return delta >= -7200 && delta <= 1800;
}
