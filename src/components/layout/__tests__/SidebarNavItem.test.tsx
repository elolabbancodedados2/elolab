import { render, screen } from '@testing-library/react';
import { Home } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SidebarNavItem } from '../SidebarNavItem';

describe('SidebarNavItem', () => {
  it('keeps the decorative animated icon out of the keyboard tab order', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <SidebarNavItem
          item={{ label: 'Overview', icon: Home, href: '/dashboard' }}
          collapsed={false}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link').querySelector('[aria-hidden="true"]')).toHaveAttribute('tabindex', '-1');
  });

  it('keeps a visible accessible name when the sidebar is collapsed', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <SidebarNavItem
          item={{ label: 'Visão geral', icon: Home, href: '/dashboard' }}
          collapsed
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Visão geral' })).toHaveAttribute('href', '/dashboard');
  });

  it('uses the visible label when the sidebar is expanded', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <SidebarNavItem
          item={{ label: 'Visão geral', icon: Home, href: '/dashboard' }}
          collapsed={false}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Visão geral' })).toBeInTheDocument();
  });

  it('marks the selected destination with the shared navigation tokens', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <SidebarNavItem
          item={{ label: 'Overview', icon: Home, href: '/dashboard' }}
          collapsed={false}
        />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Overview' });
    expect(link).toHaveClass('font-semibold');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveClass('bg-card', 'text-sidebar-accent-foreground', 'ring-sidebar-border');
  });
});
