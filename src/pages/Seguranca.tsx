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
  setupDate: string | null;
  remainingBackupCodes: number;
}

export default function Seguranca() {
  const { user, profile, signOut } = useSupabaseAuth();
  const [mfaStatus, setMfaStatus] = useState<MfaStatus>({
    enabled: false,
    setupDate: null,
    remainingBackupCodes: 0,
  });
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadMfaStatus();
  }, [user]);

  const loadMfaStatus = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('mfa_enabled, mfa_backup_codes, mfa_setup_date')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        const codes = data.mfa_backup_codes ? JSON.parse(data.mfa_backup_codes) : [];
        setMfaStatus({
          enabled: !!data.mfa_enabled,
          setupDate: data.mfa_setup_date ?? null,
          remainingBackupCodes: Array.isArray(codes) ? codes.length : 0,
        });
      }
    } catch (err) {
      console.error('Erro ao carregar status MFA:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnableMfa = async (secret: string, backupCodes: string[]) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          mfa_enabled: true,
          mfa_secret: secret,
          mfa_backup_codes: JSON.stringify(backupCodes),
          mfa_setup_date: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Autenticação 2FA ativada com sucesso!');
      await loadMfaStatus();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao ativar 2FA');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!user) return;
    if (!confirm('Tem certeza que deseja desativar a autenticação 2FA? Sua conta ficará menos protegida.')) {
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          mfa_enabled: false,
          mfa_secret: null,
          mfa_backup_codes: null,
          mfa_setup_date: null,
        })
        .eq('id', user.id);

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

          {mfaStatus.enabled && (
            <div className="text-sm space-y-1">
              {mfaStatus.setupDate && (
                <p className="text-muted-foreground">
                  Ativado em: {format(new Date(mfaStatus.setupDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              )}
              <p className="text-muted-foreground">
                Códigos de backup restantes: <strong>{mfaStatus.remainingBackupCodes}</strong>
              </p>
              {mfaStatus.remainingBackupCodes <= 3 && mfaStatus.remainingBackupCodes > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Poucos códigos de backup restantes. Reconfigure o 2FA para gerar novos códigos.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {!mfaStatus.enabled ? (
              <Button onClick={() => setIsSetupOpen(true)} disabled={isLoading}>
                <KeyRound className="h-4 w-4 mr-2" />
                Ativar 2FA
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setIsSetupOpen(true)}
                  disabled={isSaving}
                >
                  <KeyRound className="h-4 w-4 mr-2" />
                  Reconfigurar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDisableMfa}
                  disabled={isSaving}
                >
                  Desativar 2FA
                </Button>
              </>
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
        userEmail={user.email || ''}
        onMFASetupComplete={handleEnableMfa}
        isLoading={isSaving}
      />
    </div>
  );
}
