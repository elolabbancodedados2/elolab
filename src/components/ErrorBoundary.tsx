import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { trackError } from '@/lib/errorTracking';
import { atualizarVersaoAgora, ehErroDeVersao } from '@/lib/recargaVersao';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

type EstadoCopia = 'idle' | 'copiado' | 'falhou';

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  copia: EstadoCopia;
}

function reportError(error: Error, errorInfo?: React.ErrorInfo) {
  // Registra em produção pelo mesmo fluxo de telemetria dos erros globais;
  // o rastreio nunca pode derrubar a tela de recuperação.
  try {
    trackError(error, 'ErrorBoundary');
  } catch { /* telemetria indisponível */ }
  if (import.meta.env.DEV) {
    console.error('[ErrorBoundary]', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      componentStack: errorInfo?.componentStack || undefined,
    });
  }
}

export class ErrorBoundary extends Component<Props, State> {
  private copiaTimer?: ReturnType<typeof setTimeout>;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, copia: 'idle' };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    reportError(error, errorInfo);
    this.setState({ error, errorInfo });
  }

  componentWillUnmount() {
    if (this.copiaTimer) clearTimeout(this.copiaTimer);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined, copia: 'idle' });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleUpdateVersion = () => {
    atualizarVersaoAgora();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  private marcarCopia(copia: EstadoCopia) {
    this.setState({ copia });
    if (this.copiaTimer) clearTimeout(this.copiaTimer);
    this.copiaTimer = setTimeout(() => this.setState({ copia: 'idle' }), 4000);
  }

  handleCopyError = async () => {
    const errorText = [
      `Erro: ${this.state.error?.message}`,
      `Data: ${new Date().toISOString()}`,
      `URL: ${window.location.href}`,
      this.state.error?.stack ? `\nStack:\n${this.state.error.stack}` : '',
    ].join('\n');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Área de transferência indisponível');
      await navigator.clipboard.writeText(errorText);
      this.marcarCopia('copiado');
    } catch {
      this.marcarCopia('falhou');
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      if (ehErroDeVersao(this.state.error)) {
        return (
          <div className="min-h-[400px] flex items-center justify-center p-4">
            <Card className="max-w-lg w-full">
              <CardHeader className="text-center">
                <div className="mx-auto h-12 w-12 rounded-full bg-secondary flex items-center justify-center mb-4">
                  <RefreshCw aria-hidden="true" className="h-6 w-6 text-foreground" />
                </div>
                <CardTitle>Nova versão disponível</CardTitle>
                <CardDescription>
                  O EloLab foi atualizado enquanto esta tela estava aberta. Atualize para carregar a versão nova; nada do que já foi salvo se perde.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={this.handleUpdateVersion} className="w-full">
                  <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />
                  Atualizar versão
                </Button>
              </CardContent>
            </Card>
          </div>
        );
      }

      const { copia } = this.state;
      return (
        <div className="min-h-[400px] flex items-center justify-center p-4">
          <Card className="max-w-lg w-full">
            <CardHeader className="text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <AlertTriangle aria-hidden="true" className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Algo deu errado</CardTitle>
              <CardDescription>
                Ocorreu um erro inesperado. Por favor, tente novamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {this.state.error && (
                <div className="p-3 bg-muted rounded-lg overflow-auto max-h-32">
                  <p className="text-xs font-mono text-muted-foreground">
                    {this.state.error.message}
                  </p>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={this.handleReset} className="flex-1">
                  <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />
                  Tentar Novamente
                </Button>
                <Button variant="outline" onClick={this.handleGoHome} className="flex-1">
                  <Home aria-hidden="true" className="mr-2 h-4 w-4" />
                  Ir para Início
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void this.handleCopyError()}
                className="w-full text-xs text-muted-foreground"
              >
                {copia === 'copiado'
                  ? <Check aria-hidden="true" className="mr-2 h-3 w-3" />
                  : <Copy aria-hidden="true" className="mr-2 h-3 w-3" />}
                {copia === 'copiado' ? 'Detalhes copiados' : 'Copiar detalhes do erro'}
              </Button>
              <p role="status" aria-live="polite" className="text-center text-xs text-muted-foreground">
                {copia === 'copiado' && 'Detalhes do erro copiados. Cole na mensagem para o suporte.'}
                {copia === 'falhou' && 'Não foi possível copiar automaticamente. Selecione o texto acima e copie.'}
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
