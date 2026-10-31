import { medicamentosParaLinhas } from '@/lib/templatesPrescricao';
import { useState, useMemo, useRef, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus, FileText, Pill, Edit, Trash2, Copy, Loader2, Search, X, RefreshCw, FolderKanban, Stethoscope, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { mensagemDeErro } from '@/lib/erros';
import { useSupabaseQuery } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { normalizarTexto } from '@/lib/buscaPaciente';

import { PRESCRIPTION_TYPES, CERTIFICATE_TYPES, type ClinicalTab, type PrescriptionTemplate, type CertificateTemplate } from './clinicalTemplateTypes';

export default function Templates() {
  const location = useLocation();
  const navigate = useNavigate();
  const filters = location.state?.clinicalTemplateFilters;
  const [clinicalTab, setClinicalTab] = useState<ClinicalTab>(filters?.clinicalTab ?? 'prescriptions');
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; type: 'prescription' | 'certificate'; id: string }>({ open: false, type: 'prescription', id: '' });
  const duplicateLock = useRef(false);
  const [duplicatingTemplateKey, setDuplicatingTemplateKey] = useState<string | null>(null);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false);

  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const [prescriptionSearch, setPrescriptionSearch] = useState(filters?.prescriptionSearch ?? '');
  const [certificateSearch, setCertificateSearch] = useState(filters?.certificateSearch ?? '');
  const [prescriptionTipo, setPrescriptionTipo] = useState(filters?.prescriptionTipo ?? 'todos');
  const [certificateTipo, setCertificateTipo] = useState(filters?.certificateTipo ?? 'todos');

  const prescriptionQuery = useSupabaseQuery<PrescriptionTemplate>('templates_prescricao', {
    orderBy: { column: 'nome', ascending: true },
  });

  const certificateQuery = useSupabaseQuery<CertificateTemplate>('templates_atestado', {
    orderBy: { column: 'nome', ascending: true },
  });
  const prescriptionTemplates = prescriptionQuery.data || [];
  const certificateTemplates = certificateQuery.data || [];
  const loadingPrescriptions = prescriptionQuery.isLoading;
  const loadingCertificates = certificateQuery.isLoading;

  const isLoading = loadingPrescriptions || loadingCertificates;

  const filteredPrescriptionTemplates = useMemo(() => {
    const term = normalizarTexto(prescriptionSearch);
    return prescriptionTemplates.filter(template => {
      if (prescriptionTipo !== 'todos' && (template.tipo || 'simples') !== prescriptionTipo) return false;
      if (!term) return true;
      const medicamentos = medicamentosParaLinhas(template.medicamentos).join(' ');
      const tipo = PRESCRIPTION_TYPES[template.tipo || 'simples'] || template.tipo || '';
      return [template.nome, tipo, medicamentos, template.observacoes_gerais]
        .some(value => normalizarTexto(value).includes(term));
    });
  }, [prescriptionTemplates, prescriptionSearch, prescriptionTipo]);

  const filteredCertificateTemplates = useMemo(() => {
    const term = normalizarTexto(certificateSearch);
    return certificateTemplates.filter(template => {
      if (certificateTipo !== 'todos' && (template.tipo || 'comparecimento') !== certificateTipo) return false;
      if (!term) return true;
      const tipo = CERTIFICATE_TYPES[template.tipo || 'comparecimento'] || template.tipo || '';
      return [template.nome, tipo, template.conteudo, template.cid]
        .some(value => normalizarTexto(value).includes(term));
    });
  }, [certificateTemplates, certificateSearch, certificateTipo]);

  const prescriptionGroups = useMemo(() => groupByTipo(filteredPrescriptionTemplates, PRESCRIPTION_TYPES, 'simples'), [filteredPrescriptionTemplates]);
  const certificateGroups = useMemo(() => groupByTipo(filteredCertificateTemplates, CERTIFICATE_TYPES, 'comparecimento'), [filteredCertificateTemplates]);

  const handleDelete = async () => {
    const { type, id } = deleteDialog;
    const table = type === 'prescription' ? 'templates_prescricao' : 'templates_atestado';
    if (!profile?.clinica_id || !id) {
      toast.error('Clínica não identificada. Atualize a sessão e tente novamente.');
      return;
    }

    setIsDeletingTemplate(true);
    try {
      const { data, error } = await supabase.from(table).delete()
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Este modelo não pertence à clínica atual ou já foi removido.');
      queryClient.invalidateQueries({ queryKey: [table] });
      toast.success('Template excluído');
      setDeleteDialog({ open: false, type: 'prescription', id: '' });
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error deleting template:', error);
      toast.error('Erro ao excluir template', { description: mensagemDeErro(error) });
    } finally {
      setIsDeletingTemplate(false);
    }
  };

  const duplicateTemplate = async (template: PrescriptionTemplate | CertificateTemplate, type: 'prescription' | 'certificate') => {
    if (duplicateLock.current) return;
    const table = type === 'prescription' ? 'templates_prescricao' : 'templates_atestado';
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a sessão e tente novamente.');
      return;
    }

    duplicateLock.current = true;
    setDuplicatingTemplateKey(`${type}:${template.id}`);
    try {
      const { id, created_at, updated_at, criado_por: _criadoPor, ...rest } = template as any;
      const { error } = await supabase.from(table).insert({
        ...rest,
        nome: `${template.nome} (cópia)`,
        clinica_id: profile.clinica_id,
        criado_por: profile.id,
      });

      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: [table] });
      toast.success('Template duplicado');
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error duplicating template:', error);
      toast.error('Erro ao duplicar template', { description: mensagemDeErro(error) });
    } finally {
      duplicateLock.current = false;
      setDuplicatingTemplateKey(null);
    }
  };

  const openEditor = (kind: 'prescription' | 'certificate', id?: string) => navigate(`/todos-templates/${kind === 'prescription' ? 'prescricoes' : 'atestados'}/${id ? `${id}/editar` : 'novo'}`, {
    state: { clinicalTemplateFilters: { clinicalTab, prescriptionSearch, certificateSearch, prescriptionTipo, certificateTipo } },
  });
  const openNewForActiveTab = () => openEditor(clinicalTab === 'prescriptions' ? 'prescription' : 'certificate');

  const refresh = () => {
    void prescriptionQuery.refetch();
    void certificateQuery.refetch();
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (prescriptionQuery.isError || certificateQuery.isError) {
    const failedQuery = prescriptionQuery.isError ? prescriptionQuery : certificateQuery;
    return <ErrorState title="Não foi possível carregar os templates clínicos" error={failedQuery.error} onRetry={() => {
      void prescriptionQuery.refetch();
      void certificateQuery.refetch();
    }} />;
  }

  const activeSearch = clinicalTab === 'prescriptions' ? prescriptionSearch : certificateSearch;
  const setActiveSearch = clinicalTab === 'prescriptions' ? setPrescriptionSearch : setCertificateSearch;
  const activeTipo = clinicalTab === 'prescriptions' ? prescriptionTipo : certificateTipo;
  const setActiveTipo = clinicalTab === 'prescriptions' ? setPrescriptionTipo : setCertificateTipo;
  const activeTypeMap = clinicalTab === 'prescriptions' ? PRESCRIPTION_TYPES : CERTIFICATE_TYPES;
  const activeTotal = clinicalTab === 'prescriptions' ? prescriptionTemplates.length : certificateTemplates.length;
  const activeFilteredCount = clinicalTab === 'prescriptions' ? filteredPrescriptionTemplates.length : filteredCertificateTemplates.length;
  const activeGroups = clinicalTab === 'prescriptions' ? prescriptionGroups : certificateGroups;
  const temFiltro = activeSearch.trim() !== '' || activeTipo !== 'todos';
  const limparFiltros = () => { setActiveSearch(''); setActiveTipo('todos'); };

  const totalModelos = prescriptionTemplates.length + certificateTemplates.length;
  const indicadores: { key: ClinicalTab; icon: typeof Pill; label: string; caption: string; count: number }[] = [
    { key: 'prescriptions', icon: Pill, label: 'Prescrições', caption: 'modelos de receita', count: prescriptionTemplates.length },
    { key: 'certificates', icon: FileText, label: 'Atestados', caption: 'modelos de atestado', count: certificateTemplates.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modelos clínicos"
        description={totalModelos > 0
          ? `${prescriptionTemplates.length} modelo${prescriptionTemplates.length === 1 ? '' : 's'} de prescrição · ${certificateTemplates.length} de atestado`
          : 'Modelos reutilizáveis para prescrições e atestados'}
        icon={<FolderKanban />}
        actions={
          <>
            <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
              <Link to="/prescricoes"><Stethoscope aria-hidden="true" className="h-4 w-4" /> Prescrições</Link>
            </Button>
            <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
              <Link to="/atestados"><ClipboardList aria-hidden="true" className="h-4 w-4" /> Atestados</Link>
            </Button>
            <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={refresh} aria-label="Atualizar modelos" title="Atualizar modelos">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={openNewForActiveTab} className="shrink-0 gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110">
              <Plus className="h-4 w-4" /> Novo modelo
            </Button>
          </>
        }
      />

      {/* Indicadores / seletor de categoria */}
      <section role="group" aria-label="Categorias de modelos clínicos" className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {indicadores.map(ind => {
            const Icon = ind.icon;
            const ativo = clinicalTab === ind.key;
            return (
              <button
                key={ind.key}
                type="button"
                aria-pressed={ativo}
                onClick={() => setClinicalTab(ind.key)}
                className={cn(
                  'group rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  ativo && 'border-transparent bg-gradient-primary text-white',
                )}
              >
                <div className="flex min-h-[88px] items-center gap-3 p-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', ativo ? 'bg-white/15' : 'bg-primary/10')}>
                    <Icon aria-hidden="true" className={cn('h-5 w-5', ativo ? 'text-white' : 'text-primary')} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className={cn('truncate text-xs font-semibold', ativo ? 'text-white/80' : 'text-foreground')}>{ind.label}</h3>
                      <span className={cn('text-2xl font-bold tabular-nums', ativo ? 'text-white' : 'text-primary')}>{ind.count}</span>
                    </div>
                    <p className={cn('truncate text-[11px]', ativo ? 'text-white/60' : 'text-muted-foreground')}>{ind.caption}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={activeSearch}
            onChange={event => setActiveSearch(event.target.value)}
            placeholder={clinicalTab === 'prescriptions' ? 'Buscar nome, tipo ou medicamento...' : 'Buscar nome, tipo, CID ou conteúdo...'}
            aria-label={clinicalTab === 'prescriptions' ? 'Buscar templates de prescrição' : 'Buscar templates de atestado'}
            className="h-10 rounded-full pl-9 focus-visible:ring-primary"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <TipoPill ativo={activeTipo === 'todos'} onClick={() => setActiveTipo('todos')}>Todos</TipoPill>
          {Object.entries(activeTypeMap).map(([key, label]) => (
            <TipoPill key={key} ativo={activeTipo === key} onClick={() => setActiveTipo(key)}>{label}</TipoPill>
          ))}
        </div>
        {temFiltro && (
          <Button variant="ghost" size="sm" className="h-10 gap-1.5 rounded-full text-muted-foreground" onClick={limparFiltros}>
            <X aria-hidden="true" className="h-3.5 w-3.5" /> Limpar filtros
          </Button>
        )}
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {activeFilteredCount} de {activeTotal}
        </p>
      </div>

      {/* Lista agrupada por tipo */}
      {activeFilteredCount === 0 ? (
        <Card className="rounded-2xl border-border/60 shadow-xs">
          <CardContent className="py-16 text-center text-muted-foreground">
            <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
              {clinicalTab === 'prescriptions' ? <Pill className="h-7 w-7" /> : <FileText className="h-7 w-7" />}
            </span>
            <p className="font-medium text-foreground">
              {activeTotal === 0
                ? (clinicalTab === 'prescriptions' ? 'Nenhum template de prescrição criado' : 'Nenhum template de atestado criado')
                : 'Nenhum template corresponde à busca'}
            </p>
            <p className="mt-1 text-sm">
              {activeTotal === 0
                ? (clinicalTab === 'prescriptions' ? 'Crie templates para agilizar suas prescrições' : 'Crie templates para agilizar seus atestados')
                : (clinicalTab === 'prescriptions' ? 'Tente outro nome, tipo ou medicamento.' : 'Tente outro nome, tipo, CID ou conteúdo.')}
            </p>
            {activeTotal === 0 ? (
              <Button className="mt-4 rounded-full bg-gradient-primary text-white hover:brightness-110" size="sm" onClick={openNewForActiveTab}>Novo modelo</Button>
            ) : (
              <Button className="mt-4 rounded-full" size="sm" variant="outline" onClick={limparFiltros}>Limpar filtros</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        activeGroups.map(group => {
          const Icon = clinicalTab === 'prescriptions' ? Pill : FileText;
          return (
            <section key={group.key} aria-labelledby={`modelos-grupo-${group.key}`} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <h2 id={`modelos-grupo-${group.key}`} className="text-base font-semibold text-foreground">{group.label}</h2>
                <Badge variant="outline" className="h-5 rounded-full border-border bg-white text-xs tabular-nums text-primary">{group.items.length}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {clinicalTab === 'prescriptions'
                  ? (group.items as PrescriptionTemplate[]).map(template => {
                    const linhas = medicamentosParaLinhas(template.medicamentos);
                    const podeEditar = template.clinica_id === profile?.clinica_id;
                    return (
                      <Card key={template.id} className="flex flex-col rounded-2xl border-border/60 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                        <CardContent className="flex flex-1 flex-col gap-3 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="truncate font-semibold text-foreground">{template.nome}</h3>
                              <Badge variant="outline" className="mt-1 rounded-full border-border text-[11px] text-primary">
                                {PRESCRIPTION_TYPES[template.tipo || 'simples'] || template.tipo}
                              </Badge>
                            </div>
                            <Badge variant="secondary" className="shrink-0 rounded-full text-[10px] tabular-nums">
                              {linhas.length} medicamento{linhas.length === 1 ? '' : 's'}
                            </Badge>
                          </div>

                          {linhas.length > 0 && (
                            <details className="rounded-xl border border-border/60 bg-[#F3F8FC] p-2.5 text-xs">
                              <summary className="cursor-pointer font-medium text-primary">Ver medicamentos</summary>
                              <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
                                {linhas.map((linha, index) => <li key={index}>{linha}</li>)}
                              </ol>
                              {template.observacoes_gerais && (
                                <p className="mt-2 border-t border-border/60 pt-2 text-muted-foreground">Observações: {template.observacoes_gerais}</p>
                              )}
                            </details>
                          )}

                          <div className="mt-auto flex items-center gap-1.5 pt-1">
                            <Button aria-label={`Duplicar modelo ${template.nome}`} size="sm" variant="outline" className="h-9 gap-1.5 rounded-full px-3 text-xs" disabled={duplicatingTemplateKey !== null} onClick={() => duplicateTemplate(template, 'prescription')}>
                              {duplicatingTemplateKey === `prescription:${template.id}`
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Copy className="h-3.5 w-3.5" />}
                              Duplicar
                            </Button>
                            {podeEditar && <>
                              <Button aria-label={`Editar modelo ${template.nome}`} size="sm" className="h-9 gap-1.5 rounded-full bg-gradient-primary px-3 text-xs text-white hover:brightness-110" onClick={() => openEditor('prescription', template.id)}>
                                <Edit className="h-3.5 w-3.5" /> Editar
                              </Button>
                              <Button aria-label={`Excluir modelo ${template.nome}`} size="icon" variant="ghost" className="ml-auto h-9 w-9 rounded-full text-destructive" title="Excluir" onClick={() => setDeleteDialog({ open: true, type: 'prescription', id: template.id })}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                  : (group.items as CertificateTemplate[]).map(template => {
                    const podeEditar = template.clinica_id === profile?.clinica_id;
                    return (
                      <Card key={template.id} className="flex flex-col rounded-2xl border-border/60 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                        <CardContent className="flex flex-1 flex-col gap-3 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="truncate font-semibold text-foreground">{template.nome}</h3>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline" className="rounded-full border-border text-[11px] text-primary">
                                  {CERTIFICATE_TYPES[template.tipo || 'comparecimento'] || template.tipo}
                                </Badge>
                                {template.tipo === 'afastamento' && template.dias_afastamento != null && (
                                  <Badge variant="secondary" className="rounded-full text-[10px] tabular-nums">{template.dias_afastamento} dia{template.dias_afastamento === 1 ? '' : 's'}</Badge>
                                )}
                                {template.tipo === 'afastamento' && template.cid && (
                                  <Badge variant="secondary" className="rounded-full text-[10px]">CID {template.cid}</Badge>
                                )}
                              </div>
                            </div>
                          </div>

                          {template.conteudo && (
                            <details className="rounded-xl border border-border/60 bg-[#F3F8FC] p-2.5 text-xs">
                              <summary className="cursor-pointer font-medium text-primary">Ver conteúdo</summary>
                              <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{template.conteudo}</p>
                            </details>
                          )}

                          <div className="mt-auto flex items-center gap-1.5 pt-1">
                            <Button aria-label={`Duplicar modelo ${template.nome}`} size="sm" variant="outline" className="h-9 gap-1.5 rounded-full px-3 text-xs" disabled={duplicatingTemplateKey !== null} onClick={() => duplicateTemplate(template, 'certificate')}>
                              {duplicatingTemplateKey === `certificate:${template.id}`
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Copy className="h-3.5 w-3.5" />}
                              Duplicar
                            </Button>
                            {podeEditar && <>
                              <Button aria-label={`Editar modelo ${template.nome}`} size="sm" className="h-9 gap-1.5 rounded-full bg-gradient-primary px-3 text-xs text-white hover:brightness-110" onClick={() => openEditor('certificate', template.id)}>
                                <Edit className="h-3.5 w-3.5" /> Editar
                              </Button>
                              <Button aria-label={`Excluir modelo ${template.nome}`} size="icon" variant="ghost" className="ml-auto h-9 w-9 rounded-full text-destructive" title="Excluir" onClick={() => setDeleteDialog({ open: true, type: 'certificate', id: template.id })}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </section>
          );
        })
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => { if (!isDeletingTemplate) setDeleteDialog((current) => ({ ...current, open })); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O template será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingTemplate}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void handleDelete(); }} className="bg-destructive text-destructive-foreground" disabled={isDeletingTemplate}>
              {isDeletingTemplate && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TipoPill({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
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

function groupByTipo<T extends { tipo: string | null }>(items: T[], labels: Record<string, string>, fallback: string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.tipo || fallback;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  const order = Object.keys(labels);
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
    })
    .map(([key, groupItems]) => ({ key, label: labels[key] || key, items: groupItems }));
}
