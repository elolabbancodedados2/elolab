import { medicamentosParaLinhas, textoParaMedicamentos } from '@/lib/templatesPrescricao';
import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, FileText, Pill, Edit, Trash2, Copy, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { useSupabaseQuery } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { normalizarTexto } from '@/lib/buscaPaciente';

const PRESCRIPTION_TYPES: Record<string, string> = {
  simples: 'Receita Simples',
  controle_especial: 'Controle Especial',
  antimicrobiano: 'Antimicrobiano',
};

const CERTIFICATE_TYPES: Record<string, string> = {
  comparecimento: 'Comparecimento',
  afastamento: 'Afastamento',
  aptidao: 'Aptidão',
  acompanhante: 'Acompanhante',
};

interface PrescriptionTemplate {
  id: string;
  clinica_id: string | null;
  nome: string;
  tipo: string | null;
  medicamentos: unknown;
  observacoes_gerais: string | null;
  criado_por: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface CertificateTemplate {
  id: string;
  clinica_id: string | null;
  nome: string;
  tipo: string | null;
  conteudo: string | null;
  cid: string | null;
  dias_afastamento: number | null;
  criado_por: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export default function Templates() {
  const [isPrescriptionFormOpen, setIsPrescriptionFormOpen] = useState(false);
  const [isCertificateFormOpen, setIsCertificateFormOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; type: 'prescription' | 'certificate'; id: string }>({ open: false, type: 'prescription', id: '' });
  const [prescriptionForm, setPrescriptionForm] = useState<Partial<PrescriptionTemplate>>({});
  const [certificateForm, setCertificateForm] = useState<Partial<CertificateTemplate>>({});
  const [isSaving, setIsSaving] = useState(false);
  const saveLock = useRef(false);
  const duplicateLock = useRef(false);
  const [duplicatingTemplateKey, setDuplicatingTemplateKey] = useState<string | null>(null);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false);

  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const [medicamentosTexto, setMedicamentosTexto] = useState('');
  const [prescriptionSearch, setPrescriptionSearch] = useState('');
  const [certificateSearch, setCertificateSearch] = useState('');

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
    if (!term) return prescriptionTemplates;
    return prescriptionTemplates.filter(template => {
      const medicamentos = medicamentosParaLinhas(template.medicamentos).join(' ');
      const tipo = PRESCRIPTION_TYPES[template.tipo || 'simples'] || template.tipo || '';
      return [template.nome, tipo, medicamentos, template.observacoes_gerais]
        .some(value => normalizarTexto(value).includes(term));
    });
  }, [prescriptionTemplates, prescriptionSearch]);

  const filteredCertificateTemplates = useMemo(() => {
    const term = normalizarTexto(certificateSearch);
    if (!term) return certificateTemplates;
    return certificateTemplates.filter(template => {
      const tipo = CERTIFICATE_TYPES[template.tipo || 'comparecimento'] || template.tipo || '';
      return [template.nome, tipo, template.conteudo, template.cid]
        .some(value => normalizarTexto(value).includes(term));
    });
  }, [certificateTemplates, certificateSearch]);

  const handleSavePrescription = async () => {
    if (saveLock.current) return;
    if (!prescriptionForm.nome?.trim() || !prescriptionForm.tipo) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a sessão e tente novamente.');
      return;
    }
    const medicamentos = textoParaMedicamentos(medicamentosTexto);
    if (medicamentos.length === 0) {
      toast.error('Informe ao menos um medicamento no modelo');
      return;
    }

    saveLock.current = true;
    setIsSaving(true);
    try {
      if (prescriptionForm.id) {
        const { data, error } = await supabase
          .from('templates_prescricao')
          .update({
            nome: prescriptionForm.nome.trim(),
            tipo: prescriptionForm.tipo,
            observacoes_gerais: prescriptionForm.observacoes_gerais,
            medicamentos: medicamentos as any,
          })
          .eq('id', prescriptionForm.id)
          .eq('clinica_id', profile.clinica_id)
          .select('id')
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Este modelo não pertence à clínica atual ou não está mais disponível.');
        toast.success('Template atualizado com sucesso');
      } else {
        const { data, error } = await supabase
          .from('templates_prescricao')
          .insert({
            nome: prescriptionForm.nome.trim(),
            tipo: prescriptionForm.tipo,
            observacoes_gerais: prescriptionForm.observacoes_gerais,
            medicamentos: medicamentos as any,
            clinica_id: profile.clinica_id,
            criado_por: profile.id,
          });

        if (error) throw error;
        toast.success('Template criado com sucesso');
      }

      queryClient.invalidateQueries({ queryKey: ['templates_prescricao'] });
      setIsPrescriptionFormOpen(false);
      setPrescriptionForm({});
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving prescription template:', error);
      toast.error('Erro ao salvar template', { description: mensagemDeErro(error) });
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

  const handleSaveCertificate = async () => {
    if (saveLock.current) return;
    if (!certificateForm.nome?.trim() || !certificateForm.tipo || !certificateForm.conteudo?.trim()) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a sessão e tente novamente.');
      return;
    }
    if (certificateForm.tipo === 'afastamento' && certificateForm.dias_afastamento != null
      && (!Number.isInteger(certificateForm.dias_afastamento) || certificateForm.dias_afastamento < 1)) {
      toast.error('Os dias de afastamento devem ser um número inteiro maior que zero.');
      return;
    }

    saveLock.current = true;
    setIsSaving(true);
    try {
      if (certificateForm.id) {
        const { data, error } = await supabase
          .from('templates_atestado')
          .update({
            nome: certificateForm.nome.trim(),
            tipo: certificateForm.tipo,
            conteudo: certificateForm.conteudo,
            cid: certificateForm.tipo === 'afastamento' ? certificateForm.cid || null : null,
            dias_afastamento: certificateForm.tipo === 'afastamento' ? certificateForm.dias_afastamento ?? null : null,
          })
          .eq('id', certificateForm.id)
          .eq('clinica_id', profile.clinica_id)
          .select('id')
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Este modelo não pertence à clínica atual ou não está mais disponível.');
        toast.success('Template atualizado com sucesso');
      } else {
        const { error } = await supabase
          .from('templates_atestado')
          .insert({
            nome: certificateForm.nome.trim(),
            tipo: certificateForm.tipo,
            conteudo: certificateForm.conteudo,
            cid: certificateForm.tipo === 'afastamento' ? certificateForm.cid || null : null,
            dias_afastamento: certificateForm.tipo === 'afastamento' ? certificateForm.dias_afastamento ?? null : null,
            clinica_id: profile.clinica_id,
            criado_por: profile.id,
          });

        if (error) throw error;
        toast.success('Template criado com sucesso');
      }

      queryClient.invalidateQueries({ queryKey: ['templates_atestado'] });
      setIsCertificateFormOpen(false);
      setCertificateForm({});
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving certificate template:', error);
      toast.error('Erro ao salvar template', { description: mensagemDeErro(error) });
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Templates</h1>
        <p className="text-muted-foreground">Modelos reutilizáveis para prescrições e atestados</p>
      </div>

      <Tabs defaultValue="prescriptions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="prescriptions" className="gap-2">
            <Pill className="h-4 w-4" />
            Prescrições
          </TabsTrigger>
          <TabsTrigger value="certificates" className="gap-2">
            <FileText className="h-4 w-4" />
            Atestados
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prescriptions" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={prescriptionSearch}
                onChange={event => setPrescriptionSearch(event.target.value)}
                placeholder="Buscar nome, tipo ou medicamento..."
                aria-label="Buscar templates de prescrição"
                className="pl-9"
              />
            </div>
            <Button onClick={() => { setPrescriptionForm({}); setMedicamentosTexto(''); setIsPrescriptionFormOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Template
            </Button>
          </div>

          {filteredPrescriptionTemplates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Pill className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>{prescriptionTemplates.length === 0 ? 'Nenhum template de prescrição criado' : 'Nenhum template corresponde à busca'}</p>
                <p className="text-sm">{prescriptionTemplates.length === 0 ? 'Crie templates para agilizar suas prescrições' : 'Tente outro nome, tipo ou medicamento.'}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredPrescriptionTemplates.map((template) => (
                <Card key={template.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{template.nome}</CardTitle>
                        <div className="text-sm text-muted-foreground">
                          <Badge variant="outline" className="mt-1">
                            {PRESCRIPTION_TYPES[template.tipo || 'simples']}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button aria-label={`Duplicar modelo ${template.nome}`} size="icon" variant="ghost" disabled={duplicatingTemplateKey !== null} onClick={() => duplicateTemplate(template, 'prescription')}>
                          {duplicatingTemplateKey === `prescription:${template.id}`
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Copy className="h-4 w-4" />}
                        </Button>
                        {template.clinica_id === profile?.clinica_id && <>
                          <Button aria-label={`Editar modelo ${template.nome}`} size="icon" variant="ghost" onClick={() => { setPrescriptionForm(template); setMedicamentosTexto(medicamentosParaLinhas(template.medicamentos).join('\n')); setIsPrescriptionFormOpen(true); }}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button aria-label={`Excluir modelo ${template.nome}`} size="icon" variant="ghost" onClick={() => setDeleteDialog({ open: true, type: 'prescription', id: template.id })}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {medicamentosParaLinhas(template.medicamentos).length} medicamento(s)
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="certificates" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={certificateSearch}
                onChange={event => setCertificateSearch(event.target.value)}
                placeholder="Buscar nome, tipo, CID ou conteúdo..."
                aria-label="Buscar templates de atestado"
                className="pl-9"
              />
            </div>
            <Button onClick={() => { setCertificateForm({}); setIsCertificateFormOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Template
            </Button>
          </div>

          {filteredCertificateTemplates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>{certificateTemplates.length === 0 ? 'Nenhum template de atestado criado' : 'Nenhum template corresponde à busca'}</p>
                <p className="text-sm">{certificateTemplates.length === 0 ? 'Crie templates para agilizar seus atestados' : 'Tente outro nome, tipo, CID ou conteúdo.'}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredCertificateTemplates.map((template) => (
                <Card key={template.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{template.nome}</CardTitle>
                        <div className="text-sm text-muted-foreground">
                          <Badge variant="outline" className="mt-1">
                            {CERTIFICATE_TYPES[template.tipo || 'comparecimento']}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button aria-label={`Duplicar modelo ${template.nome}`} size="icon" variant="ghost" disabled={duplicatingTemplateKey !== null} onClick={() => duplicateTemplate(template, 'certificate')}>
                          {duplicatingTemplateKey === `certificate:${template.id}`
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Copy className="h-4 w-4" />}
                        </Button>
                        {template.clinica_id === profile?.clinica_id && <>
                          <Button aria-label={`Editar modelo ${template.nome}`} size="icon" variant="ghost" onClick={() => { setCertificateForm(template); setIsCertificateFormOpen(true); }}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button aria-label={`Excluir modelo ${template.nome}`} size="icon" variant="ghost" onClick={() => setDeleteDialog({ open: true, type: 'certificate', id: template.id })}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {template.conteudo}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Prescription Form Dialog */}
      <Dialog open={isPrescriptionFormOpen} onOpenChange={(open) => { if (!isSaving) setIsPrescriptionFormOpen(open); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{prescriptionForm.id ? 'Editar' : 'Novo'} Template de Prescrição</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Template *</Label>
                <Input
                  value={prescriptionForm.nome || ''}
                  onChange={(e) => setPrescriptionForm({ ...prescriptionForm, nome: e.target.value })}
                  placeholder="Ex: Antibiótico padrão"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select
                  value={prescriptionForm.tipo || ''}
                  onValueChange={(v) => setPrescriptionForm({ ...prescriptionForm, tipo: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRESCRIPTION_TYPES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Medicamentos e posologia *</Label>
              <Textarea
                value={medicamentosTexto}
                onChange={(e) => setMedicamentosTexto(e.target.value)}
                placeholder={`Um medicamento por linha. Ex.:\nAmoxicilina 500mg — 1 cápsula de 8/8h por 7 dias\nIbuprofeno 400mg — 1 comprimido de 12/12h por 5 dias`}
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Ao usar o modelo numa prescrição, estas linhas entram já numeradas.</p>
            </div>
            <div className="space-y-2">
              <Label>Observações Gerais</Label>
              <Textarea
                value={prescriptionForm.observacoes_gerais || ''}
                onChange={(e) => setPrescriptionForm({ ...prescriptionForm, observacoes_gerais: e.target.value })}
                placeholder="Instruções gerais para o paciente..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPrescriptionFormOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSavePrescription} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Certificate Form Dialog */}
      <Dialog open={isCertificateFormOpen} onOpenChange={(open) => { if (!isSaving) setIsCertificateFormOpen(open); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{certificateForm.id ? 'Editar' : 'Novo'} Template de Atestado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Template *</Label>
                <Input
                  value={certificateForm.nome || ''}
                  onChange={(e) => setCertificateForm({ ...certificateForm, nome: e.target.value })}
                  placeholder="Ex: Atestado padrão"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select
                  value={certificateForm.tipo || ''}
                  onValueChange={(v) => setCertificateForm(current => ({
                    ...current,
                    tipo: v,
                    ...(v !== 'afastamento' ? { cid: null, dias_afastamento: null } : {}),
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CERTIFICATE_TYPES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {certificateForm.tipo === 'afastamento' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Dias de Afastamento</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={certificateForm.dias_afastamento || ''}
                    onChange={(e) => setCertificateForm({
                      ...certificateForm,
                      dias_afastamento: e.target.value === '' ? null : Number(e.target.value),
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CID</Label>
                  <Input
                    value={certificateForm.cid || ''}
                    onChange={(e) => setCertificateForm({ ...certificateForm, cid: e.target.value })}
                    placeholder="Ex: J11"
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Conteúdo do Atestado *</Label>
              <Textarea
                value={certificateForm.conteudo || ''}
                onChange={(e) => setCertificateForm({ ...certificateForm, conteudo: e.target.value })}
                placeholder="Texto do atestado... Use {{paciente}}, {{data}}, {{medico}} como variáveis"
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Variáveis disponíveis: {"{{paciente}}"}, {"{{data}}"}, {"{{medico}}"}, {"{{crm}}"}, {"{{dias}}"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCertificateFormOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSaveCertificate} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
