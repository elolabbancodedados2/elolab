import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { podeGerenciarTemplatesEmail } from '@/lib/templatesEmailAccess';
import { analyzeTemplatePreview } from '@/lib/templatePreview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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
import { Plus, Edit2, Trash2, Copy, Mail, History } from 'lucide-react';
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

const sanitizeTemplateHtml = (html: string) => DOMPurify.sanitize(html, {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
});

export default function TemplatesEmail() {
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const podeGerenciar = podeGerenciarTemplatesEmail(profile);
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
  const [activationCandidate, setActivationCandidate] = useState<any | null>(null);
  const [historyTemplate, setHistoryTemplate] = useState<{ id: string; name: string } | null>(null);
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

  const historyQuery = useQuery({
    queryKey: ['notification-template-versions', profile?.clinica_id, historyTemplate?.id],
    queryFn: async () => {
      if (!profile?.clinica_id || !historyTemplate?.id) return [];
      const { data, error } = await supabase
        .from('notification_template_versions')
        .select('id, revision, action, actor_type, author_name, created_at, snapshot')
        .eq('template_id', historyTemplate.id)
        .eq('clinica_id', profile.clinica_id)
        .order('revision', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id && !!historyTemplate?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim() || !form.categoria || !form.assunto.trim() || !form.conteudo.trim()) {
        throw new Error('Preencha todos os campos');
      }
      if (!profile?.clinica_id) throw new Error('Clínica não identificada');

      const conteudoSeguro = sanitizeTemplateHtml(form.conteudo);
      if (!conteudoSeguro.trim()) throw new Error('O conteúdo ficou vazio após remover elementos não permitidos.');

      const preview = analyzeTemplatePreview({
        name: form.nome, category: form.categoria, subject: form.assunto, content: conteudoSeguro,
      });
      const variaveis = preview.usedVariables;
      if (form.ativo && preview.missingVariables.length > 0) {
        throw new Error(`Antes de ativar, resolva as variáveis sem valor para esta categoria: ${preview.missingVariables.map(variable => `{{${variable}}}`).join(', ')}`);
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
      setActivationCandidate(null);
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
      setActivationCandidate(null);
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
    return formPreview.renderedSubject;
  };

  const formPreview = analyzeTemplatePreview({
      name: form.nome, category: form.categoria, subject: form.assunto, content: form.conteudo,
  });

  const getContentPreview = () => {
    return sanitizeTemplateHtml(formPreview.renderedContent);
  };

  const activationPreview = activationCandidate ? analyzeTemplatePreview({
    name: activationCandidate.nome,
    category: activationCandidate.categoria,
    subject: activationCandidate.assunto || '',
    content: sanitizeTemplateHtml(activationCandidate.conteudo || ''),
  }) : null;

  if (templatesQuery.isError) {
    return <ErrorState title="Não foi possível carregar os modelos de e-mail" error={templatesQuery.error} onRetry={() => void templatesQuery.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-[#e3dffb] bg-gradient-to-r from-[#f6f4ff] via-white to-[#f3f1ff] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-[#1c1636]">
            <span className="rounded-xl bg-[#ece8ff] p-2 text-[#5240d6] ring-1 ring-[#e0dbfa]"><Mail className="h-5 w-5" /></span>
            Templates de e-mail
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Mensagens reutilizáveis da clínica com variáveis e pré-visualização.</p>
          {!podeGerenciar && <p className="mt-1 text-xs text-muted-foreground" role="note">Visualização disponível; somente administradores podem alterar os modelos.</p>}
        </div>
        {podeGerenciar && <Button onClick={openNew} className="w-full gap-2 sm:w-auto">
          <Plus className="h-4 w-4" /> Novo Template
        </Button>}
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
          const templatePreview = analyzeTemplatePreview({
            name: template.nome,
            category: template.categoria,
            subject: template.assunto || '',
            content: template.conteudo || '',
          });
          return (
            <Card key={template.id} className={!template.ativo ? 'opacity-60' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{template.nome}</CardTitle>
                  {podeGerenciar && <Button
                    size="sm"
                    variant="ghost"
                    aria-label={template.ativo ? `Desativar modelo ${template.nome}` : `Ativar modelo ${template.nome}`}
                    onClick={() => template.ativo
                      ? toggleMutation.mutate({ id: template.id, ativo: true })
                      : setActivationCandidate(template)}
                    disabled={toggleMutation.isPending}
                    className={template.ativo ? 'text-success' : 'text-muted-foreground'}
                  >
                    {template.ativo ? '●' : '○'}
                  </Button>}
                </div>
                <Badge className="w-fit mt-2">{categoryObj?.label || template.categoria}</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{template.assunto}</p>
                {template.ativo && templatePreview.missingVariables.length > 0 && <p className="mb-3 text-xs text-destructive" role="alert">
                  Modelo ativo com variáveis sem suporte para esta categoria: {templatePreview.missingVariables.map(variable => `{{${variable}}}`).join(', ')}.
                </p>}
                {podeGerenciar && <div className="flex gap-2">
                  <Button size="sm" variant="outline" aria-label={`Editar modelo ${template.nome}`} onClick={() => openEdit(template)}>
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" aria-label={`Histórico do modelo ${template.nome}`} onClick={() => setHistoryTemplate({ id: template.id, name: template.nome })}>
                    <History className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" aria-label={`Excluir modelo ${template.nome}`} onClick={() => setDeleteId(template.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>}
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
                <label htmlFor="email-template-nome" className="block text-sm font-medium mb-1">Nome</label>
                <Input
                  id="email-template-nome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="email-template-categoria" className="block text-sm font-medium mb-1">Categoria</label>
                <select
                  id="email-template-categoria"
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
                  <label htmlFor="email-template-ativo" className="block text-sm font-medium mb-1">Ativo</label>
                  <div className="flex items-center gap-2 h-10">
                    <Switch
                      id="email-template-ativo"
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
              <label htmlFor="email-template-assunto" className="block text-sm font-medium mb-1">Assunto</label>
              <Input
                id="email-template-assunto"
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
                    <label htmlFor="email-template-conteudo" className="block text-sm font-medium mb-1">
                      Conteúdo (HTML)
                    </label>
                    <Textarea
                      id="email-template-conteudo"
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
                <p className="text-sm text-muted-foreground">Prévia sintética: os dados exibidos são exemplos e não pertencem a pacientes reais.</p>
                {formPreview.missingVariables.length > 0 && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
                  <p className="font-medium">Variáveis que precisam ser corrigidas antes de ativar:</p>
                  <ul className="mt-1 list-inside list-disc">
                    {formPreview.missingVariables.map(variable => <li key={variable}><code>{`{{${variable}}}`}</code></li>)}
                  </ul>
                </div>}
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

      <Dialog open={!!activationCandidate} onOpenChange={(open) => {
        if (!toggleMutation.isPending && !open) setActivationCandidate(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prévia antes de ativar</DialogTitle>
            <DialogDescription>Confira a mensagem com valores sintéticos. A ativação fica bloqueada se houver variável sem suporte ou sem valor de exemplo.</DialogDescription>
          </DialogHeader>
          {activationCandidate && activationPreview && <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Modelo: <span className="font-medium text-foreground">{activationCandidate.nome}</span></p>
            {activationPreview.missingVariables.length > 0 && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
              <p className="font-medium">Corrija estas variáveis antes de ativar:</p>
              <ul className="mt-1 list-inside list-disc">
                {activationPreview.missingVariables.map(variable => <li key={variable}><code>{`{{${variable}}}`}</code></li>)}
              </ul>
            </div>}
            <div className="rounded-lg border bg-card p-4">
              <p className="mb-1 text-xs text-muted-foreground">Assunto</p>
              <p className="mb-4 border-b pb-4 font-semibold">{activationPreview.renderedSubject || '(vazio)'}</p>
              <p className="mb-2 text-xs text-muted-foreground">Conteúdo</p>
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeTemplateHtml(activationPreview.renderedContent) }} />
            </div>
          </div>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setActivationCandidate(null)} disabled={toggleMutation.isPending}>Cancelar</Button>
            {activationCandidate && <Button variant="outline" onClick={() => {
              const candidate = activationCandidate;
              setActivationCandidate(null);
              openEdit(candidate);
            }}>Editar modelo</Button>}
            <Button
              disabled={!activationCandidate || !activationPreview || activationPreview.missingVariables.length > 0 || toggleMutation.isPending}
              onClick={() => activationCandidate && toggleMutation.mutate({ id: activationCandidate.id, ativo: false })}
            >Ativar modelo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyTemplate} onOpenChange={(open) => { if (!open) setHistoryTemplate(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico: {historyTemplate?.name}</DialogTitle>
            <DialogDescription>Versões registradas pelo banco com a autoria disponível no momento da alteração.</DialogDescription>
          </DialogHeader>
          {historyQuery.isLoading ? <p role="status">Carregando histórico…</p>
            : historyQuery.isError ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar o histórico. Tente novamente.</p>
              : (historyQuery.data || []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma versão disponível para este modelo.</p>
                : <ol className="space-y-3">
                  {(historyQuery.data || []).map((version) => {
                    const snapshot = version.snapshot && typeof version.snapshot === 'object' && !Array.isArray(version.snapshot)
                      ? version.snapshot as Record<string, unknown>
                      : {};
                    const actionLabel = {
                      baseline: 'Estado inicial, autor não registrado',
                      created: 'Criado',
                      updated: 'Alterado',
                      deleted: 'Removido',
                    }[version.action] || version.action;
                    const authorLabel = version.author_name || (version.actor_type === 'legacy' ? 'Autor não registrado' : 'Sistema');
                    return <li key={version.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">Versão {version.revision} · {actionLabel}</p>
                        <time className="text-xs text-muted-foreground" dateTime={version.created_at}>{new Date(version.created_at).toLocaleString('pt-BR')}</time>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">Autor: {authorLabel}</p>
                      <p className="mt-2 text-sm">Assunto: {String(snapshot.assunto || '(sem assunto)')}</p>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm font-medium">Ver conteúdo salvo</summary>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">{String(snapshot.conteudo || '(vazio)')}</pre>
                      </details>
                    </li>;
                  })}
                </ol>}
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
