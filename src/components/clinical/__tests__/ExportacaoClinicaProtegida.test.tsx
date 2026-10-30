import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportacaoClinicaProtegida } from '../ExportacaoClinicaProtegida';

const { criptografarExportClinico } = vi.hoisted(() => ({ criptografarExportClinico: vi.fn() }));
vi.mock('@/lib/clinicalExportEncryption', () => ({ criptografarExportClinico }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const baseProps = {
  onCancel: vi.fn(),
  conteudo: '{"resourceType":"Bundle"}',
  nomeArquivo: 'fhir-qa',
  tipo: 'application/json' as const,
};

describe('ExportacaoClinicaProtegida', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:qa-export') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders as a page, keeps the file context and blocks mismatched passwords', () => {
    render(<ExportacaoClinicaProtegida {...baseProps} />);

    expect(screen.getByTestId('protected-clinical-export-page')).toBeVisible();
    expect(screen.getByText('fhir-qa.elolab')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Senha de proteção'), { target: { value: 'SenhaMuitoSegura123' } });
    fireEvent.change(screen.getByLabelText('Confirme a senha'), { target: { value: 'SenhaDiferente123' } });

    expect(screen.getByText('As senhas não conferem.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Baixar arquivo protegido' })).toBeDisabled();
    expect(criptografarExportClinico).not.toHaveBeenCalled();
  });

  it('audits before downloading and returns after encryption succeeds', async () => {
    criptografarExportClinico.mockResolvedValue('{"formato":"elolab-clinical-export"}');
    const onBeforeDownload = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    render(<ExportacaoClinicaProtegida {...baseProps} onBeforeDownload={onBeforeDownload} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText('Senha de proteção'), { target: { value: 'SenhaMuitoSegura123' } });
    fireEvent.change(screen.getByLabelText('Confirme a senha'), { target: { value: 'SenhaMuitoSegura123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Baixar arquivo protegido' }));

    await waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
    expect(onBeforeDownload).toHaveBeenCalledOnce();
    expect(criptografarExportClinico).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });

  it('keeps the page and password when the audit step fails', async () => {
    criptografarExportClinico.mockResolvedValue('{"formato":"elolab-clinical-export"}');
    const onBeforeDownload = vi.fn().mockRejectedValue(new Error('Auditoria indisponível'));
    const onCancel = vi.fn();
    render(<ExportacaoClinicaProtegida {...baseProps} onBeforeDownload={onBeforeDownload} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText('Senha de proteção'), { target: { value: 'SenhaMuitoSegura123' } });
    fireEvent.change(screen.getByLabelText('Confirme a senha'), { target: { value: 'SenhaMuitoSegura123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Baixar arquivo protegido' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Auditoria indisponível');
    expect(screen.getByLabelText('Confirme a senha')).toHaveValue('SenhaMuitoSegura123');
    expect(screen.getByTestId('protected-clinical-export-page')).toBeVisible();
    expect(onCancel).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
