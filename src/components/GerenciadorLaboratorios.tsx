import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Building2, Loader2 } from 'lucide-react';
import { ListSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ErrorState';

interface Laboratorio {
  id: string;
  nome: string;
  cnpj: string;
  telefone: string;
  email: string;
  endereco: string;
  ativo: boolean;
}

// Helper to bypass strict typing for tables not yet in generated types
const db = supabase as any;

export function GerenciadorLaboratorios() {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [laboratorioParaExcluir, setLaboratorioParaExcluir] = useState<Laboratorio | null>(null);
  const [form, setForm] = useState({
    nome: '',
    cnpj: '',
    telefone: '',
    email: '',
    endereco: '',
  });

  const laboratoriosQuery = useQuery({
    queryKey: ['laboratorios', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const { data, error } = await db
        .from('laboratorios')
        .select('*')
        .eq('clinica_id', profile.clinica_id)
        .order('nome');
      if (error) throw error;
      return (data || []) as Laboratorio[];
    },
    enabled: !!profile?.clinica_id,
  });
  const { data: laboratorios = [], isLoading } = laboratoriosQuery;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada');
      if (!form.nome.trim()) throw new Error('Nome obrigatório');

      if (editingId) {
        const { data, error } = await db
          .from('laboratorios')
          .update(form)
          .eq('id', editingId)
          .eq('clinica_id', profile.clinica_id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Laboratório não encontrado na clínica atual. Atualize a lista e tente novamente.');
      } else {
        const { data, error } = await db
          .from('laboratorios')
          .insert({ ...form, clinica_id: profile.clinica_id })
          .select('id')
          .single();
        if (error) throw error;
        if (!data) throw new Error('O laboratório não foi confirmado pelo banco.');
      }
    },
    onSuccess: () => {
      toast.success(editingId ? 'Laboratório atualizado!' : 'Laboratório adicionado!');
      queryClient.invalidateQueries({ queryKey: ['laboratorios'] });
      resetForm();
      setShowDialog(false);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Atualize a sessão e tente novamente.');
      const { data, error } = await db
        .from('laboratorios')
        .delete()
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('O laboratório não foi encontrado na clínica atual. Atualize a lista.');
    },
    onSuccess: () => {
      toast.success('Laboratório removido!');
      queryClient.invalidateQueries({ queryKey: ['laboratorios'] });
      setLaboratorioParaExcluir(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const resetForm = () => {
    setForm({ nome: '', cnpj: '', telefone: '', email: '', endereco: '' });
    setEditingId(null);
  };

  const handleEdit = (lab: Laboratorio) => {
    setForm({ nome: lab.nome, cnpj: lab.cnpj || '', telefone: lab.telefone || '', email: lab.email || '', endereco: lab.endereco || '' });
    setEditingId(lab.id);
    setShowDialog(true);
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Laboratórios/Fornecedores
          </h3>
          <Button onClick={() => { resetForm(); setShowDialog(true); }} size="sm" className="gap-1">
            <Plus className="h-4 w-4" /> Novo
          </Button>
        </div>

        {laboratoriosQuery.isError ? (
          <ErrorState compact title="Não foi possível carregar os laboratórios" error={laboratoriosQuery.error} onRetry={() => void laboratoriosQuery.refetch()} />
        ) : isLoading ? (
          <ListSkeleton items={3} />
        ) : laboratorios.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Nenhum laboratório cadastrado</p>
            <p className="text-sm">Adicione seus fornecedores para gerenciar exames</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden sm:table-cell">CNPJ</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {laboratorios.map((lab) => (
                  <TableRow key={lab.id}>
                    <TableCell className="font-medium">{lab.nome}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{lab.cnpj || '—'}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{lab.email || '—'}</TableCell>
                    <TableCell className="text-sm">{lab.telefone || '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" aria-label={`Editar laboratório ${lab.nome}`} onClick={() => handleEdit(lab)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" aria-label={`Excluir laboratório ${lab.nome}`} onClick={() => setLaboratorioParaExcluir(lab)} disabled={deleteMutation.isPending}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Laboratório' : 'Novo Laboratório'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nome *</Label>
              <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Diagnósticos Brasil" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">CNPJ</Label>
                <Input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Telefone</Label>
                <Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="(11) 9999-9999" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Email</Label>
              <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" placeholder="contato@lab.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Endereço</Label>
              <Input value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} placeholder="Av. Principal, 1000" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.nome.trim()}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingId ? 'Atualizar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!laboratorioParaExcluir} onOpenChange={open => { if (!open && !deleteMutation.isPending) setLaboratorioParaExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir laboratório?</AlertDialogTitle>
            <AlertDialogDescription>
              {laboratorioParaExcluir?.nome} será removido da lista. Os exames já vinculados permanecem no histórico, sem laboratório associado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Manter laboratório</AlertDialogCancel>
            <AlertDialogAction
              onClick={event => { event.preventDefault(); if (laboratorioParaExcluir) deleteMutation.mutate(laboratorioParaExcluir.id); }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
