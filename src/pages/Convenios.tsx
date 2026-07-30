import { useState, useMemo } from 'react';
import {
  Plus, Search, Edit, Trash2, Building2, Shield, FileText, Clock,
  ExternalLink, User, Phone, Loader2, Globe, FlaskConical, DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useConvenios } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';

const VERSOES_TISS = ['04.01.00', '04.00.02', '03.05.00', '03.04.01'];

interface FormData {
  nome: string;
  codigo: string;
  cnpj: string;
  telefone: string;
  email: string;
  website: string;
  valor_consulta: number;
  valor_retorno: number;
  carencia: number;
  ativo: boolean;
  registro_ans: string;
  codigo_operadora: string;
  versao_tiss: string;
  prazo_retorno: number;
  taxa_glosa: number;
  portal_url: string;
  responsavel_nome: string;
  responsavel_cargo: string;
  responsavel_telefone: string;
  tipo_planos: string[];
}

const initialFormData: FormData = {
  nome: '', codigo: '', cnpj: '', telefone: '', email: '', website: '',
  valor_consulta: 0, valor_retorno: 0, carencia: 0, ativo: true,
  registro_ans: '', codigo_operadora: '', versao_tiss: '04.01.00',
  prazo_retorno: 30, taxa_glosa: 0, portal_url: '',
  responsavel_nome: '', responsavel_cargo: '', responsavel_telefone: '',
  tipo_planos: [],
};

interface ExamePreco {
  id?: string;
  tipo_exame: string;
  codigo_tuss: string;
  descricao: string;
  valor_tabela: number;
  valor_filme: number;
  valor_custo: number;
  valor_repasse: number;
}

const initialExameForm: ExamePreco = {
  tipo_exame: '', codigo_tuss: '', descricao: '', valor_tabela: 0, valor_filme: 0, valor_custo: 0, valor_repasse: 0,
};

/* ─── Tabela de Exames do Convênio ─── */
function TabelaExamesConvenio({ convenioId }: { convenioId: string }) {
  const queryClient = useQueryClient();
  const [exameForm, setExameForm] = useState<ExamePreco>(initialExameForm);
  const [editingExameId, setEditingExameId] = useState<string | null>(null);
  const [isExameFormOpen, setIsExameFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchExame, setSearchExame] = useState('');
  const [deleteExameId, setDeleteExameId] = useState<string | null>(null);

  const { data: exames = [], isLoading } = useQuery({
    queryKey: ['precos-exames-convenio', convenioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('precos_exames_convenio')
        .select('*')
        .eq('convenio_id', convenioId)
        .order('tipo_exame');
      if (error) throw error;
      return data || [];
    },
    enabled: !!convenioId,
  });

  const filteredExames = useMemo(() =>
    (exames as any[]).filter(e =>
      e.tipo_exame.toLowerCase().includes(searchExame.toLowerCase()) ||
      (e.codigo_tuss || '').includes(searchExame) ||
      (e.descricao || '').toLowerCase().includes(searchExame.toLowerCase())
    ), [exames, searchExame]);

  const handleNewExame = () => {
    setEditingExameId(null);
    setExameForm(initialExameForm);
    setIsExameFormOpen(true);
  };

  const handleEditExame = (e: any) => {
    setEditingExameId(e.id);
    setExameForm({
      tipo_exame: e.tipo_exame,
      codigo_tuss: e.codigo_tuss || '',
      descricao: e.descricao || '',
      valor_tabela: e.valor_tabela || 0,
      valor_filme: e.valor_filme || 0,
      valor_custo: e.valor_custo || 0,
      valor_repasse: e.valor_repasse || 0,
    });
    setIsExameFormOpen(true);
  };

  const handleSaveExame = async () => {
    if (!exameForm.tipo_exame) { toast.error('Tipo do exame é obrigatório.'); return; }
    if (exameForm.valor_tabela <= 0) { toast.error('Valor da tabela deve ser maior que zero.'); return; }
    setIsSaving(true);
    try {
      const payload = {
        convenio_id: convenioId,
        tipo_exame: exameForm.tipo_exame,
        codigo_tuss: exameForm.codigo_tuss || null,
        descricao: exameForm.descricao || null,
        valor_tabela: exameForm.valor_tabela,
        valor_filme: exameForm.valor_filme || 0,
        valor_custo: exameForm.valor_custo || 0,
        valor_repasse: exameForm.valor_repasse || 0,
      };
      if (editingExameId) {
        const { error } = await supabase.from('precos_exames_convenio').update(payload).eq('id', editingExameId);
        if (error) throw error;
        toast.success('Exame atualizado!');
      } else {
        const { error } = await supabase.from('precos_exames_convenio').insert(payload);
        if (error) throw error;
        toast.success('Exame adicionado à tabela!');
      }
      queryClient.invalidateQueries({ queryKey: ['precos-exames-convenio', convenioId] });
      setIsExameFormOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar exame.');
    } finally { setIsSaving(false); }
  };

  const handleDeleteExame = async () => {
    if (!deleteExameId) return;
    try {
      const { data, error } = await supabase.from('precos_exames_convenio').delete().eq('id', deleteExameId).select('id');
      if (error) throw error;
      if (!data || data.length === 0) { toast.error('Sem permissão para excluir.'); return; }
      toast.success('Exame removido da tabela.');
      queryClient.invalidateQueries({ queryKey: ['precos-exames-convenio', convenioId] });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir.');
    } finally { setDeleteExameId(null); }
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h4 className="font-semibold">Tabela de Preços de Exames</h4>
          <Badge variant="secondary" className="text-xs">{(exames as any[]).length} itens</Badge>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar exame ou TUSS..." value={searchExame}
              onChange={e => setSearchExame(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          <Button size="sm" onClick={handleNewExame} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Adicionar Exame
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : filteredExames.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nenhum exame cadastrado nesta tabela</p>
          <p className="text-sm mt-1">Adicione os exames e seus valores para este convênio.</p>
        </div>
      ) : (
        <div className="rounded-md border max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exame</TableHead>
                <TableHead className="hidden sm:table-cell">Código TUSS</TableHead>
                <TableHead className="text-right">Valor Tabela</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Filme</TableHead>
                <TableHead className="text-right hidden md:table-cell">Custo</TableHead>
                <TableHead className="text-right hidden md:table-cell">Repasse</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExames.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <p className="font-medium text-sm">{e.tipo_exame}</p>
                    {e.descricao && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{e.descricao}</p>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {e.codigo_tuss ? (
                      <Badge variant="outline" className="font-mono text-[10px]">{e.codigo_tuss}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{formatCurrency(e.valor_tabela)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm hidden sm:table-cell">{formatCurrency(e.valor_filme || 0)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">{formatCurrency(e.valor_custo || 0)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">{formatCurrency(e.valor_repasse || 0)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-semibold">{formatCurrency(e.valor_total || e.valor_tabela + (e.valor_filme || 0))}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditExame(e)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteExameId(e.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Exame Form Dialog */}
      <Dialog open={isExameFormOpen} onOpenChange={setIsExameFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              {editingExameId ? 'Editar Exame' : 'Novo Exame na Tabela'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo do Exame *</Label>
              <Input value={exameForm.tipo_exame}
                onChange={e => setExameForm({ ...exameForm, tipo_exame: e.target.value })}
                placeholder="Ex: Hemograma, Raio-X Tórax..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Código TUSS</Label>
                <Input value={exameForm.codigo_tuss}
                  onChange={e => setExameForm({ ...exameForm, codigo_tuss: e.target.value })}
                  placeholder="40301010" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Tabela (R$) *</Label>
                <Input type="number" step="0.01" value={exameForm.valor_tabela}
                  onChange={e => setExameForm({ ...exameForm, valor_tabela: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valor Filme (R$)</Label>
              <Input type="number" step="0.01" value={exameForm.valor_filme}
                onChange={e => setExameForm({ ...exameForm, valor_filme: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Custo (R$)</Label>
                <Input type="number" step="0.01" value={exameForm.valor_custo}
                  onChange={e => setExameForm({ ...exameForm, valor_custo: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Repasse (R$)</Label>
                <Input type="number" step="0.01" value={exameForm.valor_repasse}
                  onChange={e => setExameForm({ ...exameForm, valor_repasse: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Input value={exameForm.descricao}
                onChange={e => setExameForm({ ...exameForm, descricao: e.target.value })}
                placeholder="Descrição opcional do procedimento" />
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Valor Total (Tabela + Filme)</span>
                <span className="font-bold text-primary">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                    .format(exameForm.valor_tabela + (exameForm.valor_filme || 0))}
                </span>
              </div>
              {(exameForm.valor_custo > 0 || exameForm.valor_repasse > 0) && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Margem (Total - Custo - Repasse)</span>
                  <span className="font-semibold">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                      .format((exameForm.valor_tabela + (exameForm.valor_filme || 0)) - (exameForm.valor_custo || 0) - (exameForm.valor_repasse || 0))}
                  </span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExameFormOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSaveExame} disabled={isSaving}>
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Exame Dialog */}
      <AlertDialog open={!!deleteExameId} onOpenChange={() => setDeleteExameId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover exame da tabela?</AlertDialogTitle>
            <AlertDialogDescription>O exame será removido da tabela de preços deste convênio.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteExame} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── Página Principal ─── */
function Convenios() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [newPlano, setNewPlano] = useState('');
  const [activeTab, setActiveTab] = useState('dados');

  const queryClient = useQueryClient();
  const { data: convenios = [], isLoading } = useConvenios();

  const filteredConvenios = useMemo(() =>
    (convenios as any[]).filter(c =>
      c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.registro_ans || '').includes(searchTerm)
    ), [convenios, searchTerm]);

  const handleNew = () => {
    setEditingId(null);
    setFormData(initialFormData);
    setActiveTab('dados');
    setIsFormOpen(true);
  };

  const handleEdit = (c: any) => {
    setEditingId(c.id);
    setFormData({
      nome: c.nome, codigo: c.codigo, cnpj: c.cnpj || '', telefone: c.telefone || '',
      email: c.email || '', website: c.website || '', valor_consulta: c.valor_consulta || 0,
      valor_retorno: c.valor_retorno || 0, carencia: c.carencia || 0, ativo: c.ativo ?? true,
      registro_ans: c.registro_ans || '', codigo_operadora: c.codigo_operadora || '',
      versao_tiss: c.versao_tiss || '04.01.00', prazo_retorno: c.prazo_retorno ?? 30,
      taxa_glosa: c.taxa_glosa || 0, portal_url: c.portal_url || '',
      responsavel_nome: c.responsavel_nome || '', responsavel_cargo: c.responsavel_cargo || '',
      responsavel_telefone: c.responsavel_telefone || '',
      tipo_planos: c.tipo_planos || [],
    });
    setActiveTab('dados');
    setIsFormOpen(true);
  };

  const handleDeleteClick = (id: string) => { setSelectedId(id); setIsDeleteOpen(true); };

  const handleDelete = async () => {
    if (!selectedId) return;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.from('convenios').delete().eq('id', selectedId).select('id');
      if (error) throw error;
      if (!data || data.length === 0) { toast.error('Sem permissão ou convênio já removido.'); return; }
      toast.success('Convênio excluído!');
      queryClient.invalidateQueries({ queryKey: ['convenios'] });
    } catch (error: any) {
      toast.error(error.message || 'Erro ao excluir.');
    } finally { setIsDeleting(false); setIsDeleteOpen(false); }
  };

  const handleSave = async () => {
    if (!formData.nome || !formData.codigo) { toast.error('Nome e código são obrigatórios.'); return; }
    if (formData.cnpj) {
      const cnpjDigits = formData.cnpj.replace(/\D/g, '');
      if (cnpjDigits.length !== 14) { toast.error('CNPJ deve conter 14 dígitos.'); return; }
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error('E-mail do convênio inválido.'); return;
    }
    if (formData.valor_consulta < 0 || formData.valor_retorno < 0) {
      toast.error('Valores não podem ser negativos.'); return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        nome: formData.nome, codigo: formData.codigo, cnpj: formData.cnpj || null,
        telefone: formData.telefone || null, email: formData.email || null,
        website: formData.website || null, valor_consulta: formData.valor_consulta,
        valor_retorno: formData.valor_retorno, carencia: formData.carencia, ativo: formData.ativo,
        registro_ans: formData.registro_ans || null, codigo_operadora: formData.codigo_operadora || null,
        versao_tiss: formData.versao_tiss || null, prazo_retorno: formData.prazo_retorno,
        taxa_glosa: formData.taxa_glosa, portal_url: formData.portal_url || null,
        responsavel_nome: formData.responsavel_nome || null,
        responsavel_cargo: formData.responsavel_cargo || null,
        responsavel_telefone: formData.responsavel_telefone || null,
        tipo_planos: formData.tipo_planos.length > 0 ? formData.tipo_planos : null,
      };

      if (editingId) {
        const { error } = await supabase.from('convenios').update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success('Convênio atualizado!');
      } else {
        const { data, error } = await supabase.from('convenios').insert(payload).select('id').single();
        if (error) throw error;
        toast.success('Convênio cadastrado!');
        if (data) setEditingId(data.id);
      }
      queryClient.invalidateQueries({ queryKey: ['convenios'] });
      if (activeTab === 'dados') {
        setIsFormOpen(false);
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar.');
    } finally { setIsSubmitting(false); }
  };

  const addPlano = () => {
    const trimmed = newPlano.trim();
    if (!trimmed || formData.tipo_planos.includes(trimmed)) return;
    setFormData(p => ({ ...p, tipo_planos: [...p.tipo_planos, trimmed] }));
    setNewPlano('');
  };

  const removePlano = (p: string) => {
    setFormData(prev => ({ ...prev, tipo_planos: prev.tipo_planos.filter(x => x !== p) }));
  };

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Convênios</h1>
          <p className="text-muted-foreground">Operadoras de saúde, faturamento TISS e tabelas de preços</p>
        </div>
        <Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" />Novo Convênio</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Building2 className="h-5 w-5 text-primary" /></div>
          <div><p className="text-2xl font-bold">{(convenios as any[]).length}</p><p className="text-xs text-muted-foreground">Convênios</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Shield className="h-5 w-5 text-primary" /></div>
          <div><p className="text-2xl font-bold">{(convenios as any[]).filter(c => c.ativo).length}</p><p className="text-xs text-muted-foreground">Ativos</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div>
          <div><p className="text-2xl font-bold">{(convenios as any[]).filter(c => c.registro_ans).length}</p><p className="text-xs text-muted-foreground">Com ANS</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent"><Clock className="h-5 w-5 text-accent-foreground" /></div>
          <div><p className="text-2xl font-bold">{(convenios as any[]).filter(c => !c.registro_ans && c.ativo).length}</p><p className="text-xs text-muted-foreground">Sem ANS</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Lista de Convênios ({filteredConvenios.length})</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar nome, código ou ANS..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Convênio</TableHead>
                  <TableHead className="hidden md:table-cell">ANS / Operadora</TableHead>
                  <TableHead className="hidden sm:table-cell">Consulta</TableHead>
                  <TableHead className="hidden lg:table-cell">Retorno</TableHead>
                  <TableHead className="hidden lg:table-cell">TISS</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredConvenios.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Nenhum convênio encontrado</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredConvenios.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{c.nome}</p>
                          <p className="text-xs text-muted-foreground font-mono">{c.codigo}</p>
                          {c.tipo_planos && c.tipo_planos.length > 0 && (
                            <div className="flex gap-1 mt-0.5 flex-wrap">
                              {c.tipo_planos.slice(0, 2).map((p: string) => (
                                <Badge key={p} variant="secondary" className="text-[9px]">{p}</Badge>
                              ))}
                              {c.tipo_planos.length > 2 && <span className="text-[9px] text-muted-foreground">+{c.tipo_planos.length - 2}</span>}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="text-xs space-y-0.5">
                          {c.registro_ans ? (
                            <p className="flex items-center gap-1"><Shield className="h-3 w-3 text-primary" />{c.registro_ans}</p>
                          ) : (
                            <p className="text-muted-foreground">Sem registro</p>
                          )}
                          {c.codigo_operadora && <p className="text-muted-foreground">Op: {c.codigo_operadora}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell tabular-nums">{formatCurrency(c.valor_consulta || 0)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="text-xs">
                          <p className="tabular-nums">{formatCurrency(c.valor_retorno || 0)}</p>
                          <p className="text-muted-foreground">{c.prazo_retorno || 30}d</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="outline" className="text-[10px] font-mono">{c.versao_tiss || '04.01.00'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.ativo ? 'default' : 'secondary'}>
                          {c.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {c.portal_url && (
                            <Button variant="ghost" size="icon" asChild title="Portal do convênio">
                              <a href={c.portal_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(c.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Form Dialog with Tabs ── */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {editingId ? 'Editar Convênio' : 'Novo Convênio'}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="dados" className="gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Dados do Convênio
              </TabsTrigger>
              <TabsTrigger value="exames" disabled={!editingId} className="gap-1.5">
                <FlaskConical className="h-3.5 w-3.5" /> Tabela de Exames
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="flex-1 overflow-y-auto space-y-5 pr-2 mt-4">
              {/* Identificação */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome *</Label>
                  <Input value={formData.nome} onChange={e => setFormData({ ...formData, nome: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Código Interno *</Label>
                  <Input value={formData.codigo} onChange={e => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })} maxLength={10} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CNPJ</Label>
                <Input value={formData.cnpj} onChange={e => setFormData({ ...formData, cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
              </div>

              {/* Dados ANS */}
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Shield className="h-4 w-4" /> Dados Regulatórios (ANS)
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Registro ANS</Label>
                    <Input value={formData.registro_ans} onChange={e => setFormData({ ...formData, registro_ans: e.target.value })}
                      placeholder="Nº ANS" className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Código da Operadora</Label>
                    <Input value={formData.codigo_operadora} onChange={e => setFormData({ ...formData, codigo_operadora: e.target.value })}
                      placeholder="Código TISS" className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Versão TISS</Label>
                    <Select value={formData.versao_tiss} onValueChange={v => setFormData({ ...formData, versao_tiss: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VERSOES_TISS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Valores e Regras */}
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4" /> Valores de Consulta e Regras
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Valor Consulta (R$)</Label>
                    <Input type="number" step="0.01" value={formData.valor_consulta}
                      onChange={e => setFormData({ ...formData, valor_consulta: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Valor Retorno (R$)</Label>
                    <Input type="number" step="0.01" value={formData.valor_retorno}
                      onChange={e => setFormData({ ...formData, valor_retorno: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Carência (dias)</Label>
                    <Input type="number" value={formData.carencia}
                      onChange={e => setFormData({ ...formData, carencia: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Prazo de Retorno (dias)</Label>
                    <Input type="number" value={formData.prazo_retorno}
                      onChange={e => setFormData({ ...formData, prazo_retorno: parseInt(e.target.value) || 30 })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Taxa Glosa (%)</Label>
                    <Input type="number" step="0.1" value={formData.taxa_glosa}
                      onChange={e => setFormData({ ...formData, taxa_glosa: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
                {!editingId && (
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                    <FlaskConical className="h-3.5 w-3.5" />
                    Salve o convênio primeiro para cadastrar a tabela de preços de exames.
                  </p>
                )}
              </div>

              {/* Planos Vinculados */}
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Planos Vinculados</h4>
                <div className="flex gap-2 mb-2">
                  <Input value={newPlano} onChange={e => setNewPlano(e.target.value)}
                    placeholder="Ex: Básico, Executivo, Nacional..."
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addPlano())} className="flex-1" />
                  <Button type="button" variant="outline" size="sm" onClick={addPlano}>Adicionar</Button>
                </div>
                {formData.tipo_planos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {formData.tipo_planos.map(p => (
                      <Badge key={p} variant="secondary" className="gap-1 cursor-pointer" onClick={() => removePlano(p)}>
                        {p} ×
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Contato */}
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Phone className="h-4 w-4" /> Contato
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Telefone</Label>
                    <Input value={formData.telefone} onChange={e => setFormData({ ...formData, telefone: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">E-mail</Label>
                    <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Website</Label>
                    <Input value={formData.website} onChange={e => setFormData({ ...formData, website: e.target.value })} placeholder="https://..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Portal de Autorização (URL)</Label>
                    <Input value={formData.portal_url} onChange={e => setFormData({ ...formData, portal_url: e.target.value })} placeholder="https://portal..." />
                  </div>
                </div>
              </div>

              {/* Responsável Faturamento */}
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <User className="h-4 w-4" /> Responsável no Convênio (Faturamento)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome</Label>
                    <Input value={formData.responsavel_nome} onChange={e => setFormData({ ...formData, responsavel_nome: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cargo</Label>
                    <Input value={formData.responsavel_cargo} onChange={e => setFormData({ ...formData, responsavel_cargo: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Telefone</Label>
                    <Input value={formData.responsavel_telefone} onChange={e => setFormData({ ...formData, responsavel_telefone: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Ativo */}
              <Separator />
              <div className="flex items-center gap-2">
                <Switch checked={formData.ativo} onCheckedChange={checked => setFormData({ ...formData, ativo: checked })} />
                <Label>Convênio Ativo</Label>
              </div>
            </TabsContent>

            <TabsContent value="exames" className="flex-1 overflow-y-auto mt-4">
              {editingId ? (
                <TabelaExamesConvenio convenioId={editingId} />
              ) : (
                <div className="text-center py-10 text-muted-foreground">
                  <p>Salve o convênio primeiro para gerenciar a tabela de exames.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>Fechar</Button>
            {activeTab === 'dados' && (
              <Button onClick={handleSave} disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Salvar'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir este convênio? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground" disabled={isDeleting}>
              {isDeleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default Convenios;
