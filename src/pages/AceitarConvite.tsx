import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { validatePassword, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';
import clinicBackground from '@/assets/clinic-background.jpg';
import Logo from '@/components/landing-v2/Logo';

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
  const [existingAccount, setExistingAccount] = useState(false);
  const [currentAccountMatches, setCurrentAccountMatches] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Este link está incompleto. Peça um novo convite ao administrador da clínica.');
      setLoading(false);
      return;
    }

    const validateToken = async () => {
      try {
        // 1) Try the new edge function flow (convites_funcionario)
        const { data: newResp, error: newError } = await supabase.functions.invoke('accept-invite', {
          body: { action: 'lookup', token },
        });
        if (newResp && (newResp as any).success && (newResp as any).invite) {
          const inv = (newResp as any).invite;
          let matchingAccount = false;
          try {
            const { data: sessionData } = await supabase.auth.getUser();
            const signedInEmail = sessionData.user?.email?.trim().toLowerCase();
            const invitationEmail = String(inv.email || '').trim().toLowerCase();
            matchingAccount = !!signedInEmail && signedInEmail === invitationEmail;
          } catch {
            // A falha em detectar a sessão não deve invalidar um convite válido.
          }
          setInvitation({
            source: 'new',
            email: inv.email,
            roles: inv.roles || [],
            clinica_nome: inv.clinica_nome,
            funcionario: inv.nome ? { nome: inv.nome, cargo: null } : undefined,
          });
          setExistingAccount(matchingAccount);
          setCurrentAccountMatches(matchingAccount);
          setLoading(false);
          return;
        }

        // A função nova usa 410 para links expirados/utilizados. Mostra a
        // resposta específica em vez de tentar validá-los no fluxo legado.
        const response = (newError as { context?: unknown } | null)?.context;
        if (response instanceof Response && response.status === 410) {
          const body = await response.clone().json().catch(() => null);
          const expired = /expir|expired/i.test(String(body?.error || ''));
          setError(expired
            ? 'Este convite expirou. Peça um novo link ao administrador da clínica.'
            : 'Este convite já foi usado ou expirou. Peça um novo link ao administrador da clínica.');
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
            not_found: 'Este convite não foi encontrado ou já foi usado. Peça um novo link ao administrador da clínica.',
            already_used: 'Este convite já foi usado. Se ainda precisar de acesso, peça outro ao administrador da clínica.',
            expired: 'Este convite expirou. Peça um novo link ao administrador da clínica.',
          };
          setError(errorMap[parsed?.error] || 'Este convite não é válido. Peça um novo link ao administrador da clínica.');
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
        // "Erro ao validar convite" não dizia se o link expirou, se já foi
        // usado ou se a internet caiu — e quem recebe o convite não tem como
        // descobrir sozinho.
        setError('Não foi possível verificar este convite. Confira sua conexão ou peça um novo link ao administrador da clínica.');
        setLoading(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Mesma política do cadastro. Um convite pode conceder o papel `admin`, então
    // não faz sentido a conta mais poderosa da clínica aceitar a senha mais fraca.
    if (!existingAccount) {
      const erroSenha = validatePassword(password);
      if (erroSenha) {
        toast.error(erroSenha);
        return;
      }

      if (password !== confirmPassword) {
        toast.error('As senhas não coincidem');
        return;
      }
    }

    if (!invitation) return;

    setSubmitting(true);

    try {
      if (invitation.source === 'new') {
        if (existingAccount) {
          const { data: sessionData } = await supabase.auth.getUser();
          const currentUser = sessionData.user;
          let authenticatedEmail = currentUser?.email?.toLowerCase();

          if (authenticatedEmail !== invitation.email.toLowerCase()) {
            const { data: login, error: loginError } = await supabase.auth.signInWithPassword({
              email: invitation.email,
              password,
            });
            if (loginError) {
              throw new Error('Senha incorreta. Use a senha atual da sua conta para aceitar o convite.');
            }
            authenticatedEmail = login.user.email?.toLowerCase();
          }

          if (authenticatedEmail !== invitation.email.toLowerCase()) {
            throw new Error('Entre com a conta do e-mail que recebeu o convite.');
          }

          const { data, error } = await supabase.functions.invoke('accept-invite', {
            body: { action: 'accept_authenticated', token },
          });
          if (error) throw error;
          if (!data?.success) throw new Error(data?.error || 'Não foi possível aceitar o convite.');

          toast.success('Convite aceito! Redirecionando...');
          navigate('/dashboard');
          return;
        }

        const { data, error } = await supabase.functions.invoke('accept-invite', {
          body: { action: 'accept', token, password, telefone: telefone || null },
        });
        if (error) throw error;
        if (data?.code === 'account_exists') {
          setExistingAccount(true);
          setCurrentAccountMatches(false);
          setPassword('');
          setConfirmPassword('');
          toast.info('Este e-mail já possui uma conta. Digite a senha atual para aceitar o convite.');
          return;
        }
        if (!data?.success) throw new Error(data?.error || 'Não foi possível criar sua conta.');

        // Faz login automático
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: invitation.email,
          password,
        });
        if (signInError) throw signInError;
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

      // Quem já tem conta não pode ficar preso aqui. Acontece com quem se
      // cadastrou antes de abrir o convite — e aconteceu com todo mundo
      // enquanto accept_employee_invitation estava ambígua e o aceite falhava
      // depois da conta já ter sido criada. Nesses casos entramos com a senha
      // informada e seguimos para o aceite, que é o passo que faltava.
      let usuario = authData?.user ?? null;

      if (authError) {
        const jaExiste = /already registered|already been registered|user already exists/i
          .test(authError.message);
        if (!jaExiste) throw authError;

        const { data: login, error: erroLogin } = await supabase.auth.signInWithPassword({
          email: invitation.email,
          password,
        });
        if (erroLogin) {
          throw new Error(
            'Você já tem conta com este e-mail. Digite a senha dela para concluir o convite, ' +
            'ou use "Esqueci minha senha" na tela de login.'
          );
        }
        usuario = login.user;
      }

      if (!usuario) {
        throw new Error('Erro ao criar conta');
      }

      // 2. Accept invitation via SECURITY DEFINER function (handles roles, funcionario link, status update)
      const { data: acceptResult, error: acceptError } = await supabase.rpc(
        'accept_employee_invitation' as any,
        { _token: token, _user_id: usuario.id }
      );

      if (acceptError) {
        if (import.meta.env.DEV) console.error('Error accepting invitation:', acceptError);
        throw new Error('Erro ao processar convite');
      }

      const result = acceptResult as any;
      if (result && !result.success) {
        throw new Error(result.error || 'Erro ao processar convite');
      }

      toast.success('Convite aceito! Entre com seu e-mail e senha.');
      navigate('/auth');
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('Error creating account:', err);
      const message = String(err?.message || '').toLowerCase();
      if (message.includes('senha')) {
        toast.error('Senha incorreta. Confira e tente de novo.');
      } else if (message.includes('conta do e-mail')) {
        toast.error('Entre com a conta do e-mail que recebeu o convite.');
      } else {
        toast.error('Não foi possível aceitar o convite. Tente novamente ou peça ajuda ao administrador da clínica.');
      }
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
        className="min-h-screen flex flex-col items-center justify-center p-4"
        style={{
          backgroundImage: `url(${clinicBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#F3F8FC]/95 to-white/90 backdrop-blur-[2px]" />
        <Logo className="relative z-10 mb-6" />
        <Card className="relative z-10 w-full max-w-md rounded-2xl border-[#DCE6F2] bg-card/95 shadow-[0_8px_24px_rgba(16,128,202,0.10)] backdrop-blur-sm">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Verificando convite" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-4"
        style={{
          backgroundImage: `url(${clinicBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#F3F8FC]/95 to-white/90 backdrop-blur-[2px]" />
        <Logo className="relative z-10 mb-6" />
        <Card className="relative z-10 w-full max-w-md rounded-2xl border-[#DCE6F2] bg-card/95 shadow-[0_8px_24px_rgba(16,128,202,0.10)] backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <XCircle className="h-8 w-8" aria-hidden="true" />
            </span>
            <h2 className="text-xl font-semibold mb-2">Não foi possível abrir o convite</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button className="h-11 rounded-full bg-gradient-primary px-6 text-white shadow-md hover:brightness-110" onClick={() => navigate('/auth')}>Ir para o login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        backgroundImage: `url(${clinicBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#F3F8FC]/95 to-white/90 backdrop-blur-[2px]" />
      <Logo className="relative z-10 mb-6" />
      <Card className="relative z-10 w-full max-w-md rounded-2xl border-[#DCE6F2] bg-card/95 shadow-[0_8px_24px_rgba(16,128,202,0.10)] backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
            <CheckCircle className="h-7 w-7" aria-hidden="true" />
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
            {existingAccount
              ? currentAccountMatches
                ? 'Esta conta já está conectada. Aceite o convite para adicionar os acessos à sua conta.'
                : 'Entre com sua senha atual para aceitar o convite'
              : 'Crie uma senha para entrar na clínica.'}
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
                  className="h-11 rounded-xl bg-[#F3F8FC] pl-10"
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
                      className="rounded-full border border-border bg-[#F3F8FC] px-3 py-1 text-sm text-primary"
                    >
                      {roleLabels[role] || role}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {!currentAccountMatches && <div className="space-y-2">
              <Label htmlFor="password">{existingAccount ? 'Senha atual' : 'Senha'}</Label>
              <Input
                id="password"
                className="h-11 rounded-xl"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={existingAccount ? 'Digite a senha da sua conta' : `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
                required
                minLength={existingAccount ? undefined : invitation?.source === 'new' ? 8 : 6}
              />
              {!existingAccount && (<p className="text-xs text-muted-foreground">Mínimo {PASSWORD_MIN_LENGTH} caracteres, com maiúscula, minúscula e número.</p>)}
            </div>}

            {!existingAccount && <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <Input
                id="confirmPassword"
                className="h-11 rounded-xl"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Digite a senha novamente"
                required
              />
            </div>}

            {invitation?.source === 'new' && !existingAccount && (
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone (opcional)</Label>
                <Input
                  id="telefone"
                  className="h-11 rounded-xl"
                  type="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </div>
            )}

            <Button type="submit" className="h-11 w-full rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {existingAccount ? 'Aceitando convite...' : 'Criando conta...'}
                </>
              ) : (
                currentAccountMatches ? 'Aceitar convite com esta conta' : existingAccount ? 'Entrar e Aceitar Convite' : 'Criar Conta e Acessar'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
