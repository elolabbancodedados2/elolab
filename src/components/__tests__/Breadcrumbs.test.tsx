import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Breadcrumbs } from '@/components/Breadcrumbs';

describe('Breadcrumbs', () => {
  it('keeps the cash flow as the parent of bank statement import', () => {
    render(<MemoryRouter initialEntries={['/fluxo-caixa/extrato?mes=2026-10']}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByText('Importar extrato bancário')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fluxo de caixa' })).toHaveAttribute('href', '/fluxo-caixa');
  });
  it('labels the dedicated TISS lot creation page', () => {
    render(<MemoryRouter initialEntries={['/faturamento-convenios/lotes/novo']}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByText('Novo lote TISS')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Faturamento de convênios' })).toHaveAttribute('href', '/faturamento-convenios');
  });
  it.each([
    '/exames/laboratorios/record-qa/editar',
    '/gestao-fluxo/salas/record-qa/editar',
    '/precos-servicos/tipos/record-qa/precos',
    '/retornos/record-qa/agendar',
    '/convenios/record-qa/editar',
    '/equipe/funcionarios/record-qa/editar',
    '/usuarios/record-qa/editar',
    '/estoque/record-qa/historico',
    '/tarefas/record-qa/editar',
    '/precos-servicos/exames/convenios/record-qa/editar',
    '/recepcao/caixa/record-qa/fechar',
  ])('não cria links para segmentos de registro sem página em %s', path => {
    render(<MemoryRouter initialEntries={[path]}><Breadcrumbs /></MemoryRouter>);
    expect(screen.queryByText('Record qa')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href')?.includes('record-qa'))).toBe(false);
  });
  it('mantém a tabela como destino válido e omite os identificadores na edição de preço', () => {
    render(<MemoryRouter initialEntries={['/convenios/record-qa/exames/price-qa/editar']}><Breadcrumbs /></MemoryRouter>);
    expect(screen.queryByText('Record qa')).not.toBeInTheDocument();
    expect(screen.queryByText('Price qa')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href') === '/convenios/record-qa/exames')).toBe(true);
  });
  it('omite o identificador da consulta no breadcrumb de finalização', () => {
    const appointmentId = '00000000-0000-4000-9000-000000000012';
    render(<MemoryRouter initialEntries={[`/atendimentos/${appointmentId}/finalizar`]}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByText('Finalizar atendimento')).toBeInTheDocument();
    expect(screen.queryByText(appointmentId)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href')?.includes(appointmentId))).toBe(false);
  });
  it('omite o identificador do caixa no breadcrumb de fechamento', () => {
    const cashId = '00000000-0000-4000-9000-000000000015';
    render(<MemoryRouter initialEntries={[`/recepcao/caixa/${cashId}/fechar`]}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByText('Fechar caixa')).toBeInTheDocument();
    expect(screen.queryByText(cashId)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href')?.includes(cashId))).toBe(false);
  });
  it('omite o identificador do repasse no registro de pagamento', () => {
    const repasseId = '00000000-0000-4000-9000-000000000091';
    render(<MemoryRouter initialEntries={[`/repasses-medicos/${repasseId}/pagamento`]}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByText('Registrar pagamento de repasse')).toBeInTheDocument();
    expect(screen.queryByText(repasseId)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href')?.includes(repasseId))).toBe(false);
  });
  it('omite o identificador do prontuário no breadcrumb do novo adendo', () => {
    const recordId = '00000000-0000-4000-9000-000000000013';
    render(<MemoryRouter initialEntries={[`/prontuarios/${recordId}/adendos/novo`]}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByText('Novo adendo ao prontuário')).toBeInTheDocument();
    expect(screen.queryByText(recordId)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href')?.includes(recordId))).toBe(false);
  });
  it('omite o identificador nas páginas de consentimento', () => {
    const patientId = '00000000-0000-4000-9000-000000000014';
    render(<MemoryRouter initialEntries={[`/pacientes/${patientId}/consentimentos/tratamento_dados/revogar`]}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByText('Revogar consentimento')).toBeInTheDocument();
    expect(screen.queryByText(patientId)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href')?.includes(patientId))).toBe(false);
  });
  it('exibe o nome correto da Central de Notificações', () => {
    render(
      <MemoryRouter initialEntries={['/notificacoes']}>
        <Breadcrumbs />
      </MemoryRouter>,
    );

    expect(screen.getByText('Central de notificações')).toBeInTheDocument();
    expect(screen.queryByText(/Ã/)).not.toBeInTheDocument();
  });
});
