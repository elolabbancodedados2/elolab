import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const tracking = vi.hoisted(() => ({ trackError: vi.fn() }));
vi.mock('@/lib/errorTracking', () => tracking);

const ChunkError = () => {
  throw new TypeError('Failed to fetch dynamically imported module: https://app/assets/Agenda-abc.js');
};

const ThrowingComponent = () => {
  throw new Error('Test error');
};

// Suppress console.error for error boundary tests
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalConsoleError;
});

describe('ErrorBoundary', () => {
  it('renderiza children quando não há erro', () => {
    render(
      <ErrorBoundary>
        <div>Conteúdo OK</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Conteúdo OK')).toBeInTheDocument();
  });

  it('renderiza fallback default quando há erro', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('renderiza fallback customizado', () => {
    render(
      <ErrorBoundary fallback={<div>Erro customizado</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Erro customizado')).toBeInTheDocument();
  });

  it('mostra botão tentar novamente', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Tentar Novamente')).toBeInTheDocument();
  });

  it('mostra botão ir para início', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Ir para Início')).toBeInTheDocument();
  });

  it('registra o erro no rastreamento também fora do modo de desenvolvimento', () => {
    tracking.trackError.mockClear();
    render(<ErrorBoundary><ThrowingComponent /></ErrorBoundary>);
    expect(tracking.trackError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Test error' }), 'ErrorBoundary');
  });

  it('confirma quando os detalhes do erro são copiados', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ErrorBoundary><ThrowingComponent /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: /copiar detalhes do erro/i }));
    expect(await screen.findByText('Detalhes do erro copiados. Cole na mensagem para o suporte.')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Erro: Test error'));
  });

  it('avisa quando não consegue copiar', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('negado')) }, configurable: true });
    render(<ErrorBoundary><ThrowingComponent /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: /copiar detalhes do erro/i }));
    expect(await screen.findByText(/Não foi possível copiar automaticamente/)).toBeInTheDocument();
  });

  it('oferece "Atualizar versão" quando um arquivo da versão anterior não carrega', () => {
    render(<ErrorBoundary><ChunkError /></ErrorBoundary>);
    expect(screen.getByText('Nova versão disponível')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar versão' })).toBeInTheDocument();
  });
});
