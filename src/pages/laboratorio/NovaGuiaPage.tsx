import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { formatCPF, validateCPF } from '@/lib/formatters';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';
import { PageHeader } from '@/components/PageHeader';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

async function removerAnexoTemporario(clinicaId: string, path: string) {
  // A resposta de um INSERT pode se perder após a confirmação no servidor.
  const { data, error: readError } = await supabase.from('guias_externas')
    .select('id').eq('clinica_id', clinicaId).eq('anexo_url', path).limit(1).maybeSingle();
  if (readError) throw readError;
  if (data) return;
  const { error } = await supabase.storage.from('guias-externas').remove([path]);
  if (error) throw error;
}

export default function NovaGuiaPage() {
  const { profile } = useSupabaseAuth();
  return <NovaGuiaWorkspace key={profile?.clinica_id ?? ''} />;
}

function NovaGuiaWorkspace() {
  const { profile, user } = useSupabaseAuth();
  const clinicaId = profile?.clinica_id;
  const userId = user?.id;
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const completed = useRef(false);
  const pendingAttachment = useRef<string | null>(null);
  const back = () => navigate('/guias-externas', { state: { guiaFilters: location.state?.guiaFilters } });
  useEffect(() => () => {
    const temporaryPath = pendingAttachment.current;
    pendingAttachment.current = null;
    if (temporaryPath && clinicaId) void removerAnexoTemporario(clinicaId, temporaryPath)
      .catch(error => toast.warning('Não foi possível remover o anexo temporário.', { description: mensagemDeErro(error) }));
  }, [clinicaId]);

  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    paciente_nome: '',
    paciente_cpf: '',
    paciente_nascimento: '',
    paciente_telefone: '',
    medico_externo_nome: '',
    medico_externo_crm: '',
    medico_externo_uf: '',
    medico_externo_especialidade: '',
    convenio_nome: '',
    numero_autorizacao: '',
    validade_autorizacao: '',
    observacoes: '',
    anexo_url: '',
    anexo_nome: '',
    exames_texto: '',
  });

  const handleUpload = async (file: File) => {
    const tiposAceitos = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    if (!tiposAceitos.has(file.type)) {
      toast.error('Use um arquivo PDF, JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('O anexo deve ter no máximo 10 MB.');
      return;
    }
    if (!clinicaId) {
      toast.error('Clínica não identificada. Atualize a sessão e tente novamente.');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${clinicaId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('guias-externas').upload(path, file);
      if (error) throw error;
      const anexoAnterior = form.anexo_url;
      pendingAttachment.current = path;
      setForm((f) => ({ ...f, anexo_url: path, anexo_nome: file.name }));
      toast.success('Anexo enviado');
      if (anexoAnterior && anexoAnterior !== path) {
        try {
          await removerAnexoTemporario(clinicaId, anexoAnterior);
        } catch (erroRemocao) {
          toast.warning('O novo anexo foi enviado, mas o arquivo anterior não pôde ser removido.', {
            description: mensagemDeErro(erroRemocao),
          });
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro no upload');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (uploading || saving) {
      toast.info('Aguarde o envio do anexo terminar antes de registrar a guia.');
      return;
    }
    if (saveLock.current) return;
    if (!clinicaId) { toast.error('Clínica não identificada. Atualize a sessão e tente novamente.'); return; }
    if (!form.paciente_nome.trim()) { toast.error('Nome do paciente é obrigatório'); return; }
    const cpfDigitos = form.paciente_cpf.replace(/\D/g, '');
    if (cpfDigitos && !validateCPF(cpfDigitos)) { toast.error('CPF inválido. Confira os números digitados.'); return; }
    if (form.paciente_nascimento) {
      const nascimento = /^\d{4}-\d{2}-\d{2}$/.test(form.paciente_nascimento)
        ? new Date(`${form.paciente_nascimento}T12:00:00`)
        : new Date(Number.NaN);
      const nascimentoValido = /^\d{4}-\d{2}-\d{2}$/.test(form.paciente_nascimento)
        && Number.isFinite(nascimento.getTime())
        && format(nascimento, 'yyyy-MM-dd') === form.paciente_nascimento
        && form.paciente_nascimento <= todaySaoPauloDateOnly();
      if (!nascimentoValido) { toast.error('Informe uma data de nascimento válida, que não esteja no futuro.'); return; }
    }
    const exames = form.exames_texto
      .split('\n').map((l) => l.trim()).filter(Boolean)
      .map((nome) => ({ nome }));
    if (exames.length === 0) { toast.error('Liste ao menos um exame'); return; }

    saveLock.current = true;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from('guias_externas').insert({
        clinica_id: clinicaId,
        origem: 'manual',
        status: 'recebida',
        paciente_nome: form.paciente_nome.trim(),
        paciente_cpf: cpfDigitos || null,
        paciente_nascimento: form.paciente_nascimento || null,
        paciente_telefone: form.paciente_telefone || null,
        medico_externo_nome: form.medico_externo_nome || null,
        medico_externo_crm: form.medico_externo_crm || null,
        medico_externo_uf: form.medico_externo_uf || null,
        medico_externo_especialidade: form.medico_externo_especialidade || null,
        convenio_nome: form.convenio_nome || null,
        numero_autorizacao: form.numero_autorizacao || null,
        validade_autorizacao: form.validade_autorizacao || null,
        observacoes: form.observacoes || null,
        anexo_url: form.anexo_url || null,
        anexo_nome: form.anexo_nome || null,
        exames_solicitados: exames,
        registrado_por: userId,
      });
      if (error) throw error;
      toast.success('Guia externa registrada');
      pendingAttachment.current = null;
      completed.current = true;
      void queryClient.invalidateQueries({ queryKey: ['guias_externas'] });
      back();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const dirty = Object.values(form).some(value => value !== '');
  return <div className="space-y-5 pb-24 lg:pb-8">
    <UnsavedChangesGuard dirty={dirty} busy={saving || uploading} completed={completed} />
    <Button asChild variant="outline"><Link to="/guias-externas" state={{ guiaFilters: location.state?.guiaFilters }}>Voltar às guias externas</Link></Button>
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Nova guia externa" icon={<FileText className="h-5 w-5" />} description="Registre o pedido recebido de fora da clínica. Identifique o paciente e confira os exames e documentos antes de salvar." />
      <form onSubmit={event => { event.preventDefault(); void handleSave(); }} className="rounded-xl border bg-card p-4 sm:p-6">
        <fieldset disabled={saving || uploading} className="min-w-0">
        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-label="Paciente" className="min-w-0 space-y-3"><h2 className="border-b pb-2 text-base font-semibold">Paciente</h2>
            <div><Label htmlFor="guia-paciente-nome">Nome completo *</Label><Input id="guia-paciente-nome" value={form.paciente_nome} onChange={(e) => setForm({ ...form, paciente_nome: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label htmlFor="guia-paciente-cpf">CPF</Label><Input id="guia-paciente-cpf" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={form.paciente_cpf} onChange={(e) => setForm({ ...form, paciente_cpf: formatCPF(e.target.value) })} /></div>
              <div><Label htmlFor="guia-paciente-nascimento">Data nascimento</Label><Input id="guia-paciente-nascimento" type="date" value={form.paciente_nascimento} onChange={(e) => setForm({ ...form, paciente_nascimento: e.target.value })} /></div>
            </div>
            <div><Label htmlFor="guia-paciente-telefone">Telefone</Label><Input id="guia-paciente-telefone" value={form.paciente_telefone} onChange={(e) => setForm({ ...form, paciente_telefone: e.target.value })} /></div>
          </section>

          <section aria-label="Médico solicitante" className="min-w-0 space-y-3"><h2 className="border-b pb-2 text-base font-semibold">Médico solicitante</h2>
            <div><Label htmlFor="guia-medico-nome">Nome do médico solicitante</Label><Input id="guia-medico-nome" value={form.medico_externo_nome} onChange={(e) => setForm({ ...form, medico_externo_nome: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2"><Label htmlFor="guia-medico-crm">CRM</Label><Input id="guia-medico-crm" value={form.medico_externo_crm} onChange={(e) => setForm({ ...form, medico_externo_crm: e.target.value })} /></div>
              <div><Label htmlFor="guia-medico-uf">UF</Label><Input id="guia-medico-uf" value={form.medico_externo_uf} onChange={(e) => setForm({ ...form, medico_externo_uf: e.target.value.toUpperCase() })} /></div>
            </div>
            <div><Label htmlFor="guia-medico-especialidade">Especialidade</Label><Input id="guia-medico-especialidade" value={form.medico_externo_especialidade} onChange={(e) => setForm({ ...form, medico_externo_especialidade: e.target.value })} /></div>
          </section>

          <section aria-label="Convênio e documento" className="min-w-0 space-y-3"><h2 className="border-b pb-2 text-base font-semibold">Convênio e documento</h2>
            <div><Label htmlFor="guia-convenio">Convênio</Label><Input id="guia-convenio" value={form.convenio_nome} onChange={(e) => setForm({ ...form, convenio_nome: e.target.value })} placeholder="Ex.: Unimed, Bradesco..." /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label htmlFor="guia-autorizacao">Nº autorização</Label><Input id="guia-autorizacao" value={form.numero_autorizacao} onChange={(e) => setForm({ ...form, numero_autorizacao: e.target.value })} /></div>
              <div><Label htmlFor="guia-validade">Validade</Label><Input id="guia-validade" type="date" value={form.validade_autorizacao} onChange={(e) => setForm({ ...form, validade_autorizacao: e.target.value })} /></div>
            </div>

            <div className="pt-2">
              <Label htmlFor="guia-anexo">Anexo da guia (PDF/imagem)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input id="guia-anexo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} disabled={uploading || saving} />
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
              {form.anexo_nome && (
                <p className="text-xs text-success mt-1 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {form.anexo_nome}
                </p>
              )}
            </div>
          </section>

          <section aria-label="Exames solicitados" className="min-w-0 space-y-3"><h2 className="border-b pb-2 text-base font-semibold">Exames solicitados</h2>
            <div>
              <Label htmlFor="guia-exames">Exames solicitados (um por linha) *</Label>
              <Textarea id="guia-exames" rows={7} value={form.exames_texto}
                onChange={(e) => setForm({ ...form, exames_texto: e.target.value })}
                placeholder={'Hemograma completo\nGlicemia de jejum\nColesterol total e frações'}
              />
            </div>
            <div>
              <Label htmlFor="guia-observacoes">Observações</Label>
              <Textarea id="guia-observacoes" rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </section>
        </div>
        </fieldset>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t pt-4 scroll-mb-24"><span role="status" className="mr-auto w-full text-xs text-muted-foreground sm:w-auto">{saving ? 'Registrando guia…' : uploading ? 'Enviando anexo…' : dirty ? 'Alterações não salvas' : 'Sem alterações'}</span>
          <Button type="button" variant="outline" onClick={back} disabled={saving || uploading}>Cancelar</Button>
          <Button type="submit" disabled={saving || uploading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Registrar guia
          </Button>
        </div>
      </form>
    </div>
  </div>;
}
