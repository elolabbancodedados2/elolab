import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Breadcrumbs } from '@/components/Breadcrumbs';

describe('Breadcrumbs', () => {
  it('exibe o nome correto da Central de Notificações', () => {
    render(
      <MemoryRouter initialEntries={['/notificacoes']}>
        <Breadcrumbs />
      </MemoryRouter>,
    );

    expect(screen.getByText('Notificações')).toBeInTheDocument();
    expect(screen.queryByText(/Ã/)).not.toBeInTheDocument();
  });
});
