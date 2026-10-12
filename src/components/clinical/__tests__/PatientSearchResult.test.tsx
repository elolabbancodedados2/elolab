import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientSearchResult } from '@/components/clinical/PatientSearchResult';

describe('seleção de paciente para prontuário', () => {
  it('permite selecionar um paciente com teclado', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PatientSearchResult paciente={{ id: 'p-1', nome: 'Ana Souza', nome_social: null, cpf: '123.456.789-00', telefone: null, email: null, data_nascimento: null }} selecionado={false} onSelect={onSelect} />);

    const resultado = screen.getByRole('button', { name: /Ana Souza/ });
    await user.tab();
    expect(resultado).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith('p-1');
  });
});
