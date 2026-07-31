import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Copy, Mail, RefreshCw, CheckCircle2, Clock, XCircle, Loader2, Ban, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro, detalheTecnico } from '@/lib/erros';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EmptyState } from '@/components/EmptyState';

type InviteStatus = 'aceito' | 'expirado' | 'pendente';

interface Invite {
  id: string;
  source: 'convites_funcionario' | 'employee_invitations';
  email: string;
  nome: string | null;
  roles: string[];
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  status: InviteStatus;
  /** Só em employee_invitations. O reenvio precisa dele. */
  funcionario_id?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  medico: 'Médico',
  recepcao: 'Recepção',
  enfermagem: 'Enfermagem',
  financeiro: 'Financeiro',
};

function computeStatus(row: { accepted_at: string | null; expires_at: string }): InviteStatus {
  if (row.accepted_at) return 'aceito';
  if (new Date(row.expires_at) < new Date()) return 'expirado';
  return 'pendente';
}

function buildInviteUrl(token: string) {
  return `${window.location.origin}/aceitar-convite?token=${encodeURIComponent(token)}`;
}

function StatusBadge({ status }: { status: InviteStatus }) {
  if (status === 'aceito')
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Aceito
      </Badge>
    );
  if (status === 'expirado')
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> Expirado
      </Badge>
    );
  return (
    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1">
      <Clock className="h-3 w-3" /> Pendente
    </Badge>
  );
}

export function ConvitesList() {
  const queryClient = useQueryClient();
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<Invite | null>(null);
  const [filtro, setFiltro] = useState<InviteStatus | 'todos'>('todos');

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ['convites-list'],
    queryFn: async (): Promise<Invite[]> => {
      const [cf, ei] = await Promise.all([
        (supabase as any)
          .from('convites_funcionario')
          .select('id, email, nome, roles, token, created_at, expires_at, accepted_at')
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('employee_invitations')
          .select('id, email, roles, token, created_at, expires_at, accepted_at, funcionario_id')
          .order('created_at', { ascending: false }),
      ]);

      const merged: Invite[] = [];

      (cf.data || []).forEach((r: any) => {
        merged.push({
          id: r.id,
          source: 'convites_funcionario',
          email: r.email,
          nome: r.nome,
          roles: r.roles || [],
          token: r.token,
          created_at: r.created_at,
          expires_at: r.expires_at,
          accepted_at: r.accepted_at,
          status: computeStatus(r),
        });
      });

      // enrich employee_invitations with funcionario name
      const funcIds = (ei.data || []).map((r: any) => r.funcionario_id).filter(Boolean);
      let funcMap: Record<string, string> = {};
      if (funcIds.length) {
        const { data: funcs } = await (supabase as any)
          .from('funcionarios')
          .select('id, nome')
          .in('id', funcIds);
        funcMap = Object.fromEntries((funcs || []).map((f: any) => [f.id, f.nome]));
      }

      (ei.data || []).forEach((r: any) => {
        merged.push({
          id: r.id,
          source: 'employee_invitations',
          email: r.email,
          nome: funcMap[r.funcionario_id] ?? null,
          roles: r.roles || [],
          token: r.token,
          created_at: r.created_at,
          expires_at: r.expires_at,
          accepted_at: r.accepted_at,
          status: computeStatus(r),
          funcionario_id: r.funcionario_id,
        });
      });

      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return merged;
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (inv: Invite) => {
      setResendingId(inv.id);

      // O reenvio precisa usar o MESMO sistema do convite original. Antes
      // chamava sempre invite-employee, que grava em convites_funcionario —
      // então reenviar um convite de employee_invitations criava um registro
      // na outra tabela e deixava o original pendente. É a origem dos e-mails
      // que hoje aparecem duplicados nas duas listas.
      const { data, error } =
        inv.source === 'employee_invitations'
          ? await supabase.functions.invoke('send-employee-invitation', {
              body: { funcionarioId: inv.funcionario_id, email: inv.email },
            })
          : await supabase.functions.invoke('invite-employee', {
              body: { email: inv.email, nome: inv.nome || inv.email, roles: inv.roles },
            });

      if (error) throw error;
      if (data && (data as any).success === false) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success('Novo convite enviado por e-mail.');
      queryClient.invalidateQueries({ queryKey: ['convites-list'] });
    },
    onError: (e) =>
      toast.error('Não foi possível reenviar o convite', {
        description: mensagemDeErro(e),
      }),
    onSettled: () => setResendingId(null),
  });

  const cancelMutation = useMutation({
    mutationFn: async (inv: Invite) => {
      // employee_invitations não tem política de DELETE, só de UPDATE, e o
      // status aceita apenas pending/accepted/expired. Expirar invalida o
      // token do mesmo jeito: accept_employee_invitation exige expires_at
      // futuro. Em convites_funcionario dá para apagar de fato.
      if (inv.source === 'employee_invitations') {
        const { error } = await (supabase as any)
          .from('employee_invitations')
          .update({ status: 'expired', expires_at: new Date().toISOString() })
          .eq('id', inv.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('convites_funcionario')
          .delete()
          .eq('id', inv.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Convite cancelado. O link deixou de funcionar.');
      queryClient.invalidateQueries({ queryKey: ['convites-list'] });
      setCancelando(null);
    },
    onError: (e) =>
      toast.error('Não foi possível cancelar o convite', {
        description: mensagemDeErro(e),
      }),
  });

  const copyLink = async (inv: Invite) => {
    try {
      await navigator.clipboard.writeText(buildInviteUrl(inv.token));
      toast.success('Link copiado para a área de transferência.');
    } catch (e) {
      toast.error('Não foi possível copiar o link', {
        description: mensagemDeErro(e) + ' Você pode selecionar e copiar manualmente.',
      });
    }
  };

  const pendentes = invites.filter((i) => i.status === 'pendente').length;
  const aceitos = invites.filter((i) => i.status === 'aceito').length;
  const expirados = invites.filter((i) => i.status === 'expirado').length;

  // Convite sem papel não dá acesso a nada: a pessoa aceita, fica vinculada à
  // clínica e não enxerga uma tela sequer. Precisa aparecer na lista, senão o
  // administrador reenvia o mesmo convite inútil.
  const semPapel = invites.filter((i) => i.status !== 'aceito' && i.roles.length === 0);

  const visiveis = filtro === 'todos' ? invites : invites.filter((i) => i.status === filtro);

  const FILTROS: Array<{ chave: InviteStatus | 'todos'; texto: string; total: number }> = [
    { chave: 'todos', texto: 'Todos', total: invites.length },
    { chave: 'pendente', texto: 'Pendentes', total: pendentes },
    { chave: 'aceito', texto: 'Aceitos', total: aceitos },
    { chave: 'expirado', texto: 'Expirados', total: expirados },
  ];

  return (
    <div className="space-y-4">
      <Alert>
        <Mail className="h-4 w-4" />
        <AlertTitle>Como funciona o convite</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>
            <strong>1.</strong> O funcionário recebe um e-mail com o link de aceitação (válido por 7 dias).
          </p>
          <p>
            <strong>2.</strong> Ele abre o link e define uma senha: mínimo 10 caracteres, com
            maiúscula, minúscula e número. Quem já tem conta informa a senha atual.
          </p>
          <p>
            <strong>3.</strong> O acesso é liberado conforme a função definida no cadastro do
            funcionário. <strong>Convite sem função não dá acesso a nada</strong> — a pessoa entra
            e não vê nenhuma tela.
          </p>
          <p>
            <strong>4.</strong> Convite expirado? Use <em>Reenviar</em> para gerar um link novo.
            Convidou a pessoa errada? Use <em>Cancelar</em> — o link para de funcionar na hora.
          </p>
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pendentes</CardDescription>
            <CardTitle className="text-2xl text-amber-600">{pendentes}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Aceitos</CardDescription>
            <CardTitle className="text-2xl text-emerald-600">{aceitos}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expirados</CardDescription>
            <CardTitle className="text-2xl text-red-600">{expirados}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {semPapel.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {semPapel.length === 1
              ? '1 convite não vai dar acesso a nada'
              : `${semPapel.length} convites não vão dar acesso a nada`}
          </AlertTitle>
          <AlertDescription>
            Estes convites foram criados sem função definida:{' '}
            <strong>{semPapel.map((i) => i.email).join(', ')}</strong>. Quem aceitar entra no
            sistema e não enxerga nenhuma tela. Cancele, defina a função do funcionário na aba
            Funcionários e convide de novo.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="gap-3">
          <div>
            <CardTitle>Convites enviados</CardTitle>
            <CardDescription>Acompanhe o status de cada convite, reenvie ou cancele.</CardDescription>
          </div>
          {invites.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {FILTROS.map((f) => (
                <Button
                  key={f.chave}
                  size="sm"
                  variant={filtro === f.chave ? 'default' : 'outline'}
                  onClick={() => setFiltro(f.chave)}
                  className="h-8"
                >
                  {f.texto}
                  <Badge variant="secondary" className="ml-2 px-1.5">{f.total}</Badge>
                </Button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : invites.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="Nenhum convite enviado"
              description="Convide funcionários pela aba Funcionários para começar."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome / E-mail</TableHead>
                    <TableHead>Papéis</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Enviado</TableHead>
                    <TableHead>Expira</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((inv) => (
                    <TableRow key={`${inv.source}-${inv.id}`}>
                      <TableCell>
                        <div className="font-medium">{inv.nome || '—'}</div>
                        <div className="text-xs text-muted-foreground">{inv.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {inv.roles.length === 0 ? (
                            <Badge variant="destructive" className="text-xs gap-1">
                              <AlertTriangle className="h-3 w-3" /> Sem função
                            </Badge>
                          ) : (
                            inv.roles.map((r) => (
                              <Badge key={r} variant="outline" className="text-xs">
                                {ROLE_LABELS[r] || r}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true, locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.status === 'aceito'
                          ? '—'
                          : formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true, locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {inv.status !== 'aceito' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyLink(inv)}
                              title="Copiar link do convite"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {inv.status !== 'aceito' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resendMutation.mutate(inv)}
                              disabled={resendingId === inv.id}
                            >
                              {resendingId === inv.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                              <span className="ml-1 hidden sm:inline">Reenviar</span>
                            </Button>
                          )}
                          {inv.status !== 'aceito' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setCancelando(inv)}
                              title="Cancelar convite"
                              className="text-destructive hover:text-destructive"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {visiveis.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum convite {FILTROS.find((f) => f.chave === filtro)?.texto.toLowerCase()}.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!cancelando}
        onOpenChange={(aberto) => !aberto && setCancelando(null)}
        title="Cancelar este convite?"
        description={
          cancelando
            ? `O link enviado para ${cancelando.email} deixa de funcionar imediatamente. ` +
              'Se a pessoa ainda precisar de acesso, será necessário convidá-la de novo.'
            : ''
        }
        confirmLabel="Cancelar convite"
        cancelLabel="Voltar"
        variant="destructive"
        isLoading={cancelMutation.isPending}
        onConfirm={() => cancelando && cancelMutation.mutate(cancelando)}
      />
    </div>
  );
}
