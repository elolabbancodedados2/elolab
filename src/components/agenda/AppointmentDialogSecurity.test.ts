import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/agenda/AppointmentDialog.tsx', 'utf8');

describe('cancelamento pelo diálogo da agenda', () => {
  it('usa a RPC que valida estado, clínica e sincroniza a fila', () => {
    expect(source).toMatch(/rpc\('cancelar_agendamento_com_motivo'/);
    expect(source).toMatch(/p_motivo_cancelamento:\s*motivoCancelamento/);
    expect(source).not.toMatch(/from\('agendamentos'\)[\s\S]*?update\(\{ status: 'cancelado' \}\)/);
  });
});
