import { useState, useRef, useMemo, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { podeGerenciarTemplatesEmail } from '@/lib/templatesEmailAccess';
import { analyzeTemplatePreview } from '@/lib/templatePreview';
import { cn } from '@/lib/utils';
import { normalizarTexto } from '@/lib/buscaPaciente';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/PageHeader';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
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
import { Plus, Edit2, Trash2, Copy, Mail, History, Search, X, RefreshCw, CheckCircle2, CircleSlash, AlertTriangle, Layers } from 'lucide-react';
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

type StatusFilter = 'todos' | 'ativos' | 'inativos' | 'pendencias';

const sanitizeTemplateHtml = (html: string) => DOMPurify.sanitize(html, {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
});

type EmailTask = 'new' | 'edit' | 'activate' | 'history';
export default function TemplatesEmail({ task }: { task?: EmailTask }) {
  const location = useLocation();
  const { profile } = useSupabaseAuth();
  return <EmailWorkspace key={`${location.pathname}:${profile?.clinica_id ?? ''}`} task={task} />;
}

function EmailWorkspace({ task }: { task?: EmailTask }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { templateId } = useParams();
  const filters = location.state?.emailTemplateFilters;
  const initialized = useRef(false);
  const completed = useRef(false);
  const saveLock = useRef(false);
  const baseline = useRef(JSON.stringify({ nome: '', categoria: '', assunto: '', conteudo: '', ativo: true }));
  const expectedVersion = useRef<string | null>(null);
  const editingForm = task === 'new' || task === 'edit';
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const podeGerenciar = podeGerenciarTemplatesEmail(profile);
  const [form, setForm] = useState({
    nome: '',
    categoria: '',
    assunto: '',
    conteudo: '',
    ativo: true,
  });
  const editId = task === 'edit' ? templateId : null;
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState('editar');
  const [search, setSearch] = useState(filters?.search ?? '');
  const [categoriaFilter, setCategoriaFilter] = useState(filters?.categoriaFilter ?? 'todas');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(filters?.statusFilter ?? 'todos');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const templatesQuery = useQuery({
    queryKey: ['templates', profile?.clinica_id, task, templateId],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      let query = supabase.from('notification_templates').select('*').eq('clinica_id', profile.clinica_id).order('nome');
      if (task) query = query.eq('id', templateId!);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id && task !== 'new',
  });
  const templates = useMemo(() => templatesQuery.data || [], [templatesQuery.data]);

  const selectedTemplate = task && task !== 'new' ? templates[0] : null;
  const activationCandidate = task === 'activate' ? selectedTemplate : null;
  const historyTemplate = task === 'history' && selectedTemplate ? { id: selectedTemplate.id, name: selectedTemplate.nome } : null;
  useEffect(() => {
    if (task !== 'edit' || !selectedTemplate || initialized.current) return;
    const initial = { nome: selectedTemplate.nome, categoria: selectedTemplate.categoria, assunto: selectedTemplate.assunto || '', conteudo: selectedTemplate.conteudo || '', ativo: selectedTemplate.ativo ?? false };
    setForm(initial);
    baseline.current = JSON.stringify(initial);
    expectedVersion.current = selectedTemplate.updated_at;
    initialized.current = true;
  }, [selectedTemplate, task]);
  const listState = { emailTemplateFilters: { search, categoriaFilter, statusFilter } };
  const back = () => navigate('/todos-templates?tab=email', { state: listState });
  const openTask = (destination: EmailTask, id?: string) => navigate(`/todos-templates/email/${destination === 'new' ? 'novo' : `${id}/${({ edit: 'editar', activate: 'ativar', history: 'historico' } as const)[destination]}`}`, { state: listState });
  const dirty = editingForm && JSON.stringify(form) !== baseline.current;

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
      if (!podeGerenciar || templatesQuery.isError || (task === 'edit' && !initialized.current)) throw new Error('Modelo indisponível para edição.');
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
          .filter('updated_at', expectedVersion.current == null ? 'is' : 'eq', expectedVersion.current)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Este modelo foi alterado ou removido. Seu texto foi preservado; volte à lista e reabra a versão atual antes de salvar.');
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
      completed.current = true;
      back();
    },
    onError: (error: any) => toast.error(error.message),
    onSettled: () => { saveLock.current = false; },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada');
      if (!podeGerenciar || templatesQuery.isError) throw new Error('Operação indisponível. Atualize o modelo e tente novamente.');
      if (!ativo) {
        if (!activationCandidate || activationCandidate.id !== id || activationCandidate.ativo) throw new Error('Este modelo não está disponível para ativação.');
        const preview = analyzeTemplatePreview({ name: activationCandidate.nome, category: activationCandidate.categoria, subject: activationCandidate.assunto || '', content: sanitizeTemplateHtml(activationCandidate.conteudo || '') });
        if (preview.missingVariables.length) throw new Error('Corrija as variáveis da mensagem antes de ativar.');
      }
      let query = supabase
        .from('notification_templates')
        .update({ ativo: !ativo })
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id);
      if (task === 'activate') query = query.filter('updated_at', activationCandidate?.updated_at == null ? 'is' : 'eq', activationCandidate?.updated_at ?? null);
      const { data, error } = await query.select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Este modelo não pertence à clínica atual ou não está mais disponível.');
    },
    onSuccess: () => {
      toast.success('Template atualizado!');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      if (task === 'activate') { completed.current = true; back(); }
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

  const duplicateMutation = useMutation({
    mutationFn: async (template: any) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada');
      const conteudoSeguro = sanitizeTemplateHtml(template.conteudo || '');
      const preview = analyzeTemplatePreview({
        name: template.nome, category: template.categoria, subject: template.assunto || '', content: conteudoSeguro,
      });
      const { error } = await supabase
        .from('notification_templates')
        .insert([
          {
            nome: `${template.nome} (cópia)`,
            categoria: template.categoria,
            assunto: template.assunto || '',
            conteudo: conteudoSeguro,
            ativo: false,
            clinica_id: profile.clinica_id,
            tipo: 'email',
            variaveis: preview.usedVariables,
          },
        ]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Template duplicado!');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const openNew = () => openTask('new');
  const openEdit = (template: { id: string }) => openTask('edit', template.id);

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

  const templatesComputed = useMemo(() => templates.map((template: any) => {
    const preview = analyzeTemplatePreview({
      name: template.nome,
      category: template.categoria,
      subject: template.assunto || '',
      content: template.conteudo || '',
    });
    return { template, preview };
  }), [templates]);

  const stats = useMemo(() => ({
    total: templatesComputed.length,
    ativos: templatesComputed.filter(({ template }) => template.ativo).length,
    inativos: templatesComputed.filter(({ template }) => !template.ativo).length,
    pendencias: templatesComputed.filter(({ template, preview }) => template.ativo && preview.missingVariables.length > 0).length,
  }), [templatesComputed]);

  const filtered = useMemo(() => {
    const term = normalizarTexto(search);
    return templatesComputed.filter(({ template, preview }) => {
      if (categoriaFilter !== 'todas' && template.categoria !== categoriaFilter) return false;
      if (statusFilter === 'ativos' && !template.ativo) return false;
      if (statusFilter === 'inativos' && template.ativo) return false;
      if (statusFilter === 'pendencias' && !(template.ativo && preview.missingVariables.length > 0)) return false;
      if (!term) return true;
      const categoriaLabel = CATEGORIAS.find(c => c.value === template.categoria)?.label || template.categoria || '';
      return [template.nome, template.assunto, categoriaLabel].some(value => normalizarTexto(value).includes(term));
    });
  }, [templatesComputed, search, categoriaFilter, statusFilter]);

  const grupos = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const entry of filtered) {
      const key = entry.template.categoria || 'geral';
      const bucket = map.get(key);
      if (bucket) bucket.push(entry);
      else map.set(key, [entry]);
    }
    const order = CATEGORIAS.map(c => c.value);
    return [...map.entries()]
      .sort(([a], [b]) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
      })
      .map(([key, items]) => ({ key, label: CATEGORIAS.find(c => c.value === key)?.label || key, items }));
  }, [filtered]);

  const temFiltro = search.trim() !== '' || categoriaFilter !== 'todas' || statusFilter !== 'todos';
  const limparFiltros = () => { setSearch(''); setCategoriaFilter('todas'); setStatusFilter('todos'); };

  if (task) {
    const busy = saveMutation.isPending || toggleMutation.isPending;
    const title = task === 'new' ? 'Novo modelo de e-mail' : task === 'edit' ? 'Editar modelo de e-mail' : task === 'activate' ? 'Prévia antes de ativar' : `Histórico: ${historyTemplate?.name || 'modelo de e-mail'}`;
    const ready = task === 'new' || (task === 'edit' ? initialized.current : !!selectedTemplate);
    return <div className="space-y-5 pb-24 lg:pb-8">
      <UnsavedChangesGuard dirty={dirty} busy={busy} completed={completed} />
      <Button asChild variant="outline"><Link to="/todos-templates?tab=email" state={listState}>Voltar aos modelos de e-mail</Link></Button>
      <div className="w-full space-y-6">
        <PageHeader title={title} icon={<Mail />} description={task === 'history' ? 'Versões registradas pelo banco, com autoria e conteúdo preservados.' : 'Configure e revise a mensagem. As prévias usam exemplos sintéticos, sem dados de pacientes reais.'} />
        {templatesQuery.isError && <ErrorState title="Não foi possível carregar o modelo de e-mail" error={templatesQuery.error} onRetry={() => void templatesQuery.refetch()} />}
        {!ready && templatesQuery.isLoading ? <Skeleton className="h-80" /> : !ready && !templatesQuery.isError ? <p role="status" className="rounded-xl border bg-card p-6">Modelo indisponível nesta clínica. Volte à lista e escolha um modelo existente.</p> : null}
        {ready && editingForm && <form onSubmit={event => { event.preventDefault(); if (saveLock.current) return; saveLock.current = true; saveMutation.mutate(); }} className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <fieldset className="min-w-0" disabled={busy || templatesQuery.isError || !podeGerenciar}>
            <legend className="sr-only">Conteúdo e disponibilidade do modelo</legend>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="email-template-nome" className="block text-sm font-medium mb-1">Nome</label>
                <Input
                  id="email-template-nome" required
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="email-template-categoria" className="block text-sm font-medium mb-1">Categoria</label>
                <select
                  id="email-template-categoria" required
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
                id="email-template-assunto" required
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

            <Tabs activationMode="manual" value={previewTab} onValueChange={setPreviewTab}>
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
                      id="email-template-conteudo" required
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
                                type="button"
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


            <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t pt-4 scroll-mb-24">
              <span role="status" className="mr-auto w-full text-xs text-muted-foreground sm:w-auto">{busy ? 'Salvando…' : dirty ? 'Alterações não salvas' : 'Sem alterações'}</span>
              <Button type="button" variant="outline" onClick={back}>Cancelar</Button>
              <Button type="submit">{editId ? 'Atualizar' : 'Criar'}</Button>
            </div>
          </fieldset>
        </form>}
        {ready && task === 'activate' && <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
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

          {activationCandidate?.ativo && <p role="status">Este modelo já está ativo.</p>}
          <div className="flex flex-wrap justify-end gap-3 border-t pt-4 scroll-mb-24">
            <Button variant="outline" onClick={back} disabled={busy}>Cancelar</Button>
            <Button variant="outline" disabled={busy} onClick={() => selectedTemplate && openEdit(selectedTemplate)}>Editar modelo</Button>
            <Button disabled={!activationCandidate || activationCandidate.ativo || !activationPreview || activationPreview.missingVariables.length > 0 || busy || templatesQuery.isError || !podeGerenciar} onClick={() => activationCandidate && toggleMutation.mutate({ id: activationCandidate.id, ativo: false })}>Ativar modelo</Button>
          </div>
        </section>}
        {ready && task === 'history' && <section className="rounded-xl border bg-card p-4 sm:p-6">
          {historyQuery.isLoading ? <p role="status">Carregando histórico…</p>
            : historyQuery.isError ? <ErrorState title="Não foi possível carregar o histórico" error={historyQuery.error} onRetry={() => void historyQuery.refetch()} />
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

        </section>}
      </div>
    </div>;
  }

  if (templatesQuery.isError) {
    return <ErrorState title="Não foi possível carregar os modelos de e-mail" error={templatesQuery.error} onRetry={() => void templatesQuery.refetch()} />;
  }

  const indicadores: { key: StatusFilter; icon: typeof Mail; label: string; caption: string; count: number; color: string; surface: string; escuro?: boolean }[] = [
    { key: 'todos', icon: Mail, label: 'Modelos', caption: 'cadastrados na clínica', count: stats.total, color: 'text-foreground', surface: 'bg-secondary', escuro: false },
    { key: 'ativos', icon: CheckCircle2, label: 'Ativos', caption: 'enviando mensagens', count: stats.ativos, color: 'text-success', surface: 'bg-success/10' },
    { key: 'inativos', icon: CircleSlash, label: 'Inativos', caption: 'pausados', count: stats.inativos, color: 'text-primary', surface: 'bg-primary/10' },
    { key: 'pendencias', icon: AlertTriangle, label: 'Com pendência', caption: 'variáveis sem valor', count: stats.pendencias, color: 'text-warning', surface: 'bg-warning/10' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates de e-mail"
        description={stats.total > 0
          ? `${stats.total} modelo${stats.total === 1 ? '' : 's'} · ${stats.ativos} ativo${stats.ativos === 1 ? '' : 's'}${stats.pendencias > 0 ? ` · ${stats.pendencias} com pendência` : ''}`
          : 'Mensagens reutilizáveis da clínica com variáveis e pré-visualização.'}
        icon={<Mail />}
        actions={
          <>
            <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={() => void templatesQuery.refetch()} aria-label="Atualizar modelos de e-mail" title="Atualizar modelos de e-mail">
              <RefreshCw className="h-4 w-4" />
            </Button>
            {podeGerenciar && (
              <Button onClick={openNew} className="shrink-0 gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110">
                <Plus className="h-4 w-4" /> Novo Template
              </Button>
            )}
          </>
        }
      />
      {!podeGerenciar && <p className="text-xs text-muted-foreground" role="note">Visualização disponível; somente administradores podem alterar os modelos.</p>}

      {/* Indicadores */}
      {stats.total > 0 && (
        <section role="group" aria-label="Situação dos modelos de e-mail" className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {indicadores.map(ind => {
            const Icon = ind.icon;
            const ativo = statusFilter === ind.key;
            return (
              <button
                key={ind.key}
                type="button"
                aria-pressed={ativo}
                onClick={() => setStatusFilter(ativo && ind.key !== 'todos' ? 'todos' : ind.key)}
                className={cn(
                  'group rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  ind.escuro && 'border-transparent bg-gradient-primary text-white',
                  ativo && !ind.escuro && 'border-primary/50 ring-1 ring-primary/30',
                  ativo && ind.escuro && 'ring-2 ring-primary/60',
                )}
              >
                <div className="flex min-h-[88px] items-center gap-3 p-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', ind.surface)}>
                    <Icon aria-hidden="true" className={cn('h-5 w-5', ind.color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className={cn('truncate text-xs font-semibold', ind.escuro ? 'text-white/80' : 'text-foreground')}>{ind.label}</h3>
                      <span className={cn('text-2xl font-bold tabular-nums', ind.color)}>{ind.count}</span>
                    </div>
                    <p className={cn('truncate text-[11px]', ind.escuro ? 'text-white/60' : 'text-muted-foreground')}>{ind.caption}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </section>
      )}

      {/* Filtros */}
      {stats.total > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar nome, assunto ou categoria..."
              aria-label="Buscar modelos de e-mail"
              className="h-10 rounded-full pl-9 focus-visible:ring-primary"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoriaPill ativo={categoriaFilter === 'todas'} onClick={() => setCategoriaFilter('todas')}>Todas</CategoriaPill>
            {CATEGORIAS.map(categoria => (
              <CategoriaPill key={categoria.value} ativo={categoriaFilter === categoria.value} onClick={() => setCategoriaFilter(categoria.value)}>{categoria.label}</CategoriaPill>
            ))}
          </div>
          {temFiltro && (
            <Button variant="ghost" size="sm" className="h-10 gap-1.5 rounded-full text-muted-foreground" onClick={limparFiltros}>
              <X aria-hidden="true" className="h-3.5 w-3.5" /> Limpar filtros
            </Button>
          )}
          <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
            {filtered.length} de {stats.total}
          </p>
        </div>
      )}

      {/* Lista */}
      {templatesQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(index => <Skeleton key={index} className="h-40 rounded-2xl" />)}
        </div>
      ) : templates.length === 0 ? (
        <Card className="rounded-2xl border-border/60 shadow-xs">
          <CardContent className="py-16 text-center text-muted-foreground">
            <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
              <Mail className="h-7 w-7" />
            </span>
            <p className="font-medium text-foreground">Nenhum modelo de e-mail cadastrado</p>
            <p className="mt-1 text-sm">Crie um modelo para reutilizar mensagens da clínica.</p>
            {podeGerenciar && <Button className="mt-4 rounded-full bg-gradient-primary text-white hover:brightness-110" size="sm" onClick={openNew}>Novo Template</Button>}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-border/60 shadow-xs">
          <CardContent className="py-16 text-center text-muted-foreground">
            <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
              <Search className="h-7 w-7" />
            </span>
            <p className="font-medium text-foreground">Nenhum modelo corresponde aos filtros</p>
            <p className="mt-1 text-sm">Limpe a busca, a categoria ou a situação para ver todos os modelos.</p>
            <Button className="mt-4 rounded-full" size="sm" variant="outline" onClick={limparFiltros}>Limpar filtros</Button>
          </CardContent>
        </Card>
      ) : (
        grupos.map(grupo => (
          <section key={grupo.key} aria-labelledby={`email-grupo-${grupo.key}`} className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground">
                <Layers className="h-4 w-4" />
              </span>
              <h2 id={`email-grupo-${grupo.key}`} className="text-base font-semibold text-foreground">{grupo.label}</h2>
              <Badge variant="outline" className="h-5 rounded-full border-border bg-white text-xs tabular-nums text-primary">{grupo.items.length}</Badge>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {grupo.items.map(({ template, preview }) => (
                <Card key={template.id} className={cn('flex flex-col rounded-2xl border-border/60 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md', !template.ativo && 'opacity-70')}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="min-w-0 truncate text-base">{template.nome}</CardTitle>
                      {podeGerenciar && <Button
                        size="icon"
                        variant="ghost"
                        aria-label={template.ativo ? `Desativar modelo ${template.nome}` : `Ativar modelo ${template.nome}`}
                        onClick={() => template.ativo
                          ? toggleMutation.mutate({ id: template.id, ativo: true })
                          : openTask('activate', template.id)}
                        disabled={toggleMutation.isPending}
                        className={cn('h-8 w-8 shrink-0 rounded-full', template.ativo ? 'text-success' : 'text-muted-foreground')}
                      >
                        {template.ativo ? '●' : '○'}
                      </Button>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="rounded-full border-border text-[11px] text-primary">{CATEGORIAS.find(c => c.value === template.categoria)?.label || template.categoria}</Badge>
                      <Badge variant="outline" className={cn('rounded-full text-[10px]', template.ativo ? 'border-success/30 bg-success/10 text-success' : 'border-border/60 text-muted-foreground')}>{template.ativo ? 'Ativo' : 'Inativo'}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3">
                    <p className="line-clamp-2 text-sm text-muted-foreground">{template.assunto}</p>
                    {template.ativo && preview.missingVariables.length > 0 && <p className="text-xs text-destructive" role="alert">
                      Modelo ativo com variáveis sem suporte para esta categoria: {preview.missingVariables.map(variable => `{{${variable}}}`).join(', ')}.
                    </p>}
                    {template.conteudo && (
                      <details className="rounded-xl border border-border/60 bg-secondary p-2.5 text-xs">
                        <summary className="cursor-pointer font-medium text-primary">Ver conteúdo</summary>
                        <div className="prose prose-sm mt-2 max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeTemplateHtml(preview.renderedContent) }} />
                      </details>
                    )}
                    {podeGerenciar && <div className="mt-auto flex items-center gap-1.5 pt-1">
                      <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-full px-3 text-xs" aria-label={`Duplicar modelo ${template.nome}`} disabled={duplicateMutation.isPending} onClick={() => duplicateMutation.mutate(template)}>
                        <Copy className="h-3.5 w-3.5" /> Duplicar
                      </Button>
                      <Button size="sm" className="h-9 gap-1.5 rounded-full bg-gradient-primary px-3 text-xs text-white hover:brightness-110" aria-label={`Editar modelo ${template.nome}`} onClick={() => openEdit(template)}>
                        <Edit2 className="h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button size="icon" variant="outline" className="h-9 w-9 rounded-full" aria-label={`Histórico do modelo ${template.nome}`} title="Histórico" onClick={() => openTask('history', template.id)}>
                        <History className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="ml-auto h-9 w-9 rounded-full text-destructive" aria-label={`Excluir modelo ${template.nome}`} title="Excluir" onClick={() => setDeleteId(template.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}

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

function CategoriaPill({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'h-8 rounded-full border px-3 text-xs transition-colors',
        ativo
          ? 'border-transparent bg-gradient-primary text-white shadow-sm'
          : 'border-border/60 bg-card text-muted-foreground hover:border-[#9CC7EC]',
      )}
    >
      {children}
    </button>
  );
}
