import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Copy } from 'lucide-react';
import DOMPurify from 'dompurify';

const CATEGORIAS = [
  { value: 'lembrete_consulta', label: 'Lembrete de Consulta' },
  { value: 'confirmacao', label: 'Confirmação' },
  { value: 'resultado_exame', label: 'Resultado de Exame' },
  { value: 'aniversario', label: 'Aniversário' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'estoque', label: 'Estoque' },
  { value: 'geral', label: 'Geral' },
];

const VARIAVEIS_GRUPOS = {
  'Paciente': ['paciente_nome', 'cpf'],
  'Consulta': ['data', 'horario', 'medico_nome', 'tipo_consulta'],
  'Clínica': ['clinica_nome', 'clinica_endereco', 'clinica_telefone'],
  'Exame': ['tipo_exame', 'data_resultado', 'link_portal'],
  'Financeiro': ['descricao', 'valor', 'forma_pagamento'],
  'Estoque': ['item_nome', 'quantidade_atual', 'quantidade_minima', 'localizacao'],
};

const VALORES_EXEMPLO = {
  paciente_nome: 'João Silva',
  cpf: '123.456.789-10',
  data: '15/04/2026',
  horario: '14:30',
  medico_nome: 'Dr. Carlos Santos',
  tipo_consulta: 'Consulta Clínica',
  clinica_nome: 'Clínica Médica',
  clinica_endereco: 'Rua Principal, 100 — São Paulo/SP',
  clinica_telefone: '(11) 3000-0000',
  tipo_exame: 'Hemograma Completo',
  data_resultado: '14/04/2026',
  link_portal: 'https://app.elolab.com.br/portal',
  descricao: 'Consulta Clínica',
  valor: 'R$ 150,00',
  forma_pagamento: 'Cartão de Crédito',
  item_nome: 'Luva Nitrílica P',
  quantidade_atual: '5',
  quantidade_minima: '20',
  localizacao: 'Armário A1',
};

const sanitizeTemplateHtml = (html: string) => DOMPurify.sanitize(html, {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
});

export default function TemplatesEmail() {
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({
    nome: '',
    categoria: '',
    assunto: '',
    conteudo: '',
    ativo: true,
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState('editar');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const templatesQuery = useQuery({
    queryKey: ['templates', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const { data, error } = await supabase
        .from('notification_templates')
        .select('*')
        .eq('clinica_id', profile.clinica_id)
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });
  const templates = templatesQuery.data || [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim() || !form.categoria || !form.assunto.trim() || !form.conteudo.trim()) {
        throw new Error('Preencha todos os campos');
      }
      if (!profile?.clinica_id) throw new Error('Clínica não identificada');

      const conteudoSeguro = sanitizeTemplateHtml(form.conteudo);
      if (!conteudoSeguro.trim()) throw new Error('O conteúdo ficou vazio após remover elementos não permitidos.');

      // Extract variables from content
      const regex = /\{\{(\w+)\}\}/g;
      const variaveis: string[] = [];
      let match;
      while ((match = regex.exec(`${form.assunto}\n${conteudoSeguro}`)) !== null) {
        if (!variaveis.includes(match[1])) {
          variaveis.push(match[1]);
        }
      }
      const desconhecidas = variaveis.filter(variable => !(variable in VALORES_EXEMPLO));
      if (desconhecidas.length > 0) {
        throw new Error(`Variáveis sem valor de substituição: ${desconhecidas.map(variable => `{{${variable}}}`).join(', ')}`);
      }

      if (editId) {
        const { data, error } = await supabase
          .from('notification_templates')
          .update({
            nome: form.nome.trim(),
            categoria: form.categoria,
            assunto: form.assunto.trim(),
            conteudo: conteudoSeguro,
            ativo: form.ativo,
            variaveis,
          })
          .eq('id', editId)
          .eq('clinica_id', profile.clinica_id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Este modelo não pertence à clínica atual ou não está mais disponível.');
      } else {
        const { error } = await supabase
          .from('notification_templates')
          .insert([
            {
              ...form,
              conteudo: conteudoSeguro,
              clinica_id: profile.clinica_id,
              tipo: 'email',
              variaveis,
            },
          ]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? 'Template atualizado!' : 'Template criado!');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setShowDialog(false);
      setForm({ nome: '', categoria: '', assunto: '', conteudo: '', ativo: true });
      setEditId(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada');
      const { data, error } = await supabase
        .from('notification_templates')
        .update({ ativo: !ativo })
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Este modelo não pertence à clínica atual ou não está mais disponível.');
    },
    onSuccess: () => {
      toast.success('Template atualizado!');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada');
      const { data, error } = await supabase
        .from('notification_templates')
        .delete()
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Este modelo não pertence à clínica atual ou já foi removido.');
    },
    onSuccess: () => {
      toast.success('Template deletado!');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setDeleteId(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const openNew = () => {
    setForm({ nome: '', categoria: '', assunto: '', conteudo: '', ativo: true });
    setEditId(null);
    setPreviewTab('editar');
    setShowDialog(true);
  };

  const openEdit = (template: any) => {
    setForm(template);
    setEditId(template.id);
    setPreviewTab('editar');
    setShowDialog(true);
  };

  const insertVariable = (varName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = form.conteudo;
    const before = text.substring(0, start);
    const after = text.substring(end);
    const variable = `{{${varName}}}`;

    setForm({ ...form, conteudo: before + variable + after });

    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + variable.length;
      textarea.focus();
    }, 0);
  };

  const getRenderedPreview = () => {
    let html = form.assunto;
    Object.entries(VALORES_EXEMPLO).forEach(([key, value]) => {
      html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    });
    return html;
  };

  const getContentPreview = () => {
    let html = form.conteudo;
    Object.entries(VALORES_EXEMPLO).forEach(([key, value]) => {
      html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    });
    return sanitizeTemplateHtml(html);
  };

  if (templatesQuery.isError) {
    return <ErrorState title="Não foi possível carregar os modelos de e-mail" error={templatesQuery.error} onRetry={() => void templatesQuery.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Templates de Email</h1>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Template
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templatesQuery.isLoading ? (
          [0, 1, 2].map(index => <Skeleton key={index} className="h-40 rounded-xl" />)
        ) : templates.length === 0 ? (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="py-12 text-center text-muted-foreground">
              <p className="font-medium">Nenhum modelo de e-mail cadastrado</p>
              <p className="mt-1 text-sm">Crie um modelo para reutilizar mensagens da clínica.</p>
            </CardContent>
          </Card>
        ) : templates.map((template: any) => {
          const categoryObj = CATEGORIAS.find((c) => c.value === template.categoria);
          return (
            <Card key={template.id} className={!template.ativo ? 'opacity-60' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{template.nome}</CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={template.ativo ? `Desativar modelo ${template.nome}` : `Ativar modelo ${template.nome}`}
                    onClick={() => toggleMutation.mutate({ id: template.id, ativo: template.ativo })}
                    disabled={toggleMutation.isPending}
                    className={template.ativo ? 'text-success' : 'text-muted-foreground'}
                  >
                    {template.ativo ? '●' : '○'}
                  </Button>
                </div>
                <Badge className="w-fit mt-2">{categoryObj?.label || template.categoria}</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{template.assunto}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" aria-label={`Editar modelo ${template.nome}`} onClick={() => openEdit(template)}>
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" aria-label={`Excluir modelo ${template.nome}`} onClick={() => setDeleteId(template.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={showDialog} onOpenChange={(open) => { if (!saveMutation.isPending) setShowDialog(open); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar' : 'Novo'} Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nome</label>
                <Input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Categoria</label>
                <select
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                   className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                 >
                  <option value="">Selecione</option>
                  {CATEGORIAS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Ativo</label>
                  <div className="flex items-center gap-2 h-10">
                    <Switch
                      checked={form.ativo}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, ativo: checked })
                      }
                    />
                    <span className="text-sm text-muted-foreground">
                      {form.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Assunto</label>
              <Input
                value={form.assunto}
                onChange={(e) => setForm({ ...form, assunto: e.target.value })}
                placeholder="Ex: {{paciente_nome}}, sua consulta foi confirmada"
              />
              {previewTab === 'editar' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Preview: {getRenderedPreview() || '(vazio)'}
                </p>
              )}
            </div>

            <Tabs value={previewTab} onValueChange={setPreviewTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="editar">Editar Conteúdo</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>

              <TabsContent value="editar" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">
                      Conteúdo (HTML)
                    </label>
                    <Textarea
                      ref={textareaRef}
                      value={form.conteudo}
                      onChange={(e) =>
                        setForm({ ...form, conteudo: e.target.value })
                      }
                      className="min-h-64 font-mono text-sm"
                      placeholder="Cole aqui seu HTML ou texto. Use {{variável}} para placeholders."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Variáveis Disponíveis
                    </label>
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {Object.entries(VARIAVEIS_GRUPOS).map(([grupo, vars]) => (
                        <div key={grupo}>
                          <p className="text-xs font-semibold text-foreground mb-1">
                            {grupo}
                          </p>
                          <div className="space-y-1">
                            {vars.map((v) => (
                              <Button
                                key={v}
                                size="sm"
                                variant="outline"
                                className="w-full justify-start text-xs h-8 gap-1"
                                onClick={() => insertVariable(v)}
                              >
                                <Copy className="h-3 w-3" />
                                {v}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="space-y-4">
                <div className="border rounded-lg p-4 bg-card">
                  <div className="mb-4 pb-4 border-b">
                    <p className="text-xs text-muted-foreground mb-1">Assunto:</p>
                    <p className="font-semibold text-foreground">{getRenderedPreview() || '(vazio)'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Conteúdo:</p>
                    <div
                      dangerouslySetInnerHTML={{ __html: getContentPreview() }}
                      className="prose prose-sm max-w-none"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saveMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {editId ? 'Atualizar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => {
        if (!deleteMutation.isPending && !open) setDeleteId(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo de e-mail?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. O modelo será removido permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteId) deleteMutation.mutate(deleteId);
              }}
            >
              {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
