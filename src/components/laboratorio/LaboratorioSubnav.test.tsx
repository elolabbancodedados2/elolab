import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ roles: ['medico'] as string[] }));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({
    hasAnyRole: (roles: string[]) => mocks.roles.includes('admin') || roles.some((role) => mocks.roles.includes(role)),
  }),
}));

import { LaboratorioSubnav } from './LaboratorioSubnav';

describe('LaboratorioSubnav', () => {
  beforeEach(() => {
    mocks.roles = ['medico'];
  });

  it('shows only destinations allowed to doctors', () => {
    render(<MemoryRouter><LaboratorioSubnav /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Visão geral' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Laudos' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mapa de coleta' })).not.toBeInTheDocument();
  });

  it('shows collection map for nursing staff', () => {
    mocks.roles = ['enfermagem'];
    render(<MemoryRouter><LaboratorioSubnav /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Mapa de coleta' })).toBeInTheDocument();
  });
});
