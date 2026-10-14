import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoleAccessPreview } from '../RoleAccessPreview';

describe('RoleAccessPreview', () => {
  it('asks for a role before listing screens', () => {
    render(<RoleAccessPreview roles={[]} />);

    expect(screen.getByRole('region', { name: 'Prévia de acesso' })).toBeInTheDocument();
    expect(screen.getByText(/Selecione um papel/)).toBeInTheDocument();
    expect(screen.queryByText('Agenda')).not.toBeInTheDocument();
  });

  it('updates the accessible screen preview when selected roles change', () => {
    const { rerender } = render(<RoleAccessPreview roles={['recepcao']} />);

    expect(screen.getByText('Agenda')).toBeInTheDocument();
    expect(screen.queryByText('Contas a receber e a pagar')).not.toBeInTheDocument();

    rerender(<RoleAccessPreview roles={['financeiro']} />);

    expect(screen.getByText('Contas a receber e a pagar')).toBeInTheDocument();
    expect(screen.queryByText('Agenda')).not.toBeInTheDocument();
    expect(screen.getByText(/acesso aos dados continua sujeito às permissões da clínica/i)).toBeInTheDocument();
  });
});
