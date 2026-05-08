/**
 * MFAVerifyDialog Component
 * Diálogo para verificar TOTP durante login
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { validateTOTPToken } from '@/lib/mfaManager';

interface MFAVerifyDialogProps {
  open: boolean;
  mfaSecret: string;
  onVerifyComplete: (isValid: boolean) => void;
  isLoading?: boolean;
}

export function MFAVerifyDialog({
  open,
  mfaSecret,
  onVerifyComplete,
  isLoading = false,
}: MFAVerifyDialogProps) {
  const [token, setToken] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = async () => {
    if (token.length !== 6 || !/^\d+$/.test(token)) {
      toast.error('Token deve conter 6 dígitos');
      return;
    }

    setIsVerifying(true);
    try {
      const isValid = validateTOTPToken(token, mfaSecret);

      if (!isValid) {
        toast.error('Token inválido. Tente novamente.');
        setToken('');
        setIsVerifying(false);
        return;
      }

      onVerifyComplete(true);
    } catch (error) {
      toast.error('Erro ao validar token');
      console.error(error);
      setIsVerifying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && token.length === 6) {
      handleVerify();
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🔐 Verificar Autenticação
          </DialogTitle>
          <DialogDescription>
            Digite o código do seu authenticator para continuar
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertDescription>
              Abra seu app authenticator e copie o código de 6 dígitos.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="mfa-verify-token">Código de Autenticação</Label>
            <Input
              id="mfa-verify-token"
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={handleKeyDown}
              placeholder="000000"
              maxLength={6}
              className="text-center text-2xl font-mono tracking-widest"
              autoFocus
            />
          </div>

          <Button
            onClick={handleVerify}
            disabled={token.length !== 6 || isVerifying || isLoading}
            className="w-full"
            size="lg"
          >
            {isVerifying ? 'Verificando...' : 'Continuar'}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Não tem acesso ao authenticator?{' '}
            <button className="text-primary hover:underline">
              Use um código de backup
            </button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
