import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PendentesTriagem } from './PendentesTriagem';

const appointments = Array.from({ length: 13 }, (_, index) => {
  const totalMinutes = 9 * 60 + index * 5;
  return {
    id: `appointment-${index + 1}`,
    paciente_id: `patient-${index + 1}`,
    hora_inicio: `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}:00`,
    tipo: 'consulta',
    pacientes: { nome: `Paciente ${index + 1}`, nome_social: null },
  };
});

describe('PendentesTriagem', () => {
  it('expõe um estado de carregamento acessível', () => {
    render(<PendentesTriagem loading appointments={[]} onTriage={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando pacientes aguardando triagem');
  });

  it('explica o estado vazio sem tratá-lo como alerta ou sucesso', () => {
    render(<PendentesTriagem loading={false} appointments={[]} onTriage={vi.fn()} />);
    expect(screen.getByText('Nenhum paciente aguardando triagem')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('mantém todos os pacientes acessíveis e encaminha a pessoa e o agendamento corretos', async () => {
    const user = userEvent.setup();
    const onTriage = vi.fn();
    render(<PendentesTriagem loading={false} appointments={appointments} onTriage={onTriage} />);

    expect(screen.getByRole('region', { name: 'Pacientes aguardando triagem' })).toBeInTheDocument();
    expect(screen.getByText('Paciente 13')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Triar Paciente/ })).toHaveLength(13);
    await user.click(screen.getByRole('button', { name: 'Triar Paciente 13' }));
    expect(onTriage).toHaveBeenCalledWith('patient-13', 'appointment-13');
  });
});
