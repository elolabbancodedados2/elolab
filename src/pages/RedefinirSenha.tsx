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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, Lock, CheckCircle2, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import Logo from '@/components/landing-v2/Logo';
import { validatePassword, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';

type Etapa = 'pedir' | 'definir' | 'enviado';

export default function RedefinirSenha() {
  const navigate = useNavigate();
  const [etapa, setEtapa] = useState<Etapa>('pedir');
  const [verificandoSessao, setVerificandoSessao] = useState(true);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linkPossivelmenteExpirado, setLinkPossivelmenteExpirado] = useState(false);

  useEffect(() => {
    // Se o usuário chegou pelo link do e-mail, o cliente cria uma sessão de
    // recuperação e dispara este evento.
    let ativo = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setEtapa('definir');
        setVerificandoSessao(false);
      }
    });

    // Recarregar a página perde o evento (ele só dispara uma vez), mas a sessão
    // permanece — então também aceitamos uma sessão já estabelecida.
    void supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      if (data.session) setEtapa((atual) => (atual === 'pedir' ? 'definir' : atual));
      setVerificandoSessao(false);
    }).catch(() => {
      if (ativo) setVerificandoSessao(false);
    });

    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const pedirEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setErro(null);
    setLinkPossivelmenteExpirado(false);
    setEnviando(true);
    let error: unknown = null;
    try {
      ({ error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      }));
    } catch (err) {
      error = err;
    } finally {
      setEnviando(false);
    }

    if (error) {
      setErro('Não foi possível enviar o e-mail agora. Confira o endereço e tente novamente.');
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
      setLinkPossivelmenteExpirado(false);
      setErro(problema);
      return;
    }
    if (senha !== confirmacao) {
      setLinkPossivelmenteExpirado(false);
      setErro('As senhas estão diferentes. Confira os dois campos e tente novamente.');
      return;
    }

    setEnviando(true);
    setErro(null);
    setLinkPossivelmenteExpirado(false);
    let error: unknown = null;
    try {
      ({ error } = await supabase.auth.updateUser({ password: senha }));
    } catch (err) {
      error = err;
    } finally {
      setEnviando(false);
    }

    if (error) {
      setLinkPossivelmenteExpirado(true);
      setErro('Não foi possível salvar a nova senha. O link pode ter expirado; solicite outro e-mail e tente novamente.');
      return;
    }

    // Encerra a sessão de recuperação: ela serve só para trocar a senha.
    try {
      await supabase.auth.signOut();
    } catch {
      // A troca foi confirmada; uma falha ao encerrar a sessão não pode prender
      // a pessoa nesta tela nem fazer repetir a atualização da senha.
    }
    toast.success('Senha alterada. Entre com ela agora.');
    navigate('/auth', { replace: true });
  };

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="mx-auto flex min-h-[82px] w-full max-w-[1120px] items-center justify-between px-5 pt-[env(safe-area-inset-top)] sm:px-8">
        <Link to="/auth" aria-label="Voltar para o acesso EloLab" className="inline-flex min-h-11 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4">
          <Logo />
        </Link>
        <Link to="/auth" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:text-primary/80">Voltar ao login</Link>
      </header>

      <main className="mx-auto flex min-h-[calc(100svh-154px)] w-full max-w-[1120px] items-center justify-center px-4 py-8 sm:px-8">
        <section aria-labelledby="reset-title" className="w-full max-w-[480px] rounded-2xl border border-border bg-card px-6 py-7 shadow-sm sm:px-10 sm:py-9">
          {verificandoSessao ? (
            <div role="status" className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
              <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Verificando o link de recuperação…</p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 text-primary">
                  {etapa === 'enviado' ? <Mail className="h-5 w-5" aria-hidden="true" /> : <Lock className="h-5 w-5" aria-hidden="true" />}
                </div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Acesso à plataforma</p>
                <h1 id="reset-title" className="text-xl font-semibold tracking-tight text-foreground">
                  {etapa === 'definir' ? 'Criar nova senha' : etapa === 'enviado' ? 'Confira seu e-mail' : 'Redefinir senha'}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {etapa === 'pedir' && 'Informe o e-mail da sua conta. Enviaremos um link para criar uma nova senha.'}
                  {etapa === 'enviado' && 'Se este e-mail estiver cadastrado, o link chegará em até 5 minutos.'}
                  {etapa === 'definir' && 'Escolha uma senha que você ainda não usa em outro serviço.'}
                </p>
              </div>

              <div className="space-y-4">
                {erro && (
                  <Alert role="alert" variant="destructive" className="border-destructive/30">
                    <AlertDescription className="space-y-3">
                      <span>{erro}</span>
                      {linkPossivelmenteExpirado && etapa === 'definir' && (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 border-border bg-card text-foreground"
                          onClick={() => {
                            setSenha('');
                            setConfirmacao('');
                            setErro(null);
                            setEtapa('pedir');
                          }}
                        >
                          Solicitar novo link
                        </Button>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {etapa === 'enviado' && (
                  <>
                    <Alert role="status" className="border-primary/20 bg-primary/5">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <AlertDescription>Confira a caixa de entrada e a pasta de spam. Você pode solicitar outro link se necessário.</AlertDescription>
                    </Alert>
                    <Button variant="outline" className="h-11 w-full border-border bg-card text-primary hover:bg-muted" onClick={() => { setErro(null); setEtapa('pedir'); }}>
                      Não recebeu? Enviar de novo
                    </Button>
                    <Button variant="ghost" className="h-11 w-full" onClick={() => navigate('/auth')}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Voltar para o login
                    </Button>
                  </>
                )}

                {etapa === 'pedir' && (
                  <form onSubmit={pedirEmail} aria-busy={enviando} className="space-y-4">
                    <fieldset disabled={enviando} className="m-0 min-w-0 space-y-4 border-0 p-0">
                      <div className="space-y-2">
                        <Label htmlFor="email">E-mail</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                          <Input
                            id="email"
                            type="email"
                            autoComplete="email"
                            className="h-11 rounded-lg pl-10"
                            placeholder="seu@email.com"
                            value={email}
                    onChange={(ev) => { setErro(null); setLinkPossivelmenteExpirado(false); setEmail(ev.target.value); }}
                            required
                          />
                        </div>
                      </div>
                      <Button type="submit" className="h-11 w-full rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90" disabled={enviando}>
                        {enviando
                          ? <><Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />Enviando…</>
                          : 'Enviar link'}
                      </Button>
                      <Link to="/auth" className="inline-flex min-h-11 w-full items-center justify-center text-center text-sm text-muted-foreground hover:text-foreground">
                        Voltar para o login
                      </Link>
                    </fieldset>
                  </form>
                )}

                {etapa === 'definir' && (
                  <form onSubmit={definirSenha} aria-busy={enviando} className="space-y-4">
                    <fieldset disabled={enviando} className="m-0 min-w-0 space-y-4 border-0 p-0">
                      <div className="space-y-2">
                        <Label htmlFor="senha">Nova senha</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                          <Input
                            id="senha"
                            type={mostrarSenha ? 'text' : 'password'}
                            autoComplete="new-password"
                            className="h-11 rounded-lg pl-10 pr-10"
                            placeholder="••••••••"
                            value={senha}
                            onChange={(ev) => { setErro(null); setLinkPossivelmenteExpirado(false); setSenha(ev.target.value); }}
                            required
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                            onClick={() => setMostrarSenha(!mostrarSenha)}
                          >
                            {mostrarSenha
                              ? <EyeOff className="h-4 w-4 text-muted-foreground" />
                              : <Eye className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">Use {PASSWORD_MIN_LENGTH} caracteres ou mais, com letra maiúscula, minúscula e número.</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="confirmacao">Repetir a nova senha</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                          <Input
                            id="confirmacao"
                            type={mostrarSenha ? 'text' : 'password'}
                            autoComplete="new-password"
                            className="h-11 rounded-lg pl-10"
                            placeholder="••••••••"
                            value={confirmacao}
                            onChange={(ev) => { setErro(null); setLinkPossivelmenteExpirado(false); setConfirmacao(ev.target.value); }}
                            required
                          />
                        </div>
                      </div>

                      <Button type="submit" className="h-11 w-full rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90" disabled={enviando}>
                        {enviando
                          ? <><Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />Salvando…</>
                          : 'Salvar nova senha'}
                      </Button>
                    </fieldset>
                  </form>
                )}
              </div>
            </>
          )}
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-[1120px] items-center justify-center px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-xs text-muted-foreground sm:justify-between sm:px-8">
        <span className="hidden sm:inline">Acesso protegido para sua clínica</span>
        <span>© {new Date().getFullYear()} EloLab</span>
      </footer>
    </div>
  );
}
