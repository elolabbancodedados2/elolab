import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/agenda/AppointmentDialog.tsx', 'utf8');

describe('cancelamento pelo diálogo da agenda', () => {
  it('usa a RPC que valida estado, clínica e sincroniza a fila', () => {
    expect(source).toMatch(/rpc\('alterar_status_agendamento_com_fila'/);
    expect(source).toMatch(/p_status:\s*'cancelado'/);
    expect(source).not.toMatch(/from\('agendamentos'\)[\s\S]*?update\(\{ status: 'cancelado' \}\)/);
  });
});
