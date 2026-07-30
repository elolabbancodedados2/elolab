/**
 * Redefinição de senha — pedir o e-mail e definir a nova senha.
 *
 * Antes desta tela o recurso não existia: não havia chamada a
 * resetPasswordForEmail nem a updateUser em nenhum lugar do app. Quem esquecia
 * a senha não tinha saída — dependia de alguém mexer no banco.
 *
 * A mesma rota atende os dois momentos porque o link do e-mail volta para cá:
 *
 *   1. Sem sessão de recuperação  -> formulário de e-mail
 *   2. Com sessão de recuperação  -> formulário de nova senha
 *
 * O supabase-js lê o token do fragmento da URL sozinho e emite PASSWORD_RECOVERY.
 * Escutamos esse evento em vez de inspecionar a URL na mão, porque a leitura é
 * assíncrona: verificar `location.hash` na primeira renderização às vezes
 * acontece antes de o cliente ter processado o token.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, Lock, CheckCircle2, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { validatePassword, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';

type Etapa = 'pedir' | 'definir' | 'enviado';

export default function RedefinirSenha() {
  const navigate = useNavigate();
  const [etapa, setEtapa] = useState<Etapa>('pedir');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    // Se o usuário chegou pelo link do e-mail, o cliente cria uma sessão de
    // recuperação e dispara este evento.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setEtapa('definir');
    });

    // Recarregar a página perde o evento (ele só dispara uma vez), mas a sessão
    // permanece — então também aceitamos uma sessão já estabelecida.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setEtapa((atual) => (atual === 'pedir' ? 'definir' : atual));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const pedirEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setEnviando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setEnviando(false);

    if (error) {
      // Limite de envio do Supabase é o erro mais provável aqui, e a mensagem
      // crua ("email rate limit exceeded") não diz nada a quem está usando.
      const limite = /rate limit|too many/i.test(error.message);
      toast.error(
        limite
          ? 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.'
          : `Não foi possível enviar o e-mail: ${error.message}`
      );
      return;
    }

    // Sucesso sem confirmar se o e-mail existe: dizer "conta não encontrada"
    // revelaria quem tem cadastro no sistema.
    setEtapa('enviado');
  };

  const definirSenha = async (e: React.FormEvent) => {
    e.preventDefault();

    const problema = validatePassword(senha);
    if (problema) {
      toast.error(problema);
      return;
    }
    if (senha !== confirmacao) {
      toast.error('As duas senhas não são iguais.');
      return;
    }

    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setEnviando(false);

    if (error) {
      toast.error(`Não foi possível salvar a nova senha: ${error.message}`);
      return;
    }

    toast.success('Senha alterada. Entre com ela agora.');
    // Encerra a sessão de recuperação: ela serve só para trocar a senha.
    await supabase.auth.signOut();
    navigate('/auth', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {etapa === 'definir' ? 'Criar nova senha' : 'Redefinir senha'}
          </CardTitle>
          <CardDescription>
            {etapa === 'pedir' && 'Informe seu e-mail e enviaremos um link para criar uma nova senha.'}
            {etapa === 'enviado' && 'Verifique sua caixa de entrada.'}
            {etapa === 'definir' && 'Escolha uma senha que você ainda não usou em outro serviço.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {etapa === 'enviado' && (
            <>
              <Alert className="border-primary/20 bg-primary/5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <AlertDescription>
                  Se existir uma conta com <strong>{email}</strong>, o link chegou por e-mail.
                  Ele vale por uma hora. Confira também o lixo eletrônico.
                </AlertDescription>
              </Alert>
              <Button variant="outline" className="w-full" onClick={() => navigate('/auth')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para o login
              </Button>
            </>
          )}

          {etapa === 'pedir' && (
            <form onSubmit={pedirEmail} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="pl-10"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</>
                  : 'Enviar link'}
              </Button>
              <Link
                to="/auth"
                className="block text-center text-sm text-muted-foreground hover:text-foreground"
              >
                Voltar para o login
              </Link>
            </form>
          )}

          {etapa === 'definir' && (
            <form onSubmit={definirSenha} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="senha">Nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                  <Input
                    id="senha"
                    type={mostrarSenha ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="pl-10 pr-10"
                    placeholder="••••••••"
                    value={senha}
                    onChange={(ev) => setSenha(ev.target.value)}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setMostrarSenha(!mostrarSenha)}
                  >
                    {mostrarSenha
                      ? <EyeOff className="h-4 w-4 text-muted-foreground" />
                      : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Mínimo {PASSWORD_MIN_LENGTH} caracteres, com maiúscula, minúscula e número.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmacao">Repetir a nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                  <Input
                    id="confirmacao"
                    type={mostrarSenha ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="pl-10"
                    placeholder="••••••••"
                    value={confirmacao}
                    onChange={(ev) => setConfirmacao(ev.target.value)}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>
                  : 'Salvar nova senha'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
