import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, FileText, Pill, Edit, Trash2, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { useSupabaseQuery } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

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

  const queryClient = useQueryClient();

  const { data: prescriptionTemplates = [], isLoading: loadingPrescriptions } = useSupabaseQuery<PrescriptionTemplate>('templates_prescricao', {
    orderBy: { column: 'nome', ascending: true },
  });

  const { data: certificateTemplates = [], isLoading: loadingCertificates } = useSupabaseQuery<CertificateTemplate>('templates_atestado', {
    orderBy: { column: 'nome', ascending: true },
  });

  const isLoading = loadingPrescriptions || loadingCertificates;

  const handleSavePrescription = async () => {
    if (!prescriptionForm.nome || !prescriptionForm.tipo) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    setIsSaving(true);
    try {
      if (prescriptionForm.id) {
        const { error } = await supabase
          .from('templates_prescricao')
          .update({
            nome: prescriptionForm.nome,
            tipo: prescriptionForm.tipo,
            observacoes_gerais: prescriptionForm.observacoes_gerais,
            medicamentos: (prescriptionForm.medicamentos || []) as any, // Cast to any to satisfy Json type
          })
          .eq('id', prescriptionForm.id);

        if (error) throw error;
        toast.success('Template atualizado com sucesso');
      } else {
        const { error } = await supabase
          .from('templates_prescricao')
          .insert({
            nome: prescriptionForm.nome,
            tipo: prescriptionForm.tipo,
            observacoes_gerais: prescriptionForm.observacoes_gerais,
            medicamentos: (prescriptionForm.medicamentos || []) as any, // Cast to any to satisfy Json type
          });

        if (error) throw error;
        toast.success('Template criado com sucesso');
      }

      queryClient.invalidateQueries({ queryKey: ['templates_prescricao'] });
      setIsPrescriptionFormOpen(false);
      setPrescriptionForm({});
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving prescription template:', error);
      toast.error('Erro ao salvar template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCertificate = async () => {
    if (!certificateForm.nome || !certificateForm.tipo || !certificateForm.conteudo) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    setIsSaving(true);
    try {
      if (certificateForm.id) {
        const { error } = await supabase
          .from('templates_atestado')
          .update({
            nome: certificateForm.nome,
            tipo: certificateForm.tipo,
            conteudo: certificateForm.conteudo,
            cid: certificateForm.cid,
            dias_afastamento: certificateForm.dias_afastamento,
          })
          .eq('id', certificateForm.id);

        if (error) throw error;
        toast.success('Template atualizado com sucesso');
      } else {
        const { error } = await supabase
          .from('templates_atestado')
          .insert({
            nome: certificateForm.nome,
            tipo: certificateForm.tipo,
            conteudo: certificateForm.conteudo,
            cid: certificateForm.cid,
            dias_afastamento: certificateForm.dias_afastamento,
          });

        if (error) throw error;
        toast.success('Template criado com sucesso');
      }

      queryClient.invalidateQueries({ queryKey: ['templates_atestado'] });
      setIsCertificateFormOpen(false);
      setCertificateForm({});
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving certificate template:', error);
      toast.error('Erro ao salvar template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const { type, id } = deleteDialog;
    const table = type === 'prescription' ? 'templates_prescricao' : 'templates_atestado';

    setIsSaving(true);
    try {
      const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) { toast.error('Sem permissão para excluir este template.'); return; }
      queryClient.invalidateQueries({ queryKey: [table] });
      toast.success('Template excluído');
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error deleting template:', error);
      toast.error('Erro ao excluir template');
    } finally {
      setIsSaving(false);
      setDeleteDialog({ open: false, type: 'prescription', id: '' });
    }
  };

  const duplicateTemplate = async (template: PrescriptionTemplate | CertificateTemplate, type: 'prescription' | 'certificate') => {
    const table = type === 'prescription' ? 'templates_prescricao' : 'templates_atestado';

    try {
      const { id, created_at, updated_at, ...rest } = template as any;
      const { error } = await supabase.from(table).insert({
        ...rest,
        nome: `${template.nome} (cópia)`,
      });

      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: [table] });
      toast.success('Template duplicado');
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error duplicating template:', error);
      toast.error('Erro ao duplicar template');
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
          <div className="flex justify-end">
            <Button onClick={() => { setPrescriptionForm({}); setIsPrescriptionFormOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Template
            </Button>
          </div>

          {prescriptionTemplates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Pill className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>Nenhum template de prescrição criado</p>
                <p className="text-sm">Crie templates para agilizar suas prescrições</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {prescriptionTemplates.map((template) => (
                <Card key={template.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{template.nome}</CardTitle>
                        <CardDescription>
                          <Badge variant="outline" className="mt-1">
                            {PRESCRIPTION_TYPES[template.tipo || 'simples']}
                          </Badge>
                        </CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => duplicateTemplate(template, 'prescription')}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { setPrescriptionForm(template); setIsPrescriptionFormOpen(true); }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteDialog({ open: true, type: 'prescription', id: template.id })}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {Array.isArray(template.medicamentos) ? template.medicamentos.length : 0} medicamento(s)
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="certificates" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setCertificateForm({}); setIsCertificateFormOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Template
            </Button>
          </div>

          {certificateTemplates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>Nenhum template de atestado criado</p>
                <p className="text-sm">Crie templates para agilizar seus atestados</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {certificateTemplates.map((template) => (
                <Card key={template.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{template.nome}</CardTitle>
                        <CardDescription>
                          <Badge variant="outline" className="mt-1">
                            {CERTIFICATE_TYPES[template.tipo || 'comparecimento']}
                          </Badge>
                        </CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => duplicateTemplate(template, 'certificate')}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { setCertificateForm(template); setIsCertificateFormOpen(true); }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteDialog({ open: true, type: 'certificate', id: template.id })}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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
      <Dialog open={isPrescriptionFormOpen} onOpenChange={setIsPrescriptionFormOpen}>
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
      <Dialog open={isCertificateFormOpen} onOpenChange={setIsCertificateFormOpen}>
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
                  onValueChange={(v) => setCertificateForm({ ...certificateForm, tipo: v })}
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
                    value={certificateForm.dias_afastamento || ''}
                    onChange={(e) => setCertificateForm({ ...certificateForm, dias_afastamento: parseInt(e.target.value) })}
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
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O template será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
