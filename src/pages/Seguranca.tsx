import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, ShieldCheck, ShieldAlert, KeyRound, LogOut, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MFASetupDialog } from '@/components/MFASetupDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MfaStatus {
  enabled: boolean;
  factorId: string | null;
  setupDate: string | null;
}

export default function Seguranca() {
  const { user, profile, signOut } = useSupabaseAuth();
  const [mfaStatus, setMfaStatus] = useState<MfaStatus>({
    enabled: false,
    factorId: null,
    setupDate: null,
  });
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadMfaStatus();
  }, [user]);

  // O estado do 2FA vem do Supabase Auth, não mais da tabela profiles (onde o
  // segredo ficava em texto puro e a validação acontecia no navegador).
  const loadMfaStatus = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;

      const verified = (data?.totp ?? []).find(f => f.status === 'verified');
      setMfaStatus({
        enabled: !!verified,
        factorId: verified?.id ?? null,
        setupDate: verified?.created_at ?? null,
      });
    } catch (err) {
      console.error('Erro ao carregar status MFA:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!mfaStatus.factorId) return;
    if (!confirm('Tem certeza que deseja desativar a autenticação 2FA? Sua conta ficará menos protegida.')) {
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaStatus.factorId });
      if (error) throw error;

      toast.success('Autenticação 2FA desativada');
      await loadMfaStatus();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao desativar 2FA');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOutAll = async () => {
    if (!confirm('Encerrar todas as sessões? Você precisará entrar novamente neste e em outros dispositivos.')) {
      return;
    }
    try {
      await supabase.auth.signOut({ scope: 'global' });
      await signOut();
      toast.success('Todas as sessões encerradas');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao encerrar sessões');
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6 p-2 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-7 w-7 text-primary" />
          Segurança da Conta
        </h1>
        <p className="text-muted-foreground mt-1">
          Gerencie autenticação, sessões e proteção da sua conta
        </p>
      </div>

      {/* MFA Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                {mfaStatus.enabled ? (
                  <ShieldCheck className="h-5 w-5 text-green-600" />
                ) : (
                  <ShieldAlert className="h-5 w-5 text-amber-600" />
                )}
                Autenticação em Dois Fatores (2FA)
              </CardTitle>
              <CardDescription className="mt-1">
                Adicione uma camada extra de segurança usando um app authenticator
              </CardDescription>
            </div>
            <Badge variant={mfaStatus.enabled ? 'default' : 'secondary'}>
              {mfaStatus.enabled ? 'Ativado' : 'Desativado'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!mfaStatus.enabled && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Sua conta {profile?.role === 'admin' ? 'administrativa ' : ''}está protegida apenas por senha.
                Recomendamos fortemente ativar a autenticação 2FA.
              </AlertDescription>
            </Alert>
          )}

          {mfaStatus.enabled && mfaStatus.setupDate && (
            <p className="text-sm text-muted-foreground">
              Ativado em: {format(new Date(mfaStatus.setupDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          )}

          <div className="flex gap-2 flex-wrap">
            {!mfaStatus.enabled ? (
              <Button onClick={() => setIsSetupOpen(true)} disabled={isLoading}>
                <KeyRound className="h-4 w-4 mr-2" />
                Ativar 2FA
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleDisableMfa}
                disabled={isSaving}
              >
                Desativar 2FA
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5" />
            Sessões Ativas
          </CardTitle>
          <CardDescription>
            Encerre todas as sessões em outros dispositivos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Email da conta: <strong>{user.email}</strong>
            </div>
            <Button variant="outline" onClick={handleSignOutAll}>
              <LogOut className="h-4 w-4 mr-2" />
              Encerrar todas as sessões
            </Button>
          </div>
        </CardContent>
      </Card>

      <MFASetupDialog
        open={isSetupOpen}
        onOpenChange={setIsSetupOpen}
        onMFASetupComplete={loadMfaStatus}
      />
    </div>
  );
}
