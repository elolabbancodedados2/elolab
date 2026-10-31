import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PerfisDeAcesso } from '../PerfisDeAcesso';

describe('PerfisDeAcesso', () => {
  it('mostra quem acessa cada módulo a partir do menu, sem o painel da plataforma', () => {
    render(<PerfisDeAcesso />);

    const tabela = screen.getByRole('table', { name: 'Módulos liberados por perfil' });
    const agenda = within(tabela).getByRole('row', { name: /^Agenda/ });
    expect(within(agenda).getByLabelText('Administrador: acessa')).toBeInTheDocument();
    expect(within(agenda).getByLabelText('Recepção: acessa')).toBeInTheDocument();

    const acessoAssistido = within(tabela).getByRole('row', { name: /Acesso assistido pelo suporte/ });
    expect(within(acessoAssistido).getByLabelText('Administrador: acessa')).toBeInTheDocument();
    expect(within(acessoAssistido).getByLabelText('Recepção: sem acesso')).toBeInTheDocument();

    expect(within(tabela).queryByRole('row', { name: /Saúde do serviço/ })).not.toBeInTheDocument();
  });
});
