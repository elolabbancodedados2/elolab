import { useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fatorTotpVerificado, reautenticar } from '@/lib/reautenticacao';

interface ReauthDialogProps {
  open: boolean;
  email: string;
  title: string;
  description: string;
  onOpenChange: (open: boolean) => void;
  /** Executada só depois que a identidade foi confirmada pelo Supabase Auth. */
  onConfirmed: () => Promise<void> | void;
}

export function ReauthDialog({ open, email, title, description, onOpenChange, onConfirmed }: ReauthDialogProps) {
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined);
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [busy, setBusy] = useState(false);

  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) { setSenha(''); setCodigo(''); setFactorId(undefined); return; }
    let ativo = true;
    fatorTotpVerificado()
      .then((id) => { if (ativo) setFactorId(id); })
      .catch(() => { if (ativo) { toast.error('Não foi possível verificar o 2FA da conta.'); onOpenChangeRef.current(false); } });
    return () => { ativo = false; };
  }, [open]);

  const confirmar = async () => {
    if (busy || factorId === undefined) return;
    setBusy(true);
    try {
      await reautenticar({ email, factorId, codigo, senha });
      await onConfirmed();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível confirmar sua identidade.');
      setCodigo('');
      setSenha('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#1080CA]" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {factorId === undefined ? (
          <p role="status" className="text-sm text-muted-foreground">Verificando proteção da conta…</p>
        ) : factorId ? (
          <div className="space-y-2">
            <Label htmlFor="reauth-codigo">Código do autenticador</Label>
            <Input id="reauth-codigo" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} placeholder="000000"
              value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && void confirmar()} />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="reauth-senha">Senha atual</Label>
            <Input id="reauth-senha" type="password" autoComplete="current-password" autoFocus
              value={senha} onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void confirmar()} />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={() => void confirmar()} disabled={busy || factorId === undefined || (factorId ? codigo.length !== 6 : !senha)}
            className="rounded-full bg-gradient-primary text-white">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar identidade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
