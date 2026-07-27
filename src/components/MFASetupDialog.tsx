/**
 * MFASetupDialog — cadastro de segundo fator (TOTP) usando o MFA nativo do
 * Supabase Auth.
 *
 * A versão anterior gerava o segredo no navegador, validava o código também no
 * navegador e guardava segredo e backup codes em texto puro na tabela profiles.
 * Como a sessão já era emitida antes dessa checagem, bastava ignorar a tela para
 * entrar — o 2FA não protegia nada. Aqui quem gera o segredo e valida o código é
 * o servidor do Supabase, e o fator fica registrado no próprio JWT (AAL2).
 */

import { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface MFASetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após o fator ser verificado com sucesso no servidor. */
  onMFASetupComplete: () => Promise<void> | void;
}

export function MFASetupDialog({ open, onOpenChange, onMFASetupComplete }: MFASetupDialogProps) {
  const [step, setStep] = useState<'intro' | 'verify'>('intro');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  const reset = () => {
    setStep('intro');
    setFactorId(null);
    setQrCode(null);
    setSecret(null);
    setToken('');
  };

  const handleClose = async (nextOpen: boolean) => {
    // Se o usuário desistir no meio, remove o fator ainda não verificado para
    // não deixar lixo na conta.
    if (!nextOpen && factorId && step === 'verify') {
      try {
        await supabase.auth.mfa.unenroll({ factorId });
      } catch {
        /* melhor esforço */
      }
    }
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleEnroll = async () => {
    setIsWorking(true);
    try {
      // Remove fatores TOTP pendentes de tentativas anteriores
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.totp ?? []) {
        if (f.status !== 'verified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `EloLab ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error) throw error;

      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStep('verify');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao iniciar configuração do 2FA');
    } finally {
      setIsWorking(false);
    }
  };

  const handleVerify = async () => {
    if (!factorId) return;
    if (!/^\d{6}$/.test(token)) {
      toast.error('O código deve ter 6 dígitos');
      return;
    }

    setIsWorking(true);
    try {
      // challengeAndVerify valida o código NO SERVIDOR e eleva a sessão a AAL2
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: token });
      if (error) throw error;

      toast.success('Autenticação de dois fatores ativada!');
      await onMFASetupComplete();
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Código inválido. Tente novamente.');
      setToken('');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Autenticação de dois fatores</DialogTitle>
          <DialogDescription>
            {step === 'intro'
              ? 'Adicione uma segunda camada de proteção à sua conta.'
              : 'Escaneie o QR code no seu aplicativo autenticador e digite o código gerado.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'intro' && (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Você vai precisar de um app autenticador — Google Authenticator,
                Microsoft Authenticator, 1Password ou similar.
              </AlertDescription>
            </Alert>
            <Button onClick={handleEnroll} disabled={isWorking} className="w-full">
              {isWorking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gerar QR code
            </Button>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-4">
            {qrCode && (
              <div className="flex justify-center rounded-lg bg-white p-4">
                <img src={qrCode} alt="QR code para configurar o 2FA" className="h-48 w-48" />
              </div>
            )}

            {secret && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Não consegue escanear? Digite este código no app:
                </Label>
                <code className="block break-all rounded bg-muted p-2 text-xs">{secret}</code>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="mfa-token">Código de 6 dígitos</Label>
              <Input
                id="mfa-token"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={token}
                onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleVerify()}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'verify' && (
            <Button onClick={handleVerify} disabled={isWorking || token.length !== 6}>
              {isWorking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ativar 2FA
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
