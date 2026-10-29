import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Breadcrumbs } from '@/components/Breadcrumbs';

describe('Breadcrumbs', () => {
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
