import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import clinicBackground from '@/assets/clinic-background.jpg';

interface InvitationData {
  id?: string;
  email: string;
  roles: string[];
  funcionario_id?: string;
  clinica_nome?: string;
  source: 'new' | 'legacy';
  funcionario?: {
    nome: string;
    cargo: string | null;
  };
}

export default function AceitarConvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [telefone, setTelefone] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Token de convite inválido');
      setLoading(false);
      return;
    }

    const validateToken = async () => {
      try {
        // 1) Try the new edge function flow (convites_funcionario)
        const { data: newResp } = await supabase.functions.invoke('accept-invite', {
          body: { action: 'lookup', token },
        });
        if (newResp && (newResp as any).success && (newResp as any).invite) {
          const inv = (newResp as any).invite;
          setInvitation({
            source: 'new',
            email: inv.email,
            roles: inv.roles || [],
            clinica_nome: inv.clinica_nome,
            funcionario: inv.nome ? { nome: inv.nome, cargo: null } : undefined,
          });
          setLoading(false);
          return;
        }

        // 2) Legacy fallback (employee_invitations)
        const { data: result, error: rpcError } = await supabase.rpc(
          'validate_invitation_token' as any,
          { _token: token }
        );

        if (rpcError) throw rpcError;

        const parsed = result as any;

        if (!parsed || !parsed.success) {
          const errorMap: Record<string, string> = {
            not_found: 'Convite não encontrado ou já foi utilizado',
            already_used: 'Este convite já foi utilizado',
            expired: 'Este convite expirou',
          };
          setError(errorMap[parsed?.error] || 'Convite inválido');
          setLoading(false);
          return;
        }

        setInvitation({
          source: 'legacy',
          id: parsed.id,
          email: parsed.email,
          roles: parsed.roles,
          funcionario_id: parsed.funcionario_id,
          funcionario: parsed.funcionario_nome
            ? { nome: parsed.funcionario_nome, cargo: parsed.funcionario_cargo || null }
            : undefined,
        });
        setLoading(false);
      } catch (err: unknown) {
        if (import.meta.env.DEV) console.error('Error validating token:', err);
        setError('Erro ao validar convite');
        setLoading(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const minLen = invitation?.source === 'new' ? 8 : 6;
    if (password.length < minLen) {
      toast.error(`A senha deve ter pelo menos ${minLen} caracteres`);
      return;
    }

    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    if (!invitation) return;

    setSubmitting(true);

    try {
      if (invitation.source === 'new') {
        const { data, error } = await supabase.functions.invoke('accept-invite', {
          body: { action: 'accept', token, password, telefone: telefone || null },
        });
        if (error) throw error;
        if (data && (data as any).success === false) throw new Error((data as any).error);

        // Faz login automático
        await supabase.auth.signInWithPassword({ email: invitation.email, password });
        toast.success('Conta criada! Redirecionando...');
        navigate('/dashboard');
        return;
      }

      // 1. Create user account with invite_token so handle_new_user skips clinic creation
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: {
          emailRedirectTo: 'https://app.elolab.com.br/dashboard',
          data: {
            nome: invitation.funcionario?.nome || invitation.email,
            invite_token: token,
          },
        },
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error('Erro ao criar conta');
      }

      // 2. Accept invitation via SECURITY DEFINER function (handles roles, funcionario link, status update)
      const { data: acceptResult, error: acceptError } = await supabase.rpc(
        'accept_employee_invitation' as any,
        { _token: token, _user_id: authData.user.id }
      );

      if (acceptError) {
        if (import.meta.env.DEV) console.error('Error accepting invitation:', acceptError);
        throw new Error('Erro ao processar convite');
      }

      const result = acceptResult as any;
      if (result && !result.success) {
        throw new Error(result.error || 'Erro ao processar convite');
      }

      toast.success('Conta criada com sucesso! Verifique seu e-mail para confirmar.');
      navigate('/auth');
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('Error creating account:', err);
      toast.error(err.message || 'Erro ao criar conta');
    } finally {
      setSubmitting(false);
    }
  };

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    medico: 'Médico',
    recepcao: 'Recepção',
    enfermagem: 'Enfermagem',
    financeiro: 'Financeiro',
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          backgroundImage: `url(${clinicBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px]" />
        <Card className="relative z-10 w-full max-w-md bg-card/95 backdrop-blur-sm">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{
          backgroundImage: `url(${clinicBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px]" />
        <Card className="relative z-10 w-full max-w-md bg-card/95 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <XCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Convite Inválido</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => navigate('/auth')}>Ir para Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundImage: `url(${clinicBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px]" />
      <Card className="relative z-10 w-full max-w-md bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Bem-vindo(a) à Equipe!</CardTitle>
          <CardDescription>
            {invitation?.funcionario?.nome && (
              <span className="block text-foreground font-medium mt-1">
                {invitation.funcionario.nome}
              </span>
            )}
            {invitation?.clinica_nome && (
              <span className="block text-muted-foreground text-sm mt-1">
                Clínica: <strong>{invitation.clinica_nome}</strong>
              </span>
            )}
            Crie sua senha para acessar o sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={invitation?.email || ''}
                  disabled
                  className="pl-10 bg-muted"
                />
              </div>
            </div>

            {invitation?.roles && invitation.roles.length > 0 && (
              <div className="space-y-2">
                <Label>Suas permissões</Label>
                <div className="flex flex-wrap gap-2">
                  {invitation.roles.map(role => (
                    <span
                      key={role}
                      className="px-3 py-1 bg-primary/10 text-primary text-sm rounded-full"
                    >
                      {roleLabels[role] || role}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={invitation?.source === 'new' ? 'Mínimo 8 caracteres' : 'Mínimo 6 caracteres'}
                required
                minLength={invitation?.source === 'new' ? 8 : 6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Digite a senha novamente"
                required
              />
            </div>

            {invitation?.source === 'new' && (
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone (opcional)</Label>
                <Input
                  id="telefone"
                  type="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando conta...
                </>
              ) : (
                'Criar Conta e Acessar'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
