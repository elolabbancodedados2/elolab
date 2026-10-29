import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePlanLimits } from '@/hooks/usePlanLimits';
import { RoleAccessPreview } from '@/components/RoleAccessPreview';
import type { AppRole } from '@/contexts/SupabaseAuthContext';

type Role = AppRole;

const ROLES: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'medico', label: 'Médico' },
  { value: 'recepcao', label: 'Recepção' },
  { value: 'enfermagem', label: 'Enfermagem' },
  { value: 'financeiro', label: 'Financeiro' },
];

export default function ConvidarFuncionario() {
  const navigate = useNavigate();
  const location = useLocation();
  const completed = useRef(false);
  const sending = useRef(false);
  const returnTo = typeof location.state?.inviteReturn === 'string' && /^\/equipe(?:\?|$)/.test(location.state.inviteReturn) ? location.state.inviteReturn : '/equipe?aba=convites';
  const leave = () => navigate(returnTo, { state: location.state?.inviteReturnState });
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const queryClient = useQueryClient();
  const limitsQuery = usePlanLimits();
  const limits = limitsQuery.data;

  const toggleRole = (r: Role) => {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const willExceed =
    !!limits &&
    (!limits.canAdd.funcionario || (roles.includes('medico') && !limits.canAdd.medico));

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('invite-employee', {
        body: { email, nome, roles },
      });
      if (error) throw error;
      if (data && (data as any).success === false) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data) => {
      if (data?.emailStatus === 'sent') {
        toast.success('Convite enviado por e-mail.');
      } else {
        toast.info('Convite criado, mas o e-mail não foi enviado.', {
          description: 'Acesse a lista de convites para copiar o link e compartilhar.',
        });
      }
      completed.current = true;
      navigate('/equipe?aba=convites', { state: location.state?.inviteReturnState });
      queryClient.invalidateQueries({ queryKey: ['funcionarios-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['convites-list'] });
      queryClient.invalidateQueries({ queryKey: ['plan-limits'] });
    },
    onSettled: () => { sending.current = false; },
    onError: (err) => {
      toast.error('Não foi possível enviar o convite', {
        description: mensagemDeErro(err),
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sending.current || limitsQuery.isLoading || limitsQuery.isError) return;
    // Mensagens de validação dizem o que fazer, não só o que está errado —
    // "Selecione ao menos um papel" deixa a pessoa procurando qual campo é.
    if (!nome.trim()) return toast.error('Informe o nome do funcionário.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return toast.error('E-mail inválido', {
        description: 'Confira se não faltou o @ ou o ponto no domínio.',
      });
    }
    if (roles.length === 0) {
      return toast.error('Escolha a função deste funcionário', {
        description: 'Sem função, ele entra no sistema e não vê nenhuma tela.',
      });
    }
    if (willExceed) {
      return toast.error('Limite de funcionários do plano atingido', {
        description: 'Remova um funcionário inativo ou mude de plano para convidar mais.',
      });
    }
    sending.current = true;
    mutation.mutate();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24 lg:pb-8">
      <UnsavedChangesGuard dirty={!!(nome || email || roles.length)} busy={mutation.isPending} completed={completed} />
      <Button variant="outline" onClick={leave} disabled={mutation.isPending}>Voltar à equipe</Button>
      <PageHeader title="Convidar funcionário" description="Defina quem vai entrar e quais ferramentas poderá usar. O funcionário recebe um link e define sua própria senha." icon={<Mail />} />
      {limitsQuery.isLoading && <p role="status" className="text-sm text-muted-foreground">Consultando disponibilidade do plano…</p>}
      {limitsQuery.isError && <ErrorState title="Não foi possível consultar o limite da equipe" description="Tente novamente antes de enviar o convite. Seu preenchimento foi preservado." error={limitsQuery.error} onRetry={() => void limitsQuery.refetch()} />}
        {limits && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div>Plano <strong>{limits.plano_nome ?? 'não definido'}</strong></div>
            <div className="text-muted-foreground">
              {limits.current.funcionarios_total}/{limits.max_funcionarios_total ?? '—'} funcionários · {limits.current.medicos}/{limits.max_medicos ?? '—'} médicos
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-5 sm:p-6">
          <fieldset disabled={mutation.isPending} className="space-y-6">
          <legend className="mb-4 text-lg font-semibold">Destinatário e acesso</legend>
          <div className="space-y-2">
            <Label htmlFor="conv-nome">Nome</Label>
            <Input id="conv-nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="conv-email">E-mail</Label>
            <Input id="conv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Funções e permissões</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ROLES.map((r) => (
                <label key={r.value} className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/50">
                  <Checkbox checked={roles.includes(r.value)} onCheckedChange={() => toggleRole(r.value)} />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </div>
            <RoleAccessPreview roles={roles} />
          </div>

          {willExceed && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Limite do plano atingido. Faça upgrade para adicionar mais membros.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t pt-5 scroll-mb-24">
            <Button type="button" variant="outline" onClick={leave}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || willExceed || limitsQuery.isLoading || limitsQuery.isError}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Enviar convite
            </Button>
          </div>
          </fieldset>
        </form>
    </div>
  );
}
