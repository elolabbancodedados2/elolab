import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, ShieldCheck, ShieldAlert, KeyRound, LogOut, AlertTriangle, Loader2, History, SlidersHorizontal, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MFASetupDialog } from '@/components/MFASetupDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ReauthDialog } from '@/components/ReauthDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { friendlyErrorMessage } from '@/components/ErrorState';

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

  // Chamado pelo ReauthDialog só depois do TOTP recente (sessão AAL2); erros voltam ao diálogo.
  const handleDisableMfa = async () => {
    if (!mfaStatus.factorId) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaStatus.factorId });
      if (error) throw error;
      toast.success('Autenticação 2FA desativada');
      await loadMfaStatus();
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
      toast.error(friendlyErrorMessage(err, 'Não foi possível encerrar as sessões.'));
    } finally {
      setIsSigningOut(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6 p-2 sm:p-6">
      <PageHeader
        title="Segurança da Conta"
        icon={<Shield />}
        description={
          <>
            Gerencie autenticação, sessões e proteção da sua conta
            {!isLoading && !loadError && <> · 2FA {mfaStatus.enabled ? 'ativado' : 'desativado'}</>}
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" className="rounded-full gap-2">
              <Link to="/meu-historico"><History className="h-4 w-4" />Meu histórico</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full gap-2">
              <Link to="/preferencias"><SlidersHorizontal className="h-4 w-4" />Preferências</Link>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              aria-label="Atualizar status de segurança"
              onClick={() => void loadMfaStatus()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </>
        }
      />

      {/* MFA Card */}
      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : mfaStatus.enabled && !loadError ? (
                  <ShieldCheck className="h-5 w-5 text-success" />
                ) : (
                  <ShieldAlert className="h-5 w-5 text-warning" />
                )}
                Autenticação em Dois Fatores (2FA)
              </CardTitle>
              <CardDescription className="mt-1">
                Adicione uma camada extra de segurança usando um app authenticator
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className={`shrink-0 rounded-full ${loadError ? 'border-destructive/40 bg-destructive/10 text-destructive' : mfaStatus.enabled ? 'border-success/40 bg-success/10 text-success' : 'border-warning/40 bg-warning/10 text-warning'}`}
            >
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
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => void loadMfaStatus()} disabled={isLoading}>Tentar novamente</Button>
              </AlertDescription>
            </Alert>
          )}

          {!loadError && !mfaStatus.enabled && !isLoading && (
            <Alert className="rounded-xl border-warning/40 bg-warning/5">
              <AlertTriangle className="h-4 w-4 text-warning" />
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
              <Button
                className="gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110"
                onClick={() => setIsSetupOpen(true)}
                disabled={isLoading || isSaving}
              >
                <KeyRound className="h-4 w-4" />
                Ativar 2FA
              </Button>
            ) : (
              <Button
                variant="outline"
                className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-[#1080CA]" />
            Sessões Ativas
          </CardTitle>
          <CardDescription>
            Encerre todas as sessões em outros dispositivos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="rounded-xl border border-[#DCE6F2] bg-[#F3F8FC] px-4 py-3 text-sm text-muted-foreground break-all">
              Email da conta: <strong className="text-foreground">{user.email}</strong>
            </div>
            <Button variant="outline" className="rounded-full gap-2" onClick={() => setConfirmSignOutOpen(true)} disabled={isSigningOut}>
              {isSigningOut && <Loader2 className="h-4 w-4 animate-spin" />}
              <LogOut className="h-4 w-4" />
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

      <ReauthDialog
        open={confirmDisableOpen}
        email={user.email ?? ''}
        onOpenChange={setConfirmDisableOpen}
        title="Desativar autenticação 2FA?"
        description="Sua conta ficará protegida somente pela senha. Para confirmar, digite o código atual do seu autenticador."
        onConfirmed={handleDisableMfa}
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
