import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

export default function GerenciadorLaboratorios() {
  const location = useLocation();
  return <Laboratorios key={location.pathname} />;
}

function Laboratorios() {
  const navigate = useNavigate();
  const location = useLocation();
  const { laboratoryId: editingId } = useParams();
  const formPage = !!editingId || location.pathname.endsWith('/novo');
  const listUrl = '/exames/laboratorios' + location.search;
  const navigationState = location.state;
  const completed = useRef(false);
  const saving = useRef(false);
  const initialized = useRef(false);
  const baseline = useRef('');
  const leaveForm = () => navigate(listUrl, { state: navigationState });
  const examsReturn = new URLSearchParams(location.search).get('voltar');
  const examsUrl = examsReturn && /^\/exames(?:\?|$)/.test(examsReturn) ? examsReturn : '/exames';
  const { profile, isAdmin, hasRole } = useSupabaseAuth();
  const canEdit = isAdmin() || hasRole('enfermagem');
  const queryClient = useQueryClient();
  const [laboratorioParaExcluir, setLaboratorioParaExcluir] = useState<Laboratorio | null>(null);
  const [form, setForm] = useState({
    nome: '',
    cnpj: '',
    telefone: '',
    email: '',
    endereco: '',
  });

  const laboratoriosQuery = useQuery({
    queryKey: ['laboratorios', 'gestao', profile?.clinica_id],
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
    enabled: !!profile?.clinica_id && !formPage,
  });
  const { data: laboratorios = [], isLoading } = laboratoriosQuery;

  const recordQuery = useQuery({
    queryKey: ['laboratorios', 'editar', profile?.clinica_id, editingId],
    queryFn: async () => {
      const { data, error } = await db.from('laboratorios').select('*').eq('id', editingId).eq('clinica_id', profile!.clinica_id).maybeSingle();
      if (error) throw error;
      return data as Laboratorio | null;
    },
    enabled: !!profile?.clinica_id && !!editingId,
    retry: false,
    gcTime: 0,
  });
  useEffect(() => {
    if (!formPage || initialized.current || (editingId && !recordQuery.data)) return;
    const lab = recordQuery.data;
    const value = lab ? { nome: lab.nome, cnpj: lab.cnpj || '', telefone: lab.telefone || '', email: lab.email || '', endereco: lab.endereco || '' } : { nome: '', cnpj: '', telefone: '', email: '', endereco: '' };
    baseline.current = JSON.stringify(value);
    initialized.current = true;
    setForm(value);
  }, [formPage, editingId, recordQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!canEdit) throw new Error('Seu perfil permite consultar os laboratórios, mas não alterar o cadastro.');
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
      completed.current = true;
      leaveForm();
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

  const handleEdit = (lab: Laboratorio) => navigate(`/exames/laboratorios/${lab.id}/editar${location.search}`, { state: navigationState });
  const submit = async () => {
    if (saving.current) return;
    saving.current = true;
    try { await saveMutation.mutateAsync(); } catch { /* Feedback remains in the form. */ }
    finally { saving.current = false; }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-24 lg:pb-8">
      <UnsavedChangesGuard dirty={formPage && initialized.current && JSON.stringify(form) !== baseline.current} busy={saveMutation.isPending} completed={completed} />
      <Button variant="outline" onClick={() => formPage ? leaveForm() : navigate(examsUrl, { state: navigationState })}>{formPage ? 'Voltar aos laboratórios' : 'Voltar aos exames'}</Button>
      {!formPage && <div className="space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Laboratórios/Fornecedores
          </h1>
          {canEdit && <Button asChild className="gap-1"><Link to={`/exames/laboratorios/novo${location.search}`} state={navigationState}><Plus className="h-4 w-4" /> Novo laboratório</Link></Button>}
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
                        {canEdit && <Button variant="ghost" size="icon" aria-label={`Editar laboratório ${lab.nome}`} onClick={() => handleEdit(lab)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>}
                        {isAdmin() && <Button variant="ghost" size="icon" className="text-destructive" aria-label={`Excluir laboratório ${lab.nome}`} onClick={() => setLaboratorioParaExcluir(lab)} disabled={deleteMutation.isPending}>
                          <Trash2 className="h-4 w-4" />
                        </Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>}

      {formPage && (!canEdit ? <p role="status">Seu perfil permite consultar os laboratórios, mas não alterar o cadastro.</p>
        : editingId && recordQuery.isError ? <ErrorState title="Não foi possível abrir o laboratório" error={recordQuery.error} onRetry={() => void recordQuery.refetch()} />
        : editingId && recordQuery.isPending ? <ListSkeleton items={3} />
        : editingId && !recordQuery.data ? <p role="status">Laboratório não encontrado na clínica atual. Volte à lista para selecionar outro registro.</p>
        : <form onSubmit={event => { event.preventDefault(); void submit(); }} className="max-w-3xl space-y-6 rounded-xl border bg-card p-5 sm:p-8">
          <header className="space-y-2 border-b pb-5">
            <p className="text-sm text-muted-foreground">Exames / Laboratórios e fornecedores</p>
            <h1 className="text-2xl font-semibold">{editingId ? 'Editar laboratório' : 'Novo laboratório'}</h1>
            <p className="text-sm text-muted-foreground">Identificação e contato do parceiro responsável pelos exames. O nome é obrigatório.</p>
          </header>
          <fieldset disabled={saveMutation.isPending} className="min-w-0">
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="laboratorio-nome" className="text-xs font-medium">Nome *</Label>
              <Input id="laboratorio-nome" required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Diagnósticos Brasil" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="laboratorio-cnpj" className="text-xs font-medium">CNPJ</Label>
                <Input id="laboratorio-cnpj" value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="laboratorio-telefone" className="text-xs font-medium">Telefone</Label>
                <Input id="laboratorio-telefone" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="(11) 9999-9999" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="laboratorio-email" className="text-xs font-medium">Email</Label>
              <Input id="laboratorio-email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" placeholder="contato@lab.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="laboratorio-endereco" className="text-xs font-medium">Endereço</Label>
              <Input id="laboratorio-endereco" value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} placeholder="Av. Principal, 1000" />
            </div>
          </div>
          </fieldset>
          {saveMutation.isError && <p role="alert" className="text-sm text-destructive">Não foi possível salvar. Seus dados continuam nesta página; confira a mensagem e tente novamente.</p>}
          <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
            <Button type="button" variant="outline" onClick={leaveForm} disabled={saveMutation.isPending}>Cancelar</Button>
            <Button type="submit" className="scroll-mb-24" disabled={saveMutation.isPending || !form.nome.trim()}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingId ? 'Atualizar' : 'Adicionar'}
            </Button>
          </div>
        </form>)}

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
    </div>
  );
}
