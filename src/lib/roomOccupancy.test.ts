import { describe, expect, it } from 'vitest';
import { summarizeRoomOccupancy } from './roomOccupancy';

describe('summarizeRoomOccupancy', () => {
  it('shows used and available capacity without flagging a room within its limit', () => {
    expect(summarizeRoomOccupancy(2, 4)).toEqual({
      occupied: 2,
      capacity: 4,
      available: 2,
      overCapacity: false,
      label: '2 pacientes · capacidade 4',
    });
  });

  it('flags tracked queue links above the configured capacity', () => {
    expect(summarizeRoomOccupancy(3, 2)).toEqual({
      occupied: 3,
      capacity: 2,
      available: 0,
      overCapacity: true,
      label: '3 pacientes · capacidade 2 · acima da capacidade',
    });
  });

  it('uses a safe capacity of one for invalid configuration and clamps invalid counts', () => {
    expect(summarizeRoomOccupancy(-2, 0)).toEqual({
      occupied: 0,
      capacity: 1,
      available: 1,
      overCapacity: false,
      label: '0 pacientes · capacidade 1',
    });
  });

  it('usa o singular para um paciente', () => {
    expect(summarizeRoomOccupancy(1, 1).label).toBe('1 paciente · capacidade 1');
  });
});
