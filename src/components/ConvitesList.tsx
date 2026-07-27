import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Copy, Mail, RefreshCw, CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
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
        });
      });

      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return merged;
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (inv: Invite) => {
      setResendingId(inv.id);
      const { data, error } = await supabase.functions.invoke('invite-employee', {
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
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao reenviar convite'),
    onSettled: () => setResendingId(null),
  });

  const copyLink = async (inv: Invite) => {
    try {
      await navigator.clipboard.writeText(buildInviteUrl(inv.token));
      toast.success('Link copiado para a área de transferência.');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  };

  const pendentes = invites.filter((i) => i.status === 'pendente').length;
  const aceitos = invites.filter((i) => i.status === 'aceito').length;
  const expirados = invites.filter((i) => i.status === 'expirado').length;

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
            <strong>2.</strong> Ele abre o link, define uma senha (mínimo 8 caracteres) e confirma o cadastro.
          </p>
          <p>
            <strong>3.</strong> Após aceito, o acesso é liberado automaticamente conforme os papéis atribuídos.
            Se o convite expirar, use <em>Reenviar</em> para gerar um novo link.
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

      <Card>
        <CardHeader>
          <CardTitle>Convites enviados</CardTitle>
          <CardDescription>Acompanhe o status de cada convite e reenvie quando necessário.</CardDescription>
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
                  {invites.map((inv) => (
                    <TableRow key={`${inv.source}-${inv.id}`}>
                      <TableCell>
                        <div className="font-medium">{inv.nome || '—'}</div>
                        <div className="text-xs text-muted-foreground">{inv.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {inv.roles.map((r) => (
                            <Badge key={r} variant="outline" className="text-xs">
                              {ROLE_LABELS[r] || r}
                            </Badge>
                          ))}
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
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
