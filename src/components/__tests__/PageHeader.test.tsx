import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from '../PageHeader';

describe('PageHeader', () => {
  it('mantém título, descrição e ações na hierarquia do cabeçalho da página', () => {
    render(
      <PageHeader
        title="Pacientes"
        description="Gestão completa do cadastro de pacientes"
        actions={<button type="button">Novo paciente</button>}
      />,
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Pacientes' })).toBeInTheDocument();
    expect(screen.getByText('Gestão completa do cadastro de pacientes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo paciente' })).toBeInTheDocument();
  });

  it('trata o ícone de apoio como decorativo', () => {
    render(<PageHeader title="Exames" icon={<svg data-testid="page-header-icon" />} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Exames' })).toBeInTheDocument();
    expect(screen.getByTestId('page-header-icon').parentElement).toHaveAttribute('aria-hidden', 'true');
  });
});
