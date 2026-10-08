import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, ShieldCheck, ShieldAlert, KeyRound, LogOut, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MFASetupDialog } from '@/components/MFASetupDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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
  const [loadError, setLoadError] = useState(false);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // O estado do 2FA vem do Supabase Auth, não mais da tabela profiles (onde o
  // segredo ficava em texto puro e a validação acontecia no navegador).
  const loadMfaStatus = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;

      const verified = (data?.totp ?? []).find(f => f.status === 'verified');
      setMfaStatus({
        enabled: !!verified,
        factorId: verified?.id ?? null,
        setupDate: verified?.created_at ?? null,
      });
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void loadMfaStatus();
  }, [user, loadMfaStatus]);

  const handleDisableMfa = async () => {
    if (!mfaStatus.factorId) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaStatus.factorId });
      if (error) throw error;

      toast.success('Autenticação 2FA desativada');
      setConfirmDisableOpen(false);
      await loadMfaStatus();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao desativar 2FA');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOutAll = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) throw error;
      setConfirmSignOutOpen(false);
      await signOut();
      toast.success('Todas as sessões encerradas');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao encerrar sessões');
    } finally {
      setIsSigningOut(false);
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
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : mfaStatus.enabled && !loadError ? (
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
            <Badge variant={loadError ? 'destructive' : mfaStatus.enabled ? 'default' : 'secondary'}>
              {isLoading ? 'Verificando…' : loadError ? 'Status indisponível' : mfaStatus.enabled ? 'Ativado' : 'Desativado'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                Não foi possível confirmar o estado do 2FA. Tente novamente antes de alterar esta proteção.
                <Button variant="outline" size="sm" onClick={() => void loadMfaStatus()} disabled={isLoading}>Tentar novamente</Button>
              </AlertDescription>
            </Alert>
          )}

          {!loadError && !mfaStatus.enabled && !isLoading && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Sua conta {profile?.role === 'admin' ? 'administrativa ' : ''}está protegida apenas por senha.
                Recomendamos fortemente ativar a autenticação 2FA.
              </AlertDescription>
            </Alert>
          )}

          {!isLoading && !loadError && mfaStatus.enabled && mfaStatus.setupDate && (
            <p className="text-sm text-muted-foreground">
              Ativado em: {format(new Date(mfaStatus.setupDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          )}

          <div className="flex gap-2 flex-wrap">
            {loadError ? null : !mfaStatus.enabled ? (
              <Button onClick={() => setIsSetupOpen(true)} disabled={isLoading || isSaving}>
                <KeyRound className="h-4 w-4 mr-2" />
                Ativar 2FA
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => setConfirmDisableOpen(true)}
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
            <Button variant="outline" onClick={() => setConfirmSignOutOpen(true)} disabled={isSigningOut}>
              {isSigningOut && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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

      <ConfirmDialog
        open={confirmDisableOpen}
        onOpenChange={(open) => { if (!isSaving) setConfirmDisableOpen(open); }}
        title="Desativar autenticação 2FA?"
        description="Sua conta ficará protegida somente pela senha. Você pode ativar o 2FA novamente a qualquer momento."
        confirmLabel="Desativar 2FA"
        variant="destructive"
        onConfirm={() => void handleDisableMfa()}
        isLoading={isSaving}
        closeOnConfirm={false}
      />
      <ConfirmDialog
        open={confirmSignOutOpen}
        onOpenChange={(open) => { if (!isSigningOut) setConfirmSignOutOpen(open); }}
        title="Encerrar todas as sessões?"
        description="Você sairá deste dispositivo e dos demais. Será necessário entrar novamente."
        confirmLabel="Encerrar sessões"
        variant="warning"
        onConfirm={() => void handleSignOutAll()}
        isLoading={isSigningOut}
        closeOnConfirm={false}
      />
    </div>
  );
}
