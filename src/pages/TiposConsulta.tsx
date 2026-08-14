import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Edit, Trash2, DollarSign, Clock, Palette,
  Loader2, Building2, Check, X, Stethoscope,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useConvenios } from '@/hooks/useSupabaseData';
import { CardGridSkeleton } from '@/components/ui/loading-skeleton';

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const CORES = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b',
];

interface TipoConsulta {
  id: string;
  nome: string;
  descricao: string | null;
  duracao_minutos: number;
  cor: string;
  ativo: boolean;
  valor_particular: number;
  created_at: string;
}

interface PrecoConvenio {
  id: string;
  tipo_consulta_id: string;
  convenio_id: string;
  valor: number;
  ativo: boolean;
}

interface TipoForm {
  nome: string;
  descricao: string;
  duracao_minutos: number;
  cor: string;
  ativo: boolean;
  valor_particular: number;
}

const initialForm: TipoForm = {
  nome: '', descricao: '', duracao_minutos: 30,
  cor: '#6366f1', ativo: true, valor_particular: 0,
};

export default function TiposConsulta() {
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TipoConsulta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TipoConsulta | null>(null);
  const [precosOpen, setPrecosOpen] = useState(false);
  const [precosTipo, setPrecosTipo] = useState<TipoConsulta | null>(null);
  const [form, setForm] = useState<TipoForm>(initialForm);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('tipos');

  const { user, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const { data: convenios = [] } = useConvenios();

  const { data: tipos = [], isLoading } = useQuery({
    queryKey: ['tipos_consulta'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_consulta')
        .select('*')
        .order('nome');
      if (error) throw error;
      return data as TipoConsulta[];
    },
    enabled: !!user,
  });

  const { data: precos = [] } = useQuery({
    queryKey: ['precos_consulta_convenio'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('precos_consulta_convenio')
        .select('*');
      if (error) throw error;
      return data as PrecoConvenio[];
    },
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return tipos;
    const q = search.toLowerCase();
    return tipos.filter(t => t.nome.toLowerCase().includes(q));
  }, [tipos, search]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(initialForm);
    setFormOpen(true);
  };

  const openEdit = (t: TipoConsulta) => {
    setEditTarget(t);
    setForm({
      nome: t.nome, descricao: t.descricao || '', duracao_minutos: t.duracao_minutos,
      cor: t.cor, ativo: t.ativo, valor_particular: t.valor_particular,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório.'); return; }
    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        duracao_minutos: form.duracao_minutos,
        cor: form.cor,
        ativo: form.ativo,
        valor_particular: form.valor_particular,
      };
      if (editTarget) {
        const { error } = await supabase.from('tipos_consulta').update(payload).eq('id', editTarget.id);
        if (error) throw error;
        toast.success('Tipo atualizado!');
      } else {
        const { error } = await supabase.from('tipos_consulta').insert({ ...payload, clinica_id: profile?.clinica_id || null });
        if (error) throw error;
        toast.success('Tipo criado!');
      }
      queryClient.invalidateQueries({ queryKey: ['tipos_consulta'] });
      setFormOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { data, error } = await supabase.from('tipos_consulta').delete().eq('id', deleteTarget.id).select('id');
    if (error) { toast.error('Erro ao excluir: ' + error.message); return; }
    if (!data || data.length === 0) { toast.error('Sem permissão para excluir.'); return; }
    queryClient.invalidateQueries({ queryKey: ['tipos_consulta'] });
    toast.success('Tipo excluído!');
    setDeleteTarget(null);
  };

  const openPrecos = (t: TipoConsulta) => {
    setPrecosTipo(t);
    setPrecosOpen(true);
  };

  const handleSavePreco = async (convenioId: string, valor: number) => {
    if (!precosTipo) return;
    const existing = precos.find(
      p => p.tipo_consulta_id === precosTipo.id && p.convenio_id === convenioId
    );
    try {
      if (existing) {
        const { error } = await supabase.from('precos_consulta_convenio')
          .update({ valor }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('precos_consulta_convenio')
          .insert({ tipo_consulta_id: precosTipo.id, convenio_id: convenioId, valor, clinica_id: profile?.clinica_id || null });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['precos_consulta_convenio'] });
      toast.success('Preço salvo!');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const getPrecoConvenio = (tipoId: string, convenioId: string) => {
    return precos.find(p => p.tipo_consulta_id === tipoId && p.convenio_id === convenioId);
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-primary" /> Tipos & Preços de Consulta
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cadastre tipos de consulta e defina preços por convênio
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo Tipo
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar tipo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Grid of types */}
      {isLoading ? (
        <CardGridSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Stethoscope className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="font-bold">Nenhum tipo de consulta cadastrado</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Novo Tipo" para começar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((tipo, i) => {
              const precosConv = precos.filter(p => p.tipo_consulta_id === tipo.id);
              return (
                <motion.div key={tipo.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.03 }}>
                  <Card className="group hover:shadow-md hover:-translate-y-0.5 transition-all">
                    <CardContent className="pt-5 pb-4 px-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: tipo.cor + '20' }}>
                            <Stethoscope className="h-5 w-5" style={{ color: tipo.cor }} />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm">{tipo.nome}</h3>
                            {tipo.descricao && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{tipo.descricao}</p>}
                          </div>
                        </div>
                        <Badge variant={tipo.ativo ? 'default' : 'secondary'} className="text-[10px]">
                          {tipo.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3 w-3" /> {tipo.duracao_minutos} min
                        </div>
                        <div className="flex items-center gap-1.5 font-bold text-success">
                          <DollarSign className="h-3 w-3" /> {fmt(tipo.valor_particular)}
                        </div>
                      </div>

                      {precosConv.length > 0 && (
                        <div className="text-[10px] text-muted-foreground mb-3">
                          {precosConv.length} convênio(s) configurado(s)
                        </div>
                      )}

                      <Separator className="mb-3" />
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="sm" className="flex-1 text-xs gap-1" onClick={() => openPrecos(tipo)}>
                          <Building2 className="h-3 w-3" /> Preços
                        </Button>
                        <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => openEdit(tipo)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-xs gap-1 text-destructive" onClick={() => setDeleteTarget(tipo)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar Tipo' : 'Novo Tipo de Consulta'}</DialogTitle>
            <DialogDescription>Defina nome, duração e valor particular.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Consulta Inicial" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Descrição opcional..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Duração (min)</Label>
                <Input type="number" value={form.duracao_minutos} onChange={e => setForm({ ...form, duracao_minutos: parseInt(e.target.value) || 30 })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Particular (R$)</Label>
                <Input type="number" step="0.01" value={form.valor_particular} onChange={e => setForm({ ...form, valor_particular: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cor</Label>
              <div className="flex gap-2 flex-wrap">
                {CORES.map(c => (
                  <button key={c} onClick={() => setForm({ ...form, cor: c })}
                    className={cn('h-8 w-8 rounded-lg border-2 transition-all', form.cor === c ? 'border-foreground scale-110' : 'border-transparent')}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} />
              <Label className="text-xs">Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editTarget ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preços por Convênio Dialog */}
      <Dialog open={precosOpen} onOpenChange={setPrecosOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Preços — {precosTipo?.nome}
            </DialogTitle>
            <DialogDescription>
              Valor particular: {precosTipo && fmt(precosTipo.valor_particular)}. Configure valores por convênio abaixo.
            </DialogDescription>
          </DialogHeader>
          {convenios.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>Nenhum convênio cadastrado.</p>
              <p className="text-xs">Cadastre convênios primeiro em Operacional → Convênios.</p>
            </div>
          ) : (
            <div className="rounded-md border max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Convênio</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead className="w-40">Valor (R$)</TableHead>
                    <TableHead className="w-20 text-center">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {convenios.filter(c => c.ativo).map(conv => {
                    const preco = precosTipo ? getPrecoConvenio(precosTipo.id, conv.id) : null;
                    return (
                      <PrecoRow key={conv.id} convenio={conv} precoAtual={preco?.valor ?? null}
                        onSave={(valor) => handleSavePreco(conv.id, valor)} />
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Excluir Tipo de Consulta"
        description={`Tem certeza que deseja excluir "${deleteTarget?.nome}"? Esta ação removerá também todos os preços por convênio vinculados.`}
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  );
}

// Sub-component for inline price editing
function PrecoRow({ convenio, precoAtual, onSave }: {
  convenio: any; precoAtual: number | null; onSave: (valor: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [valor, setValor] = useState(precoAtual?.toString() ?? '');

  const save = () => {
    const v = parseFloat(valor.replace(',', '.'));
    if (isNaN(v) || v < 0) { toast.error('Valor inválido'); return; }
    onSave(v);
    setEditing(false);
  };

  return (
    <TableRow>
      <TableCell className="font-medium text-sm">{convenio.nome}</TableCell>
      <TableCell className="text-xs text-muted-foreground font-mono">{convenio.codigo}</TableCell>
      <TableCell>
        {editing ? (
          <Input type="number" step="0.01" value={valor} autoFocus
            onChange={e => setValor(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            className="h-8 text-sm" />
        ) : (
          <span className={cn('text-sm font-bold tabular-nums', precoAtual !== null ? 'text-success' : 'text-muted-foreground')}>
            {precoAtual !== null ? fmt(precoAtual) : '—'}
          </span>
        )}
      </TableCell>
      <TableCell className="text-center">
        {editing ? (
          <div className="flex gap-1 justify-center">
            <Button aria-label="Salvar preço" variant="ghost" size="icon" className="h-7 w-7" onClick={save}><Check className="h-3.5 w-3.5 text-success" /></Button>
            <Button aria-label="Cancelar edição do preço" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /></Button>
          </div>
        ) : (
          <Button aria-label="Editar preço" variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setValor(precoAtual?.toString() ?? ''); setEditing(true); }}>
            <Edit className="h-3.5 w-3.5" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
