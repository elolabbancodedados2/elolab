/**
 * MFASetupDialog Component
 * Guia de configuração de autenticação de dois fatores
 */

import { useState } from 'react';
import { Copy, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { generateMFASetup, validateTOTPToken } from '@/lib/mfaManager';

interface MFASetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string;
  onMFASetupComplete: (secret: string, backupCodes: string[]) => Promise<void>;
  isLoading?: boolean;
}

export function MFASetupDialog({
  open,
  onOpenChange,
  userEmail,
  onMFASetupComplete,
  isLoading = false,
}: MFASetupDialogProps) {
  const [step, setStep] = useState<'setup' | 'verify' | 'backup'>('setup');
  const [mfaSetup, setMfaSetup] = useState<any>(null);
  const [token, setToken] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleGenerateQR = async () => {
    setIsSettingUp(true);
    try {
      const setup = await generateMFASetup(userEmail);
      setMfaSetup(setup);
      setStep('verify');
    } catch (error) {
      toast.error('Erro ao gerar QR code');
      console.error(error);
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleVerifyToken = async () => {
    if (token.length !== 6 || !/^\d+$/.test(token)) {
      toast.error('Token deve conter 6 dígitos');
      return;
    }

    setIsVerifying(true);
    try {
      const isValid = validateTOTPToken(token, mfaSetup.secret);

      if (!isValid) {
        toast.error('Token inválido. Tente novamente.');
        setToken('');
        return;
      }

      setStep('backup');
    } catch (error) {
      toast.error('Erro ao validar token');
      console.error(error);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleConfirm = async () => {
    try {
      await onMFASetupComplete(mfaSetup.secret, mfaSetup.backupCodes);
      toast.success('Autenticação de dois fatores ativada!');
      onOpenChange(false);
      setStep('setup');
      setMfaSetup(null);
      setToken('');
    } catch (error) {
      toast.error('Erro ao salvar configuração de MFA');
      console.error(error);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🔐 Configurar Autenticação de Dois Fatores
          </DialogTitle>
          <DialogDescription>
            Aumente a segurança da sua conta com TOTP (authenticator app)
          </DialogDescription>
        </DialogHeader>

        {step === 'setup' && (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Você precisará de um app authenticator como Google Authenticator, Microsoft Authenticator ou Authy.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <h3 className="font-semibold">Passo 1: Gerar QR Code</h3>
              <p className="text-sm text-muted-foreground">
                Clique abaixo para gerar um código QR único para sua conta.
              </p>
              <Button onClick={handleGenerateQR} disabled={isSettingUp}>
                {isSettingUp ? 'Gerando...' : 'Gerar QR Code'}
              </Button>
            </div>
          </div>
        )}

        {step === 'verify' && mfaSetup && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-semibold">Passo 2: Escanear QR Code</h3>
              <p className="text-sm text-muted-foreground">
                Abra seu app authenticator e escaneie este QR code.
              </p>

              <Card className="p-4 flex items-center justify-center bg-white dark:bg-slate-950">
                <img
                  src={mfaSetup.qrCodeUrl}
                  alt="QR Code para MFA"
                  className="w-48 h-48"
                />
              </Card>

              <p className="text-xs text-muted-foreground text-center">
                Ou enter este código manualmente:
              </p>
              <code className="block bg-muted p-2 rounded text-center text-sm font-mono">
                {mfaSetup.secret}
              </code>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">Passo 3: Verificar Código</h3>
              <p className="text-sm text-muted-foreground">
                Digite o código de 6 dígitos que aparece no seu app.
              </p>

              <Label htmlFor="mfa-token">Código de Verificação</Label>
              <Input
                id="mfa-token"
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="text-center text-2xl font-mono tracking-widest"
              />

              <Button
                onClick={handleVerifyToken}
                disabled={token.length !== 6 || isVerifying}
                className="w-full"
              >
                {isVerifying ? 'Verificando...' : 'Verificar Código'}
              </Button>
            </div>
          </div>
        )}

        {step === 'backup' && mfaSetup && (
          <div className="space-y-4">
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
              <Check className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                ✅ Código verificado com sucesso!
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <h3 className="font-semibold">Passo 4: Salvar Códigos de Backup</h3>
              <p className="text-sm text-muted-foreground">
                Se perder acesso ao seu authenticator, use esses códigos para recuperar a conta. Guarde em local seguro.
              </p>

              <div className="bg-muted p-4 rounded space-y-2 max-h-40 overflow-y-auto">
                {mfaSetup.backupCodes.map((code: string, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 hover:bg-background rounded"
                  >
                    <code className="font-mono text-sm">{code}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(code, idx)}
                    >
                      {copiedIndex === idx ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                💡 Salve esses códigos em um lugar seguro (password manager, impressão, etc)
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step !== 'setup' && (
            <Button
              variant="outline"
              onClick={() => {
                if (step === 'verify') setStep('setup');
                else if (step === 'backup') setStep('verify');
              }}
            >
              Voltar
            </Button>
          )}

          {step === 'backup' && (
            <Button onClick={handleConfirm} disabled={isLoading}>
              {isLoading ? 'Salvando...' : '✅ Ativar 2FA'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
