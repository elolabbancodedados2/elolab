import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FieldHelp } from '@/components/ContextualHelp';
import { HELP_TERMS } from '@/lib/contextualHelp';

describe('FieldHelp', () => {
  it('explica o termo junto ao campo ao ser acionado', async () => {
    render(<FieldHelp term="glosa" />);
    const botao = screen.getByRole('button', { name: 'O que é Glosa?' });
    expect(screen.queryByText(/recusado ou reduzido/)).not.toBeInTheDocument();
    await userEvent.click(botao);
    expect(await screen.findByText(/recusado ou reduzido/)).toBeInTheDocument();
  });

  it('lista os significados de cada status de exame e as faixas do risco de falta', async () => {
    render(<><FieldHelp term="status_exame" /><FieldHelp term="risco_falta" /></>);
    await userEvent.click(screen.getByRole('button', { name: 'O que é Status do exame?' }));
    expect(await screen.findByText(/Laudo disponível:/)).toBeInTheDocument();
    expect(HELP_TERMS.risco_falta.items).toEqual(expect.arrayContaining([expect.stringMatching(/70 ou mais/), expect.stringMatching(/40 a 69/)]));
  });

  it('todo termo do glossário tem título e explicação', () => {
    for (const entry of Object.values(HELP_TERMS)) {
      expect(entry.title.length).toBeGreaterThan(2);
      expect(entry.summary.length).toBeGreaterThan(20);
    }
  });
});
