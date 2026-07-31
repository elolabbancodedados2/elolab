import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePlanLimits } from '@/hooks/usePlanLimits';

type Role = 'admin' | 'medico' | 'recepcao' | 'enfermagem' | 'financeiro';

const ROLES: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'medico', label: 'Médico' },
  { value: 'recepcao', label: 'Recepção' },
  { value: 'enfermagem', label: 'Enfermagem' },
  { value: 'financeiro', label: 'Financeiro' },
];

interface ConvidarFuncionarioDialogProps {
  trigger: React.ReactNode;
}

export function ConvidarFuncionarioDialog({ trigger }: ConvidarFuncionarioDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const queryClient = useQueryClient();
  const { data: limits } = usePlanLimits();

  const reset = () => {
    setEmail('');
    setNome('');
    setRoles([]);
  };

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
    onSuccess: () => {
      toast.success('Convite enviado por e-mail.');
      reset();
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['funcionarios'] });
      queryClient.invalidateQueries({ queryKey: ['plan-limits'] });
    },
    onError: (err) => {
      toast.error('Não foi possível enviar o convite', {
        description: mensagemDeErro(err),
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> Convidar funcionário
          </DialogTitle>
          <DialogDescription>
            Envia um e-mail com link de cadastro. O funcionário define sua própria senha.
          </DialogDescription>
        </DialogHeader>

        {limits && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div>Plano <strong>{limits.plano_nome ?? 'não definido'}</strong></div>
            <div className="text-muted-foreground">
              {limits.current.funcionarios_total}/{limits.max_funcionarios_total} funcionários · {limits.current.medicos}/{limits.max_medicos} médicos
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="conv-nome">Nome</Label>
            <Input id="conv-nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="conv-email">E-mail</Label>
            <Input id="conv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Papéis</Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <label key={r.value} className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/50">
                  <Checkbox checked={roles.includes(r.value)} onCheckedChange={() => toggleRole(r.value)} />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          {willExceed && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Limite do plano atingido. Faça upgrade para adicionar mais membros.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || willExceed}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Enviar convite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}