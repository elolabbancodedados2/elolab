import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Lock, LockOpen, KeyRound, Mail, MailCheck, Trash2, Copy, ShieldAlert,
  Clock, Building2, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  chamarAdminContas, gerarSenhaTemporaria, type PreviaDaConta,
} from '@/lib/adminContas';

interface Props {
  usuario: { id: string; nome: string; email: string } | null;
  onFechar: () => void;
  /** Chamado depois de qualquer ação que mudou algo, para recarregar a lista. */
  onMudou: () => void;
}

export function FerramentasDeConta({ usuario, onFechar, onMudou }: Props) {
  const [previa, setPrevia] = useState<PreviaDaConta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [executando, setExecutando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacaoExclusao, setConfirmacaoExclusao] = useState('');

  const carregarPrevia = useCallback(async () => {
    if (!usuario) return;
    setCarregando(true);
    try {
      const r = await chamarAdminContas<{ previa: PreviaDaConta }>({
        acao: 'previa', alvo_id: usuario.id,
      });
      setPrevia(r.previa);
    } catch (e) {
      toast.error('Não foi possível ler a conta.', {
        description: e instanceof Error ? e.message : String(e),
      });
      setPrevia(null);
    } finally {
      setCarregando(false);
    }
  }, [usuario]);

  useEffect(() => {
    if (usuario) {
      setMotivo('');
      setSenha('');
      setConfirmacaoExclusao('');
      carregarPrevia();
    }
  }, [usuario, carregarPrevia]);

  const executar = async (
    acao: Parameters<typeof chamarAdminContas>[0]['acao'],
    extra: Record<string, string> = {},
    mensagemDeSucesso: string,
    fecharDepois = false,
  ) => {
    if (!usuario) return;
    setExecutando(acao);
    try {
      await chamarAdminContas({
        acao, alvo_id: usuario.id, motivo: motivo || undefined, ...extra,
      });
      toast.success(mensagemDeSucesso);
      onMudou();
      if (fecharDepois) onFechar();
      else await carregarPrevia();
    } catch (e) {
      toast.error('Não deu certo.', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setExecutando(null);
    }
  };

  const ocupado = executando !== null || carregando;

  if (!usuario) return null;

  const podeApagar = previa && previa.impedimentos.length === 0;
  const exclusaoConfirmada =
    confirmacaoExclusao.trim().toLowerCase() === usuario.email.toLowerCase();

  return (
    <Dialog open={!!usuario} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Ferramentas de conta
          </DialogTitle>
          <DialogDescription>
            {usuario.nome} — {usuario.email}
          </DialogDescription>
        </DialogHeader>

        {carregando && !previa ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !previa ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Não foi possível carregar os dados desta conta.
          </p>
        ) : (
          <div className="space-y-5">
            {/* ─── Situação ─── */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant={previa.bloqueado ? 'destructive' : 'secondary'}>
                  {previa.bloqueado ? 'Bloqueada' : 'Acesso liberado'}
                </Badge>
                <Badge variant={previa.email_confirmado ? 'secondary' : 'outline'}>
                  {previa.email_confirmado ? 'E-mail confirmado' : 'E-mail não confirmado'}
                </Badge>
                {previa.papeis.map((p) => (
                  <Badge key={p} variant="outline">{p}</Badge>
                ))}
                {previa.papeis.length === 0 && (
                  <Badge variant="outline" className="text-muted-foreground">sem função</Badge>
                )}
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  {previa.ultimo_login
                    ? `Último acesso em ${new Date(previa.ultimo_login).toLocaleDateString('pt-BR')}`
                    : 'Nunca acessou'}
                </p>
                {previa.dono_da_clinica && (
                  <p className="flex items-center gap-1.5">
                    <Building2 className="h-3 w-3" />
                    Dona da clínica &ldquo;{previa.dono_da_clinica}&rdquo; — {previa.pacientes} paciente(s),{' '}
                    {previa.agendamentos} agendamento(s)
                  </p>
                )}
              </div>
            </div>

            {/* ─── Motivo ─── */}
            <div className="space-y-1.5">
              <Label htmlFor="motivo" className="text-xs">
                Motivo <span className="text-muted-foreground">(fica registrado)</span>
              </Label>
              <Input
                id="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: cliente pediu por telefone, conta comprometida..."
                maxLength={500}
              />
            </div>

            <Separator />

            {/* ─── Acesso ─── */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Acesso</h3>
              {previa.bloqueado ? (
                <Button
                  variant="outline" size="sm" disabled={ocupado}
                  onClick={() => executar('desbloquear', {}, 'Conta desbloqueada. A pessoa já pode entrar.')}
                >
                  <LockOpen className="h-4 w-4 mr-2" />
                  {executando === 'desbloquear' ? 'Desbloqueando...' : 'Desbloquear'}
                </Button>
              ) : (
                <Button
                  variant="outline" size="sm" disabled={ocupado}
                  onClick={() => executar('bloquear', {}, 'Conta bloqueada e sessões encerradas.')}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  {executando === 'bloquear' ? 'Bloqueando...' : 'Bloquear acesso'}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                O bloqueio impede novos logins e derruba as sessões abertas. Quem estiver com a tela
                aberta neste instante pode continuar por até 1 hora, até o token expirar — para cortar
                na hora, troque a senha também.
              </p>
            </section>

            <Separator />

            {/* ─── Senha ─── */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Senha</h3>

              <div>
                <Button
                  variant="outline" size="sm" disabled={ocupado}
                  onClick={() => executar('enviar_reset', {}, `Link de redefinição enviado para ${usuario.email}.`)}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {executando === 'enviar_reset' ? 'Enviando...' : 'Enviar link por e-mail'}
                </Button>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Caminho preferido: a pessoa escolhe a própria senha e você nunca fica sabendo dela.
                </p>
              </div>

              <div className="rounded-lg border border-dashed p-3 space-y-2">
                <Label htmlFor="senha" className="text-xs">Ou defina uma senha agora</Label>
                <div className="flex gap-2">
                  <Input
                    id="senha" value={senha} onChange={(e) => setSenha(e.target.value)}
                    placeholder="mínimo 10 caracteres" className="font-mono text-sm"
                  />
                  <Button
                    type="button" variant="secondary" size="sm"
                    onClick={() => setSenha(gerarSenhaTemporaria())}
                  >
                    Gerar
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon" disabled={!senha}
                    onClick={async () => {
                      // A área de transferência falha em contexto não seguro e
                      // quando o navegador nega a permissão. Anunciar "copiada"
                      // sem conferir faria a senha ser trocada e perdida junto.
                      try {
                        await navigator.clipboard.writeText(senha);
                        toast.success('Senha copiada.');
                      } catch {
                        toast.error('O navegador não deixou copiar.', {
                          description: 'Selecione a senha no campo e copie à mão antes de trocar.',
                        });
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="outline" size="sm" disabled={ocupado || senha.length < 10}
                  onClick={() =>
                    executar('trocar_senha', { senha }, 'Senha trocada. As sessões da pessoa foram encerradas.')
                  }
                >
                  <KeyRound className="h-4 w-4 mr-2" />
                  {executando === 'trocar_senha' ? 'Trocando...' : 'Trocar senha'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Copie antes de confirmar — ela não aparece de novo, e não fica guardada em lugar nenhum.
                </p>
              </div>

              {!previa.email_confirmado && (
                <div>
                  <Button
                    variant="outline" size="sm" disabled={ocupado}
                    onClick={() => executar('confirmar_email', {}, 'E-mail confirmado.')}
                  >
                    <MailCheck className="h-4 w-4 mr-2" />
                    {executando === 'confirmar_email' ? 'Confirmando...' : 'Confirmar e-mail manualmente'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Use quando o e-mail de confirmação não chegou. Confirma sem que a pessoa tenha
                    provado que é dona do endereço.
                  </p>
                </div>
              )}
            </section>

            <Separator />

            {/* ─── Exclusão ─── */}
            <section className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <h3 className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                Apagar a conta
              </h3>

              {previa.impedimentos.length > 0 ? (
                <div className="text-xs space-y-1">
                  <p className="font-medium">Esta conta não pode ser apagada:</p>
                  <ul className="list-disc pl-4 text-muted-foreground">
                    {previa.impedimentos.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                  <p className="text-muted-foreground pt-1">
                    Bloquear resolve o mesmo problema sem destruir o histórico clínico, que a clínica é
                    obrigada a guardar.
                  </p>
                </div>
              ) : (
                <>
                  {previa.some_junto.length > 0 && (
                    <div className="text-xs space-y-1">
                      <p className="font-medium">Some junto, sem volta:</p>
                      <ul className="list-disc pl-4 text-muted-foreground">
                        {previa.some_junto.map((m) => <li key={m}>{m}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="confirmacao" className="text-xs">
                      Digite <span className="font-mono font-semibold">{usuario.email}</span> para confirmar
                    </Label>
                    <Input
                      id="confirmacao" value={confirmacaoExclusao}
                      onChange={(e) => setConfirmacaoExclusao(e.target.value)}
                      // Vermelho só quando o que foi digitado NÃO confere. Marcar
                      // o acerto de vermelho fazia o campo parecer recusado
                      // justamente quando estava certo.
                      className={cn(
                        'font-mono text-sm',
                        confirmacaoExclusao && !exclusaoConfirmada && 'border-destructive',
                      )}
                      autoComplete="off"
                    />
                  </div>
                  <Button
                    variant="destructive" size="sm"
                    disabled={ocupado || !podeApagar || !exclusaoConfirmada}
                    onClick={() =>
                      executar(
                        'apagar',
                        { confirmacao: confirmacaoExclusao },
                        'Conta apagada.',
                        true,
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {executando === 'apagar' ? 'Apagando...' : 'Apagar definitivamente'}
                  </Button>
                </>
              )}
            </section>

            <p className="text-xs text-muted-foreground text-center">
              Tudo o que você fizer aqui fica registrado com data, hora e IP na aba Auditoria.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
