export type RoomOccupancySummary = {
  occupied: number;
  capacity: number;
  available: number;
  overCapacity: boolean;
  label: string;
};

export function formatarDataOcupacaoAntiga(dataAgendamento: string | null | undefined, hoje: string): string | null {
  if (!dataAgendamento || dataAgendamento >= hoje) return null;
  const [ano, mes, dia] = dataAgendamento.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : null;
}

export function summarizeRoomOccupancy(occupiedCount: number, configuredCapacity: number | null | undefined): RoomOccupancySummary {
  const occupied = Number.isFinite(occupiedCount) ? Math.max(0, Math.floor(occupiedCount)) : 0;
  const capacity = Number.isInteger(configuredCapacity) && Number(configuredCapacity) > 0
    ? Number(configuredCapacity)
    : 1;
  const overCapacity = occupied > capacity;

  return {
    occupied,
    capacity,
    available: Math.max(0, capacity - occupied),
    overCapacity,
    label: `${occupied} ${occupied === 1 ? 'paciente' : 'pacientes'} · capacidade ${capacity}${overCapacity ? ' · acima da capacidade' : ''}`,
  };
}
