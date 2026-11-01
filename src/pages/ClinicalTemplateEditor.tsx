import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Pill, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useSupabaseQuery } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { medicamentosParaLinhas, textoParaMedicamentos } from '@/lib/templatesPrescricao';
import { mensagemDeErro } from '@/lib/erros';
import { legendaVariaveisAtestado } from '@/lib/variaveisAtestado';
import { PageHeader } from '@/components/PageHeader';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PRESCRIPTION_TYPES, CERTIFICATE_TYPES, type PrescriptionTemplate, type CertificateTemplate } from './clinicalTemplateTypes';

export default function ClinicalTemplateEditor({ kind }: { kind: 'prescription' | 'certificate' }) {
  const location = useLocation();
  const { profile } = useSupabaseAuth();
  return <Editor key={`${location.pathname}:${profile?.clinica_id ?? ''}`} kind={kind} />;
}

function Editor({ kind }: { kind: 'prescription' | 'certificate' }) {
  const { templateId } = useParams();
  const editing = Boolean(templateId);
  const { profile } = useSupabaseAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isPrescription = kind === 'prescription';
  const table = isPrescription ? 'templates_prescricao' : 'templates_atestado';
  const [prescriptionForm, setPrescriptionForm] = useState<Partial<PrescriptionTemplate>>({});
  const [certificateForm, setCertificateForm] = useState<Partial<CertificateTemplate>>({});
  const [medicamentosTexto, setMedicamentosTexto] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const saveLock = useRef(false);
  const initialized = useRef(false);
  const completed = useRef(false);
  const expectedVersion = useRef<string | null>(null);
  const baseline = useRef(JSON.stringify([{}, {}, '']));
  const templateQuery = useSupabaseQuery<PrescriptionTemplate | CertificateTemplate>(table, {
    enabled: editing && !!profile?.clinica_id,
    filters: [{ column: 'id', operator: 'eq', value: templateId }, { column: 'clinica_id', operator: 'eq', value: profile?.clinica_id }],
    limit: 1,
  });
  const template = templateQuery.data?.[0];
  useEffect(() => {
    if (!template || initialized.current) return;
    const prescription = isPrescription ? template as PrescriptionTemplate : {};
    const certificate = isPrescription ? {} : template as CertificateTemplate;
    const medications = isPrescription ? medicamentosParaLinhas((template as PrescriptionTemplate).medicamentos).join('\n') : '';
    setPrescriptionForm(prescription);
    setCertificateForm(certificate);
    setMedicamentosTexto(medications);
    baseline.current = JSON.stringify([prescription, certificate, medications]);
    expectedVersion.current = template.updated_at;
    initialized.current = true;
  }, [template, isPrescription]);
  const dirty = JSON.stringify([prescriptionForm, certificateForm, medicamentosTexto]) !== baseline.current;
  const listState = { clinicalTemplateFilters: location.state?.clinicalTemplateFilters ?? { clinicalTab: isPrescription ? 'prescriptions' : 'certificates' } };
  const back = () => navigate('/todos-templates', { state: listState });
  const finish = () => { completed.current = true; back(); };
  const handleSavePrescription = async () => {
    if (saveLock.current || templateQuery.isError || (editing && !initialized.current)) return;
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
          .filter('updated_at', expectedVersion.current == null ? 'is' : 'eq', expectedVersion.current)
          .select('id')
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Este modelo foi alterado ou removido. Seu texto foi preservado; volte à lista e reabra a versão atual antes de salvar.');
        toast.success('Template atualizado com sucesso');
      } else {
        const { error } = await supabase
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
      finish();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving prescription template:', error);
      toast.error('Erro ao salvar template', { description: mensagemDeErro(error) });
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

  const handleSaveCertificate = async () => {
    if (saveLock.current || templateQuery.isError || (editing && !initialized.current)) return;
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
          .filter('updated_at', expectedVersion.current == null ? 'is' : 'eq', expectedVersion.current)
          .select('id')
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Este modelo foi alterado ou removido. Seu texto foi preservado; volte à lista e reabra a versão atual antes de salvar.');
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
      finish();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving certificate template:', error);
      toast.error('Erro ao salvar template', { description: mensagemDeErro(error) });
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };


  const title = `${editing ? 'Editar' : 'Novo'} modelo de ${isPrescription ? 'prescrição' : 'atestado'}`;
  const unavailable = editing && !template && !templateQuery.isLoading && !templateQuery.isError;
  return <div className="space-y-5 pb-24 lg:pb-8">
    <UnsavedChangesGuard dirty={dirty} busy={isSaving} completed={completed} />
    <Button asChild variant="outline"><Link to="/todos-templates" state={listState}>Voltar aos modelos</Link></Button>
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={title} icon={isPrescription ? <Pill /> : <FileText />} description="Configure um texto reutilizável pela clínica. O profissional revisa as informações ao emitir o documento para cada paciente." />
      {templateQuery.isError && <ErrorState title="Não foi possível carregar o modelo" error={templateQuery.error} onRetry={() => void templateQuery.refetch()} />}
      {editing && templateQuery.isLoading && !initialized.current ? <Skeleton className="h-80" /> : unavailable ? <p role="status" className="rounded-xl border bg-card p-6">Modelo indisponível para edição nesta clínica. Modelos globais podem ser duplicados pela lista.</p> : (!editing || initialized.current) && <form onSubmit={event => { event.preventDefault(); void (isPrescription ? handleSavePrescription() : handleSaveCertificate()); }} className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <fieldset disabled={isSaving || templateQuery.isError || !profile?.clinica_id} className="min-w-0">
          <legend className="sr-only">Conteúdo do modelo</legend>
          {isPrescription ? (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prescription-template-name">Nome do modelo *</Label>
                <Input
                  id="prescription-template-name" required autoFocus
                  value={prescriptionForm.nome || ''}
                  onChange={(e) => setPrescriptionForm({ ...prescriptionForm, nome: e.target.value })}
                  placeholder="Ex: Antibiótico padrão"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prescription-template-type">Tipo *</Label>
                <Select
                  value={prescriptionForm.tipo || ''}
                  onValueChange={(v) => setPrescriptionForm({ ...prescriptionForm, tipo: v })}
                >
                  <SelectTrigger id="prescription-template-type">
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
              <Label htmlFor="prescription-template-medications">Medicamentos e posologia *</Label>
              <Textarea
                id="prescription-template-medications" required
                value={medicamentosTexto}
                onChange={(e) => setMedicamentosTexto(e.target.value)}
                placeholder={`Um medicamento por linha. Ex.:\nAmoxicilina 500mg — 1 cápsula de 8/8h por 7 dias\nIbuprofeno 400mg — 1 comprimido de 12/12h por 5 dias`}
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Ao usar o modelo numa prescrição, estas linhas entram já numeradas.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prescription-template-observations">Observações Gerais</Label>
              <Textarea
                id="prescription-template-observations"
                value={prescriptionForm.observacoes_gerais || ''}
                onChange={(e) => setPrescriptionForm({ ...prescriptionForm, observacoes_gerais: e.target.value })}
                placeholder="Instruções gerais para o paciente..."
                rows={3}
              />
            </div>
          </div>
) : (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="certificate-template-name">Nome do modelo *</Label>
                <Input
                  id="certificate-template-name" required autoFocus
                  value={certificateForm.nome || ''}
                  onChange={(e) => setCertificateForm({ ...certificateForm, nome: e.target.value })}
                  placeholder="Ex: Atestado padrão"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="certificate-template-type">Tipo *</Label>
                <Select
                  value={certificateForm.tipo || ''}
                  onValueChange={(v) => setCertificateForm(current => ({
                    ...current,
                    tipo: v,
                    ...(v !== 'afastamento' ? { cid: null, dias_afastamento: null } : {}),
                  }))}
                >
                  <SelectTrigger id="certificate-template-type">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="certificate-template-days">Dias de Afastamento</Label>
                  <Input
                    id="certificate-template-days"
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
                  <Label htmlFor="certificate-template-cid">CID</Label>
                  <Input
                    id="certificate-template-cid"
                    value={certificateForm.cid || ''}
                    onChange={(e) => setCertificateForm({ ...certificateForm, cid: e.target.value })}
                    placeholder="Ex: J11"
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="certificate-template-content">Conteúdo do Atestado *</Label>
              <Textarea
                id="certificate-template-content" required
                value={certificateForm.conteudo || ''}
                onChange={(e) => setCertificateForm({ ...certificateForm, conteudo: e.target.value })}
                placeholder="Texto do atestado... Use {{nome_paciente}}, {{data_emissao}}, {{medico_nome}} como variáveis"
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Variáveis disponíveis: {legendaVariaveisAtestado()}
              </p>
            </div>
          </div>
)}
          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t pt-4 scroll-mb-24">
            <span role="status" className="mr-auto w-full text-xs text-muted-foreground sm:w-auto">{isSaving ? 'Salvando modelo…' : dirty ? 'Alterações não salvas' : 'Sem alterações'}</span>
            <Button type="button" variant="outline" onClick={back}>Cancelar</Button>
            <Button type="submit">{isSaving && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}Salvar modelo</Button>
          </div>
        </fieldset>
      </form>}
    </div>
  </div>;
}
