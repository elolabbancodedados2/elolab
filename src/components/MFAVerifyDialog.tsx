/**
 * MFAVerifyDialog — segundo fator no login, validado pelo servidor do Supabase.
 *
 * A versão anterior deste componente validava o TOTP no navegador e nunca era
 * usada em lugar nenhum — o login jamais pedia o segundo fator. Agora o
 * Auth.tsx chama este diálogo quando a conta tem um fator TOTP verificado e a
 * sessão ainda está em AAL1.
 */

import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface MFAVerifyDialogProps {
  open: boolean;
  /** Id do fator TOTP verificado da conta. */
  factorId: string;
  /** Chamado quando a sessão é elevada a AAL2. */
  onVerified: () => void;
  /** Chamado se o usuário desistir — a sessão pela metade é encerrada. */
  onCancel: () => void;
}

export function MFAVerifyDialog({ open, factorId, onVerified, onCancel }: MFAVerifyDialogProps) {
  const [token, setToken] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = async () => {
    if (!/^\d{6}$/.test(token)) {
      toast.error('O código deve ter 6 dígitos');
      return;
    }

    setIsVerifying(true);
    try {
      // Validação no servidor; eleva a sessão para AAL2.
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: token });
      if (error) throw error;
      onVerified();
    } catch (err: any) {
      toast.error(err?.message || 'Código inválido. Tente novamente.');
      setToken('');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Verificação em duas etapas
          </DialogTitle>
          <DialogDescription>
            Digite o código de 6 dígitos do seu aplicativo autenticador.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="mfa-verify-token">Código</Label>
          <Input
            id="mfa-verify-token"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            placeholder="000000"
            value={token}
            onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && handleVerify()}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onCancel} disabled={isVerifying}>
            Cancelar
          </Button>
          <Button onClick={handleVerify} disabled={isVerifying || token.length !== 6}>
            {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verificar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
