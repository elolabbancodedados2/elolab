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
  it('hides the lot identifier on its return page', () => {
    const lotId = '00000000-0000-4000-9000-000000000221';
    render(<MemoryRouter initialEntries={[`/faturamento-convenios/lotes/${lotId}/retorno`]}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByText('Registrar retorno do lote')).toBeInTheDocument();
    expect(screen.queryByText(lotId)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href')?.includes(lotId))).toBe(false);
  });
  it('hides the lot identifier on the dedicated guides workspace', () => {
    const lotId = '00000000-0000-4000-9000-000000000241';
    render(<MemoryRouter initialEntries={[`/faturamento-convenios/lotes/${lotId}/guias`]}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByText('Conferir guias do lote')).toBeInTheDocument();
    expect(screen.queryByText(lotId)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href')?.includes(lotId))).toBe(false);
    expect(screen.queryByRole('link', { name: 'Lotes' })).not.toBeInTheDocument();
  });
  it('labels the dedicated TISS glosa form', () => {
    render(<MemoryRouter initialEntries={['/faturamento-convenios/glosas/nova']}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByText('Registrar glosa')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Faturamento de convênios' })).toHaveAttribute('href', '/faturamento-convenios');
  });
  it.each([
    ['/faturamento-convenios/glosas/00000000-0000-4000-9000-000000000242/recurso', 'Preparar recurso de glosa'],
    ['/faturamento-convenios/glosas/00000000-0000-4000-9000-000000000243/retorno', 'Registrar retorno da operadora'],
  ])('hides glosa identifiers on dedicated workflow pages: %s', (path, label) => {
    const id = path.split('/')[3];
    render(<MemoryRouter initialEntries={[path]}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(id)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href')?.includes(id))).toBe(false);
    expect(screen.queryByRole('link', { name: 'Glosas' })).not.toBeInTheDocument();
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
  it('omite o identificador do lançamento no breadcrumb de edição', () => {
    const movementId = '00000000-0000-4000-9000-000000000085';
    render(<MemoryRouter initialEntries={[`/recepcao/caixa/lancamentos/${movementId}/editar`]}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByText('Editar lançamento do caixa')).toBeInTheDocument();
    expect(screen.queryByText(movementId)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href')?.includes(movementId))).toBe(false);
  });
  it('omite o identificador do repasse no registro de pagamento', () => {
    const repasseId = '00000000-0000-4000-9000-000000000091';
    render(<MemoryRouter initialEntries={[`/repasses-medicos/${repasseId}/pagamento`]}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByText('Registrar pagamento de repasse')).toBeInTheDocument();
    expect(screen.queryByText(repasseId)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href')?.includes(repasseId))).toBe(false);
  });
  it('omite o identificador da conta no registro do pagamento', () => {
    const accountId = '00000000-0000-4000-9000-000000000043';
    render(<MemoryRouter initialEntries={[`/contas/pagar/${accountId}/pagamento`]}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByText('Registrar pagamento da conta')).toBeInTheDocument();
    expect(screen.queryByText(accountId)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href')?.includes(accountId))).toBe(false);
  });
  it('omite o identificador da conta nos detalhes da receita', () => {
    const accountId = '00000000-0000-4000-9000-000000000041';
    render(<MemoryRouter initialEntries={[`/contas/receber/${accountId}/detalhes`]}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByText('Detalhes da conta a receber')).toBeInTheDocument();
    expect(screen.queryByText(accountId)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href')?.includes(accountId))).toBe(false);
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
