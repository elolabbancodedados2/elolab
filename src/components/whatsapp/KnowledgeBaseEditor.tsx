import { friendlyErrorMessage } from '@/components/ErrorState';
import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ConfirmDialog';

type KnowledgeItem = {
  id: string;
  titulo: string;
  conteudo: string;
  created_at: string;
  updated_at: string;
};

type KnowledgeAction = 'list' | 'save' | 'delete';

export function KnowledgeBaseEditor({ agentId }: { agentId: string }) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<KnowledgeItem | null>(null);

  const invoke = useCallback(async (action: KnowledgeAction, values: Record<string, string> = {}) => {
    const { data, error } = await supabase.functions.invoke('whatsapp-agent-knowledge', {
      body: { action, agent_id: agentId, ...values },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }, [agentId]);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await invoke('list');
      setItems(Array.isArray(result?.data) ? result.data : []);
    } catch (error) {
      toast.error('Não foi possível carregar os conteúdos do agente.', {
        description: friendlyErrorMessage(error, 'Tente novamente em instantes.'),
      });
    } finally {
      setIsLoading(false);
    }
  }, [invoke]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const resetForm = () => {
    setTitulo('');
    setConteudo('');
    setEditingId(null);
  };

  const save = async () => {
    if (!titulo.trim() || !conteudo.trim()) {
      toast.error('Preencha o título e o conteúdo.');
      return;
    }
    setIsSaving(true);
    try {
      await invoke('save', {
        ...(editingId ? { document_id: editingId } : {}),
        titulo: titulo.trim(),
        conteudo: conteudo.trim(),
      });
      toast.success(editingId ? 'Conteúdo atualizado.' : 'Conteúdo adicionado à base.');
      resetForm();
      await loadItems();
    } catch (error) {
      toast.error('Não foi possível salvar o conteúdo.', {
        description: friendlyErrorMessage(error, 'Tente novamente em instantes.'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (item: KnowledgeItem) => {
    setBusyId(item.id);
    try {
      await invoke('delete', { document_id: item.id });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (editingId === item.id) resetForm();
      toast.success('Conteúdo removido.');
    } catch (error) {
      toast.error('Não foi possível remover o conteúdo.', {
        description: friendlyErrorMessage(error, 'Tente novamente em instantes.'),
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="mt-4 border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-primary" />
          Base de conhecimento
          <Badge variant="secondary" className="ml-auto">{items.length}/200</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Cadastre informações de serviços, preparo, endereço, horários e políticas para respostas mais consistentes.
        </p>
        <p className="text-xs text-amber-700">
          Use apenas informações operacionais da clínica. Não inclua dados de pacientes, prontuários ou orientações de diagnóstico.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-lg border p-3">
          <Label htmlFor={`knowledge-title-${agentId}`}>Título</Label>
          <Input
            id={`knowledge-title-${agentId}`}
            value={titulo}
            onChange={(event) => setTitulo(event.target.value)}
            maxLength={160}
            placeholder="Ex.: Preparo para exames"
          />
          <Label htmlFor={`knowledge-content-${agentId}`}>Informação</Label>
          <Textarea
            id={`knowledge-content-${agentId}`}
            value={conteudo}
            onChange={(event) => setConteudo(event.target.value)}
            maxLength={12000}
            rows={4}
            placeholder="Escreva uma orientação operacional aprovada pela clínica."
          />
          <div className="flex justify-end gap-2">
            {editingId && <Button variant="outline" size="sm" onClick={resetForm}><X className="mr-1 h-4 w-4" />Cancelar edição</Button>}
            <Button size="sm" onClick={save} disabled={isSaving || !titulo.trim() || !conteudo.trim() || (!editingId && items.length >= 200)}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : editingId ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
              {editingId ? 'Atualizar conteúdo' : 'Adicionar conteúdo'}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />Carregando base…</p>
        ) : items.length === 0 ? (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Ainda não há conteúdo. Sem fontes cadastradas, o agente deve encaminhar perguntas específicas da clínica para a equipe.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.titulo}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.conteudo}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" aria-label={`Editar ${item.titulo}`} onClick={() => { setEditingId(item.id); setTitulo(item.titulo); setConteudo(item.conteudo); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Remover ${item.titulo}`} disabled={busyId === item.id} onClick={() => setRemoveTarget(item)}>
                    {busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        title="Remover conteúdo"
        description={`Remover “${removeTarget?.titulo ?? ''}” da base de conhecimento?`}
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => { if (removeTarget) void remove(removeTarget); }}
      />
    </Card>
  );
}
