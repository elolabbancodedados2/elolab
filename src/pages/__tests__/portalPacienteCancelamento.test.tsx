import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  falharCancelamento: false,
  falharCancelamentoPorEstado: false,
  cancelado: false,
  confirmado: false,
  falharRemarcacao: false,
  falharConfirmacaoRetorno: false,
  dataRetorno: '2099-10-15',
  statusRetorno: 'pendente',
  mostrarOferta: false,
  falharAceiteOferta: false,
  horariosDisponiveis: ['09:00', '09:30'],
  semHorarios: false,
  falharRemarcacaoConsulta: false,
  falharConfirmacaoConsulta: false,
  falharPorEstado: false,
  consultaAtualizada: false,
  dataConsulta: '2099-10-15',
  horaConsulta: '10:30:00' as string | null,
  falharAtualizacaoLista: false,
  mutacaoConcluida: false,
  limiteRemarcacao: '2099-12-14',
  falharLimiteRemarcacao: false,
  avisoRemarcacao: null as string | null,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useSearchParams: () => [new URLSearchParams('token=token-teste')] };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

import PortalPaciente from '@/pages/PortalPaciente';

describe('PortalPaciente — cancelamento de consulta', () => {
  const agendamento = {
    id: 'consulta-1',
    medico_id: 'medico-1',
    data: '2099-10-15',
    hora_inicio: '10:30:00',
    status: 'agendado',
    tipo: 'Consulta de rotina',
  };

  beforeEach(() => {
    mocks.falharCancelamento = false;
    mocks.falharCancelamentoPorEstado = false;
    mocks.cancelado = false;
    mocks.confirmado = false;
    mocks.falharRemarcacao = false;
    mocks.falharConfirmacaoRetorno = false;
    mocks.dataRetorno = '2099-10-15';
    mocks.statusRetorno = 'pendente';
    mocks.mostrarOferta = false;
    mocks.falharAceiteOferta = false;
    mocks.horariosDisponiveis = ['09:00', '09:30'];
    mocks.semHorarios = false;
    mocks.falharRemarcacaoConsulta = false;
    mocks.falharConfirmacaoConsulta = false;
    mocks.falharPorEstado = false;
    mocks.consultaAtualizada = false;
    mocks.dataConsulta = '2099-10-15';
    mocks.horaConsulta = '10:30:00';
    mocks.falharAtualizacaoLista = false;
    mocks.mutacaoConcluida = false;
    mocks.limiteRemarcacao = '2099-12-14';
    mocks.falharLimiteRemarcacao = false;
    mocks.avisoRemarcacao = null;
    mocks.invoke.mockImplementation(async (_functionName: string, { body }: { body: { action: string; nova_data?: string } }) => {
      switch (body.action) {
        case 'get_profile':
          return { data: { nome: 'Paciente Teste', data_nascimento: null }, error: null };
        case 'get_agendamentos':
          if (mocks.falharAtualizacaoLista && mocks.mutacaoConcluida) return { data: null, error: new Error('Falha ao carregar lista') };
          return { data: [{ ...agendamento, data: mocks.dataConsulta, hora_inicio: mocks.horaConsulta, status: mocks.consultaAtualizada ? 'em_atendimento' : mocks.cancelado ? 'cancelado' : mocks.confirmado ? 'confirmado' : 'agendado' }], error: null };
        case 'get_available_slots':
          return { data: mocks.semHorarios ? [] : mocks.horariosDisponiveis, error: null };
        case 'get_remarcacao_limite':
          if (mocks.falharLimiteRemarcacao) return { data: null, error: new Error('Falha ao carregar limite') };
          return { data: { limite: mocks.limiteRemarcacao }, error: null };
        case 'reschedule_agendamento':
          if (mocks.falharPorEstado) {
            mocks.consultaAtualizada = true;
            return {
              data: null,
              error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
                context: new Response(JSON.stringify({ error: 'Esta consulta não pode mais ser remarcada pelo portal', code: 'appointment_state_changed' }), { status: 409 }),
              }),
            };
          }
          if (mocks.falharRemarcacaoConsulta) return {
            data: null,
            error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
              context: new Response(JSON.stringify({ error: 'Horário acabou de ser ocupado' }), { status: 409 }),
            }),
          };
          mocks.mutacaoConcluida = true;
          return {
            data: { success: true, ...(mocks.avisoRemarcacao ? { aviso: mocks.avisoRemarcacao } : {}) },
            error: null,
          };
        case 'confirm_agendamento':
          if (mocks.falharConfirmacaoConsulta) return { data: null, error: new Error('Consulta não pode mais ser confirmada') };
          mocks.confirmado = true;
          mocks.mutacaoConcluida = true;
          return { data: { success: true }, error: null };
        case 'get_retornos':
          return { data: [{ id: 'retorno-1', data_retorno_prevista: mocks.dataRetorno, status: mocks.statusRetorno }], error: null };
        case 'get_exames':
        case 'get_pagamentos':
        case 'get_prescricoes':
        case 'get_medicos':
        case 'get_waitlist_offers':
          return { data: mocks.mostrarOferta ? [{
            id: 'oferta-1',
            oferta_expira_em: '2099-10-14T12:00:00Z',
            vaga: { data: '2099-10-15', hora_inicio: '10:30:00', medicos: { nome: 'Dra. Exemplo' } },
          }] : [], error: null };
        case 'cancel_agendamento':
          if (mocks.falharCancelamentoPorEstado) {
            mocks.consultaAtualizada = true;
            return {
              data: null,
              error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
                context: new Response(JSON.stringify({ error: 'Esta consulta não pode mais ser cancelada pelo portal', code: 'appointment_state_changed' }), { status: 409 }),
              }),
            };
          }
          if (mocks.falharCancelamento) return { data: null, error: new Error('Falha temporária') };
          mocks.cancelado = true;
          mocks.mutacaoConcluida = true;
          return { data: { success: true }, error: null };
        case 'reschedule_retorno':
          if (mocks.falharRemarcacao) return { data: null, error: new Error('Falha ao remarcar') };
          mocks.dataRetorno = body.nova_data ?? mocks.dataRetorno;
          return { data: { success: true }, error: null };
        case 'confirm_retorno':
          if (mocks.falharConfirmacaoRetorno) return { data: null, error: new Error('Falha ao confirmar') };
          mocks.statusRetorno = 'confirmado';
          return { data: { success: true }, error: null };
        case 'accept_waitlist_offer':
          if (mocks.falharAceiteOferta) return { data: null, error: new Error('A vaga expirou ou já foi preenchida') };
          mocks.mostrarOferta = false;
          return { data: { success: true }, error: null };
        default:
          return { data: [], error: null };
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  async function iniciarCancelamento() {
    render(<PortalPaciente />);
    await screen.findAllByText('Consulta de rotina');
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(await screen.findByRole('alertdialog')).toBeVisible();
  }

  it('pede confirmação e atualiza a consulta após o cancelamento', async () => {
    await iniciarCancelamento();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('patient-portal', expect.objectContaining({
      body: expect.objectContaining({ action: 'cancel_agendamento', agendamento_id: 'consulta-1', expected_data: '2099-10-15', expected_hora_inicio: '10:30:00' }),
    })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Consulta cancelada.'));
  });

  it('mantém o diálogo aberto e mostra erro se o cancelamento falhar', async () => {
    mocks.falharCancelamento = true;
    await iniciarCancelamento();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Falha temporária');
    expect(within(dialog).getByRole('button', { name: 'Confirmar cancelamento' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Manter consulta' })).toBeEnabled();
  });

  it('atualiza a lista e impede nova tentativa quando o estado muda ao cancelar', async () => {
    mocks.falharCancelamentoPorEstado = true;
    render(<PortalPaciente />);
    const consultas = await screen.findAllByText('Consulta de rotina');
    const card = consultas[consultas.length - 1].closest('[tabindex="-1"]');
    fireEvent.click(screen.getAllByRole('button', { name: /cancelar/i })[0]);
    const openedDialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(openedDialog).getByRole('button', { name: 'Confirmar cancelamento' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('A lista foi atualizada.');
    expect(within(dialog).getByRole('button', { name: 'Confirmar cancelamento' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Fechar' })).toBeEnabled();
    expect(screen.getByText(/em_atendimento/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(card));
  });

  it('preserva a confirmação concluída se a atualização da lista falhar', async () => {
    mocks.falharAtualizacaoLista = true;
    render(<PortalPaciente />);
    await screen.findAllByText('Consulta de rotina');
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirmar' })[0]);

    expect(await screen.findByRole('status')).toHaveTextContent('Consulta confirmada.');
    expect(await screen.findByRole('alert')).toHaveTextContent('Consulta confirmada, mas não foi possível atualizar a lista.');
  });

  it('preserva o cancelamento concluído se a atualização da lista falhar', async () => {
    mocks.falharAtualizacaoLista = true;
    await iniciarCancelamento();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Consulta cancelada.');
    expect(await screen.findByRole('alert')).toHaveTextContent('Consulta cancelada, mas não foi possível atualizar a lista.');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('remarca um retorno pela data escolhida e atualiza a lista', async () => {
    render(<PortalPaciente />);
    await screen.findByText('Seus retornos');
    const botoesRemarcar = screen.getAllByRole('button', { name: 'Remarcar' });
    fireEvent.click(botoesRemarcar[botoesRemarcar.length - 1]);
    expect(await screen.findByRole('dialog', { name: 'Remarcar retorno' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Nova data'), { target: { value: '2099-11-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar nova data' }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('patient-portal', expect.objectContaining({
      body: expect.objectContaining({ action: 'reschedule_retorno', retorno_id: 'retorno-1', nova_data: '2099-11-20' }),
    })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Remarcar retorno' })).not.toBeInTheDocument());
    expect(screen.getByText('20/11/2099')).toBeInTheDocument();
  });

  it('mantém a data e mostra erro para permitir nova tentativa ao remarcar', async () => {
    mocks.falharRemarcacao = true;
    render(<PortalPaciente />);
    await screen.findByText('Seus retornos');
    const botoesRemarcar = screen.getAllByRole('button', { name: 'Remarcar' });
    fireEvent.click(botoesRemarcar[botoesRemarcar.length - 1]);
    fireEvent.change(screen.getByLabelText('Nova data'), { target: { value: '2099-11-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar nova data' }));

    const dialog = await screen.findByRole('dialog', { name: 'Remarcar retorno' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Falha ao remarcar');
    expect(within(dialog).getByLabelText('Nova data')).toHaveValue('2099-11-20');
  });

  it('confirma retorno, bloqueia cliques repetidos e atualiza o estado', async () => {
    render(<PortalPaciente />);
    await screen.findByText('Seus retornos');
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirmar' })[1]);

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('patient-portal', expect.objectContaining({
      body: expect.objectContaining({ action: 'confirm_retorno', retorno_id: 'retorno-1' }),
    })));
    await waitFor(() => expect(screen.getByText(/confirmado/i)).toBeInTheDocument());
  });

  it('mostra erro no retorno quando a confirmação falha', async () => {
    mocks.falharConfirmacaoRetorno = true;
    render(<PortalPaciente />);
    await screen.findByText('Seus retornos');
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirmar' })[1]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao confirmar');
  });

  it('aceita a vaga e atualiza a lista de espera', async () => {
    mocks.mostrarOferta = true;
    render(<PortalPaciente />);
    const aceitar = await screen.findByRole('button', { name: 'Aceitar vaga' });
    fireEvent.click(aceitar);

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('patient-portal', expect.objectContaining({
      body: expect.objectContaining({ action: 'accept_waitlist_offer', lista_espera_id: 'oferta-1' }),
    })));
    await waitFor(() => expect(screen.queryByText('Vaga disponível para você')).not.toBeInTheDocument());
  });

  it('informa quando a vaga já expirou e mantém a ação disponível', async () => {
    mocks.mostrarOferta = true;
    mocks.falharAceiteOferta = true;
    render(<PortalPaciente />);
    fireEvent.click(await screen.findByRole('button', { name: 'Aceitar vaga' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A vaga expirou ou já foi preenchida');
    expect(screen.getByRole('button', { name: 'Aceitar vaga' })).toBeEnabled();
  });

  it('remarca consulta usando somente horário livre retornado pelo servidor', async () => {
    render(<PortalPaciente />);
    await screen.findAllByText('Consulta de rotina');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remarcar' })[0]);
    const dialog = await screen.findByRole('dialog', { name: /remarcar consulta/i });
    fireEvent.change(within(dialog).getByLabelText('Nova data *'), { target: { value: '2099-11-20' } });
    await within(dialog).findByRole('option', { name: '09:00' });
    fireEvent.change(within(dialog).getByLabelText('Horário disponível *'), { target: { value: '09:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('patient-portal', expect.objectContaining({
      body: expect.objectContaining({
        action: 'reschedule_agendamento',
        agendamento_id: 'consulta-1',
        nova_data: '2099-11-20',
        novo_horario: '09:00',
      }),
    })));
    expect(mocks.invoke).toHaveBeenCalledWith('patient-portal', expect.objectContaining({
      body: expect.objectContaining({ action: 'get_available_slots', agendamento_id: 'consulta-1' }),
    }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Consulta remarcada para 20/11/2099 às 09:00.'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mostra o aviso de clínica não notificada separado do sucesso da remarcação', async () => {
    mocks.avisoRemarcacao = 'A clínica não foi avisada automaticamente desta mudança. Se puder, confirme o novo horário com a clínica.';
    render(<PortalPaciente />);
    await screen.findAllByText('Consulta de rotina');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remarcar' })[0]);
    const dialog = await screen.findByRole('dialog', { name: /remarcar consulta/i });
    fireEvent.change(within(dialog).getByLabelText('Nova data *'), { target: { value: '2099-11-20' } });
    await within(dialog).findByRole('option', { name: '09:00' });
    fireEvent.change(within(dialog).getByLabelText('Horário disponível *'), { target: { value: '09:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /remarcar consulta/i })).not.toBeInTheDocument());

    // Sucesso continua claro, na região de status, sem o aviso misturado.
    const status = screen.getByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Consulta remarcada para 20/11/2099 às 09:00.'));
    expect(status).not.toHaveTextContent('A clínica não foi avisada');

    // Aviso operacional em elemento próprio, com semântica de alerta.
    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('Atenção: A clínica não foi avisada automaticamente desta mudança.');
    expect(aviso).not.toHaveTextContent('Consulta remarcada');
    expect(aviso).not.toBe(status);
    expect(aviso.contains(status)).toBe(false);
    expect(screen.queryByText(/Não foi possível remarcar/)).not.toBeInTheDocument();
  });

  it('mostra a consulta atual e limita a nova data ao prazo informado pelo servidor', async () => {
    render(<PortalPaciente />);
    await screen.findAllByText('Consulta de rotina');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remarcar' })[0]);
    const dialog = await screen.findByRole('dialog', { name: /remarcar consulta/i });

    expect(within(dialog).getByTestId('reschedule-current')).toHaveTextContent('Consulta atual: 15/10/2099 às 10:30');
    const campoData = within(dialog).getByLabelText('Nova data *');
    await waitFor(() => expect(campoData).toHaveAttribute('max', '2099-12-14'));
    expect(within(dialog).getByText('É possível remarcar pelo portal até 14/12/2099.')).toBeInTheDocument();
    expect(campoData).toHaveAttribute('aria-describedby', 'reschedule-date-limit');
    expect(mocks.invoke).toHaveBeenCalledWith('patient-portal', expect.objectContaining({
      body: expect.objectContaining({ action: 'get_remarcacao_limite' }),
    }));
  });

  it('mantém a remarcação disponível sem limite exibido se o prazo não carregar', async () => {
    mocks.falharLimiteRemarcacao = true;
    render(<PortalPaciente />);
    await screen.findAllByText('Consulta de rotina');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remarcar' })[0]);
    const dialog = await screen.findByRole('dialog', { name: /remarcar consulta/i });

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('patient-portal', expect.objectContaining({
      body: expect.objectContaining({ action: 'get_remarcacao_limite' }),
    })));
    expect(within(dialog).getByTestId('reschedule-current')).toHaveTextContent('Consulta atual: 15/10/2099 às 10:30');
    expect(within(dialog).getByLabelText('Nova data *')).not.toHaveAttribute('max');
    expect(within(dialog).queryByText(/É possível remarcar pelo portal até/)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Nova data *')).toBeEnabled();
  });

  it('mostra a consulta remarcada como agendada mesmo se a atualização da lista falhar', async () => {
    // O servidor volta "confirmado" para "agendado" ao remarcar. Sem a lista
    // nova, o card não pode continuar exibindo a confirmação antiga.
    mocks.confirmado = true;
    mocks.falharAtualizacaoLista = true;
    render(<PortalPaciente />);
    const titulos = await screen.findAllByText('Consulta de rotina');
    const card = titulos[titulos.length - 1].closest('[tabindex="-1"]') as HTMLElement;
    expect(within(card).getByText('Confirmado')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Remarcar' }));
    const dialog = await screen.findByRole('dialog', { name: /remarcar consulta/i });
    fireEvent.change(within(dialog).getByLabelText('Nova data *'), { target: { value: '2099-11-20' } });
    await within(dialog).findByRole('option', { name: '09:00' });
    fireEvent.change(within(dialog).getByLabelText('Horário disponível *'), { target: { value: '09:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Consulta remarcada, mas não foi possível atualizar a lista.');
    expect(within(card).getByText('Agendado')).toBeInTheDocument();
    expect(within(card).queryByText('Confirmado')).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
  });

  it('confirma consulta e anuncia o resultado', async () => {
    render(<PortalPaciente />);
    await screen.findAllByText('Consulta de rotina');
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirmar' })[0]);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Consulta confirmada.'));
    expect(mocks.invoke).toHaveBeenCalledWith('patient-portal', expect.objectContaining({
      body: expect.objectContaining({ action: 'confirm_agendamento', agendamento_id: 'consulta-1', expected_data: '2099-10-15', expected_hora_inicio: '10:30:00' }),
    }));
  });

  it('mostra erro de confirmação da consulta na página', async () => {
    mocks.falharConfirmacaoConsulta = true;
    render(<PortalPaciente />);
    await screen.findAllByText('Consulta de rotina');
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirmar' })[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('Consulta não pode mais ser confirmada');
  });

  it('esconde ações de paciente para uma consulta de data passada', async () => {
    mocks.dataConsulta = '2020-01-01';
    render(<PortalPaciente />);
    const title = await screen.findByText('Consulta de rotina');
    const card = title.closest('[tabindex="-1"]') as HTMLElement | null;
    expect(card).not.toBeNull();

    expect(within(card!).queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
    expect(within(card!).queryByRole('button', { name: 'Remarcar' })).not.toBeInTheDocument();
    expect(within(card!).queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument();
  });

  it('bloqueia ações para consulta de hoje cujo horário já começou', async () => {
    vi.setSystemTime(new Date('2026-10-01T13:00:00.000Z'));
    mocks.dataConsulta = '2026-10-01';
    mocks.horaConsulta = '09:30:00';
    render(<PortalPaciente />);
    const consultas = await screen.findAllByText('Consulta de rotina');
    const card = consultas[consultas.length - 1].closest('[tabindex="-1"]') as HTMLElement | null;

    expect(within(card!).queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
    expect(within(card!).queryByRole('button', { name: 'Remarcar' })).not.toBeInTheDocument();
    expect(within(card!).queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument();
  });

  it('mantém ações para consulta de hoje sem horário cadastrado', async () => {
    vi.setSystemTime(new Date('2026-10-01T13:00:00.000Z'));
    mocks.dataConsulta = '2026-10-01';
    mocks.horaConsulta = null;
    render(<PortalPaciente />);
    const consultas = await screen.findAllByText('Consulta de rotina');
    const card = consultas[consultas.length - 1].closest('[tabindex="-1"]') as HTMLElement | null;

    expect(within(card!).getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
    expect(within(card!).getByRole('button', { name: 'Remarcar' })).toBeInTheDocument();
    expect(within(card!).getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
  });

  it('bloqueia ações hoje quando o horário cadastrado é inválido', async () => {
    vi.setSystemTime(new Date('2026-10-01T13:00:00.000Z'));
    mocks.dataConsulta = '2026-10-01';
    mocks.horaConsulta = '25:99';
    render(<PortalPaciente />);
    const consultas = await screen.findAllByText('Consulta de rotina');
    const card = consultas[consultas.length - 1].closest('[tabindex="-1"]') as HTMLElement | null;

    expect(within(card!).queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
    expect(within(card!).queryByRole('button', { name: 'Remarcar' })).not.toBeInTheDocument();
    expect(within(card!).queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument();
  });

  it('explica quando a nova data não possui horários livres', async () => {
    mocks.semHorarios = true;
    render(<PortalPaciente />);
    await screen.findAllByText('Consulta de rotina');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remarcar' })[0]);
    const dialog = await screen.findByRole('dialog', { name: /remarcar consulta/i });
    fireEvent.change(within(dialog).getByLabelText('Nova data *'), { target: { value: '2099-11-20' } });

    expect(await within(dialog).findByRole('status')).toHaveTextContent('Nenhum horário disponível nesta data. Escolha outra data.');
    expect(within(dialog).getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });

  it('devolve o foco ao botão que abriu a remarcação', async () => {
    render(<PortalPaciente />);
    await screen.findAllByText('Consulta de rotina');
    const trigger = screen.getAllByRole('button', { name: 'Remarcar' })[0];
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: /remarcar consulta/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('atualiza a consulta se o estado mudar antes da remarcação', async () => {
    mocks.falharPorEstado = true;
    render(<PortalPaciente />);
    await screen.findAllByText('Consulta de rotina');
    const trigger = screen.getAllByRole('button', { name: 'Remarcar' })[0];
    const card = trigger.closest('[tabindex="-1"]');
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: /remarcar consulta/i });
    fireEvent.change(within(dialog).getByLabelText('Nova data *'), { target: { value: '2099-11-20' } });
    await within(dialog).findByRole('option', { name: '09:00' });
    fireEvent.change(within(dialog).getByLabelText('Horário disponível *'), { target: { value: '09:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Feche esta janela para ver a situação atual.');
    expect(within(dialog).getByLabelText('Nova data *')).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    await waitFor(() => expect(screen.getByText(/em_atendimento/i)).toBeInTheDocument());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(card).toHaveFocus());
  });

  it('limpa o horário escolhido e carrega opções novas quando a vaga é ocupada', async () => {
    mocks.falharRemarcacaoConsulta = true;
    render(<PortalPaciente />);
    await screen.findAllByText('Consulta de rotina');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remarcar' })[0]);
    const dialog = await screen.findByRole('dialog', { name: /remarcar consulta/i });
    fireEvent.change(within(dialog).getByLabelText('Nova data *'), { target: { value: '2099-11-20' } });
    await within(dialog).findByRole('option', { name: '09:00' });
    fireEvent.change(within(dialog).getByLabelText('Horário disponível *'), { target: { value: '09:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Horário acabou de ser ocupado');
    expect(within(dialog).getByLabelText('Horário disponível *')).toHaveValue('');
    await within(dialog).findByRole('option', { name: '09:00' });
  });
});
