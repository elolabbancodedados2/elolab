import { type FormEvent, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, QrCode, Smartphone } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';

interface NewWhatsAppSessionPageProps {
  isCreating: boolean;
  onCreate: (instanceName: string) => Promise<unknown>;
}

type NavigationState = { returnFocusId?: string } | null;

const INSTANCE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export function NewWhatsAppSessionPage({ isCreating, onCreate }: NewWhatsAppSessionPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const completed = useRef(false);
  const navigationState = location.state as NavigationState;
  const [instanceName, setInstanceName] = useState('');
  const [failed, setFailed] = useState(false);
  const isValid = INSTANCE_NAME_PATTERN.test(instanceName);

  const goBack = () => {
    navigate('/agente-ia', {
      replace: true,
      state: { focusId: navigationState?.returnFocusId || 'whatsapp-new-session-button' },
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid || isCreating) return;

    setFailed(false);
    try {
      await onCreate(instanceName);
      completed.current = true;
      navigate('/agente-ia', { replace: true, state: { focusId: 'whatsapp-sessions-heading' } });
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <PageHeader
        title="Conectar sessão de WhatsApp"
        description="Crie a conexão da clínica e continue pela leitura do QR Code na lista de sessões."
        icon={<Smartphone />}
        actions={(
          <Button type="button" variant="outline" onClick={goBack} className="gap-2 rounded-full">
            <ArrowLeft className="h-4 w-4" />
            Voltar às sessões
          </Button>
        )}
      />

      <main className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Nova conexão</p>
            <CardTitle className="text-xl">Identifique esta sessão</CardTitle>
            <CardDescription>
              O nome ajuda a equipe a reconhecer a linha conectada. Ele não altera o nome exibido no WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="whatsapp-instance-name">Nome da sessão *</Label>
                <Input
                  id="whatsapp-instance-name"
                  name="instance_name"
                  value={instanceName}
                  onChange={(event) => {
                    setInstanceName(event.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64));
                    setFailed(false);
                  }}
                  placeholder="Ex.: clinica_principal"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={64}
                  required
                  aria-invalid={instanceName.length > 0 && !isValid}
                  aria-describedby="whatsapp-instance-name-help"
                />
                <p id="whatsapp-instance-name-help" className={`text-sm leading-5 ${instanceName.length > 0 && !isValid ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {instanceName.length > 0 && !isValid
                    ? 'O nome deve começar com uma letra ou número.'
                    : 'Comece com uma letra ou número. Use até 64 letras, números, hífens ou sublinhados.'}
                </p>
              </div>

              {failed && (
                <Alert variant="destructive">
                  <AlertTitle>Não foi possível concluir a criação</AlertTitle>
                  <AlertDescription>
                    O nome foi mantido. Confira a lista de sessões antes de repetir a tentativa, para evitar uma conexão duplicada.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <Button type="submit" disabled={!isValid || isCreating} className="gap-2 rounded-full">
                  {isCreating ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" /> : <QrCode className="h-4 w-4" />}
                  {isCreating ? 'Criando sessão…' : 'Criar sessão'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <aside aria-labelledby="whatsapp-connection-steps" className="space-y-4 lg:border-l lg:border-border lg:pl-6">
          <div>
            <h2 id="whatsapp-connection-steps" className="text-base font-semibold">Depois de criar</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">A conexão segue estas etapas:</p>
          </div>
          <ol className="space-y-5">
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">1</span>
              <div><p className="font-medium">Criar a sessão</p><p className="mt-0.5 text-sm leading-5 text-muted-foreground">O EloLab registra a conexão para esta clínica.</p></div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-foreground">2</span>
              <div><p className="font-medium">Abrir o QR Code</p><p className="mt-0.5 text-sm leading-5 text-muted-foreground">O código aparece no cartão da sessão. Se expirar, gere outro por lá.</p></div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-foreground">3</span>
              <div><p className="font-medium">Conectar o aparelho</p><p className="mt-0.5 text-sm leading-5 text-muted-foreground">No WhatsApp, abra Aparelhos conectados e leia o código mostrado no EloLab.</p></div>
            </li>
          </ol>
          <div className="flex gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p>Use uma linha autorizada pela clínica. A conexão só estará pronta quando o estado da sessão indicar “Conectado”.</p>
          </div>
        </aside>
      </main>

      <UnsavedChangesGuard dirty={instanceName.length > 0} busy={isCreating} completed={completed} />
    </div>
  );
}
