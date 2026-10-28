import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { anonimizar } = vi.hoisted(() => ({ anonimizar: vi.fn() }));
vi.mock('@/lib/lgpdCompliance', async (orig) => ({
  ...(await orig<typeof import('@/lib/lgpdCompliance')>()),
  anonimizarPacienteLgpd: anonimizar,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { AnonimizarPacienteDialog } from '../AnonimizarPacienteDialog';
import { AnonimizacaoLgpdError } from '@/lib/lgpdAnonimizacao';

// Dados sintéticos.
const paciente = { id: '11111111-1111-4111-8111-111111111111', nome: 'Paciente Sintético' };
const CLINICA = '22222222-2222-4222-8222-222222222222';

function abrir(onConcluido = vi.fn()) {
  render(
    <AnonimizarPacienteDialog
      paciente={paciente}
      clinicaId={CLINICA}
      open
      onOpenChange={vi.fn()}
      onConcluido={onConcluido}
    />
  );
  return onConcluido;
}

async function preencher() {
  await userEvent.type(screen.getByLabelText(/Motivo/), 'Pedido do titular, protocolo 1.');
  await userEvent.type(screen.getByLabelText(/digite o nome completo/), paciente.nome);
}

describe('AnonimizarPacienteDialog', () => {
  beforeEach(() => {
    anonimizar.mockReset();
  });

  it('mostra o paciente e só libera o envio com motivo e confirmação', async () => {
    abrir();
    expect(screen.getByText(paciente.nome)).toBeInTheDocument();
    const botao = screen.getByRole('button', { name: 'Anonimizar' });
    expect(botao).toBeDisabled();
    await preencher();
    expect(botao).toBeEnabled();
  });

  it('envia paciente, clínica, motivo e confirmação e mostra as pendências', async () => {
    anonimizar.mockResolvedValue({
      situacao: 'anonimizado',
      logId: 'log-1',
      rotulo: 'ANON-0001',
      contagens: {},
      pendencias: ['A foto do paciente não foi removida do armazenamento. Remova-a manualmente.'],
    });
    const onConcluido = abrir();
    await preencher();
    await userEvent.click(screen.getByRole('button', { name: 'Anonimizar' }));
    await waitFor(() => expect(screen.getByText(/ANON-0001/)).toBeInTheDocument());
    expect(anonimizar).toHaveBeenCalledWith({
      pacienteId: paciente.id,
      clinicaId: CLINICA,
      motivo: 'Pedido do titular, protocolo 1.',
      confirmacaoNome: paciente.nome,
    });
    expect(screen.getByText(/foto do paciente não foi removida/)).toBeInTheDocument();
    expect(onConcluido).toHaveBeenCalledTimes(1);
  });

  it('mostra o erro traduzido e não conclui', async () => {
    anonimizar.mockRejectedValue(new AnonimizacaoLgpdError('LGPD_CONFIRMACAO_NAO_CONFERE'));
    const onConcluido = abrir();
    await preencher();
    await userEvent.click(screen.getByRole('button', { name: 'Anonimizar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('não corresponde ao cadastro do paciente');
    expect(onConcluido).not.toHaveBeenCalled();
  });
});
