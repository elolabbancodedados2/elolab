import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
// Tipo apenas: o runtime entra por import() dentro de buildReceitaPdf.
import type jsPDF from 'jspdf';
import { useQuery } from '@tanstack/react-query';
import {
  Pill, Plus, Search, Eye, FileDown, ExternalLink, Clipboard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { usePacientes, useMedicos, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ClinicalAlertsDisplay, useClinicalAlerts } from '@/components/ClinicalAlertsDisplay';
import { consolidateAlerts, ClinicalAlert } from '@/lib/clinicalAlerts';
import { parseDateOnly } from '@/lib/dateOnly';
import { LoadingButton } from '@/components/ui/loading-button';

/* ─── PDF Builder ─── */
async function buildReceitaPdf(data: {
  pacienteNome: string;
  cpf: string;
  dataEmissao: string;
  medicoNome: string;
  crm: string;
  especialidade: string;
  medicamentosTexto: string;
  clinicaNome?: string;
  clinicaEndereco?: string;
  clinicaTelefone?: string;
  clinicaCnpj?: string;
}): Promise<jsPDF> {
  // Carrega as ~660 KB do jsPDF só quando o médico gera a receita,
  // em vez de ao abrir a tela.
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const w = 210;
  const margin = 20;

  // ── Border ──
  doc.setDrawColor(0, 102, 204);
  doc.setLineWidth(0.7);
  doc.rect(10, 10, w - 20, 277);

  // ── Header / letterhead ──
  doc.setFontSize(18);
  doc.setTextColor(0, 102, 204);
  doc.text(data.clinicaNome || 'Clínica Médica', w / 2, 25, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(data.clinicaEndereco || 'Endereço da clínica', w / 2, 31, { align: 'center' });
  doc.text(`Tel: ${data.clinicaTelefone || '(00) 0000-0000'} | CNPJ: ${data.clinicaCnpj || '00.000.000/0001-00'}`, w / 2, 36, { align: 'center' });

  doc.setDrawColor(0, 102, 204);
  doc.setLineWidth(0.4);
  doc.line(margin, 42, w - margin, 42);

  // ── Title ──
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text('RECEITUÁRIO MÉDICO', w / 2, 52, { align: 'center' });

  // ── Patient info ──
  let y = 64;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const addField = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + doc.getTextWidth(label) + 2, y);
    y += 6;
  };

  addField('Paciente: ', data.pacienteNome);
  if (data.cpf) addField('CPF: ', data.cpf);
  addField('Data: ', data.dataEmissao);

  y += 4;
  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  doc.line(margin, y, w - margin, y);
  y += 8;

  // ── Medications ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Medicamentos e Posologia', margin, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(data.medicamentosTexto, w - margin * 2);
  for (const line of lines) {
    if (y > 240) {
      doc.addPage();
      y = 25;
    }
    doc.text(line, margin, y);
    y += 5.5;
  }

  // ── Doctor signature area ──
  y = Math.max(y + 20, 210);
  if (y > 250) { doc.addPage(); y = 60; }

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(w / 2 - 40, y, w / 2 + 40, y);
  y += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(data.medicoNome, w / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`CRM: ${data.crm}${data.especialidade ? ` — ${data.especialidade}` : ''}`, w / 2, y, { align: 'center' });

  // ── Rodapé ──
  // Este texto dizia "Documento assinado digitalmente. Valide a autenticidade
  // em assinaturadigital.iti.gov.br" — impresso na hora da geração, antes de
  // qualquer assinatura. A própria tela pede que o médico baixe e assine no
  // portal do ITI depois. Quem tentasse validar receberia "documento não
  // assinado", e a clínica é que pareceria estar falsificando receita.
  const footerY = 280;
  doc.setFontSize(7);
  doc.setTextColor(130);
  doc.text(
    'Documento sem assinatura digital. Assine no portal gov.br ou de próprio punho para ter validade.',
    w / 2, footerY, { align: 'center' },
  );
  doc.text(
    `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    w / 2, footerY + 4, { align: 'center' },
  );
  doc.setTextColor(0);

  return doc;
}

/* ─── Component ─── */
export default function Prescricoes() {
  const { profile } = useSupabaseAuth();

  const { data: pacientes = [], isLoading: loadingPac } = usePacientes();
  const { data: medicos = [], isLoading: loadingMed } = useMedicos();
  const { medicoId, isMedicoOnly } = useCurrentMedico();

  const { data: prescricoes = [], isLoading: loadingPresc, refetch } = useSupabaseQuery<Record<string, any>>('prescricoes', {
    orderBy: { column: 'created_at', ascending: false },
    ...(isMedicoOnly && medicoId ? { filters: [{ column: 'medico_id', operator: 'eq', value: medicoId }] } : {}),
  });

  const { data: clinicConfig } = useQuery({
    queryKey: ['configuracoes_clinica', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return null;
      const { data } = await supabase
        .from('configuracoes_clinica')
        .select('chave, valor')
        .eq('clinica_id', profile.clinica_id)
        .in('chave', ['config_clinica', 'clinica_info'])
        .limit(10);

      const configRows = data ?? [];
      const configClinica = configRows.find((row) => row.chave === 'config_clinica')?.valor as Record<string, string> | undefined;
      const clinicaInfo = configRows.find((row) => row.chave === 'clinica_info')?.valor as Record<string, string> | undefined;

      return {
        nome_fantasia: configClinica?.nomeClinica || clinicaInfo?.nome || 'Clínica Médica',
        endereco: configClinica?.endereco || clinicaInfo?.endereco || '',
        cidade: configClinica?.cidade || clinicaInfo?.cidade || '',
        uf: configClinica?.estado || clinicaInfo?.uf || '',
        telefone: configClinica?.telefone || clinicaInfo?.telefone || '(00) 0000-0000',
        cnpj: configClinica?.cnpj || clinicaInfo?.cnpj || '00.000.000/0001-00',
      };
    },
    enabled: !!profile?.clinica_id,
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [gerando, setGerando] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfFileName, setPdfFileName] = useState('');
  const [clinicalAlerts, setClinicalAlerts] = useState<ClinicalAlert[]>([]);
  const [showAlertsDialog, setShowAlertsDialog] = useState(false);
  const { dismissAlert } = useClinicalAlerts();

  const [form, setForm] = useState({
    paciente_id: '',
    medico_id: medicoId || '',
    data_emissao: format(new Date(), 'yyyy-MM-dd'),
    medicamentos_texto: '',
  });

  const selectedPaciente = useMemo(() => pacientes.find(p => p.id === form.paciente_id), [pacientes, form.paciente_id]);

  const filteredPrescricoes = useMemo(() => {
    if (!searchTerm) return prescricoes;
    const lower = searchTerm.toLowerCase();
    return prescricoes.filter(p => {
      const pac = pacientes.find(x => x.id === p.paciente_id);
      return pac?.nome?.toLowerCase().includes(lower);
    });
  }, [prescricoes, pacientes, searchTerm]);

  const handleOpen = () => {
    setForm({ paciente_id: '', medico_id: medicoId || '', data_emissao: format(new Date(), 'yyyy-MM-dd'), medicamentos_texto: '' });
    setIsFormOpen(true);
  };

  const handleSaveAndGenerate = async () => {
    if (!form.paciente_id || !form.medico_id || !form.medicamentos_texto.trim()) {
      toast.error('Preencha todos os campos');
      return;
    }

    setGerando(true);

    const paciente = pacientes.find(p => p.id === form.paciente_id);
    const medico = medicos.find(m => m.id === form.medico_id);
    if (!paciente || !medico) {
      setGerando(false);
      return;
    }

    // ✅ CHECK CLINICAL ALERTS antes de salvar
    // Helper: aceita array de strings ou CSV (campo no banco pode vir como ambos)
    const toList = (val: unknown): string[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
      if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
      return [];
    };

    const pAny = paciente as any;

    // As comorbidades ficam em tabela própria, não numa coluna de `pacientes`.
    // Antes este código lia pAny.comorbidades, campo que nunca existiu: o alerta
    // de contraindicação por comorbidade nunca chegava a disparar.
    const { data: comorbidades, error: erroComorbidades } = await (supabase as any)
      .from('paciente_comorbidades')
      .select('descricao')
      .eq('paciente_id', paciente.id)
      .eq('ativo', true);

    if (erroComorbidades) {
      // Prescrever sem saber as comorbidades é decisão do médico, não um
      // detalhe a esconder: avisamos e seguimos.
      toast.warning('Não foi possível carregar as comorbidades — os alertas podem estar incompletos.');
    }

    const medicationLines = form.medicamentos_texto.split('\n').filter(line => line.trim());
    const alerts: ClinicalAlert[] = [];

    for (const line of medicationLines) {
      const lineAlerts = consolidateAlerts(line, {
        alergias: toList(pAny.alergias),
        // Não passamos `idade`: a conta aqui era `anoAtual - anoNascimento`, sem
        // ajuste de aniversário, e tinha precedência sobre o cálculo correto do
        // motor de alertas. Uma criança de 1 ano e 8 meses virava 2 anos e o
        // alerta pediátrico deixava de disparar. A data basta.
        dataNascimento: pAny.data_nascimento,
        gestante: !!pAny.gestante,
        amamentando: !!pAny.amamentando,
        comorbidades: (comorbidades || []).map((c: any) => c.descricao).filter(Boolean),
      });
      alerts.push(...lineAlerts);
    }

    // Se há QUALQUER alerta, abrir dialog e aguardar confirmação explícita do médico.
    // A prescrição só é salva no botão "Confirmar e Gerar Receita" do dialog (ou aqui sem alertas).
    if (alerts.length > 0) {
      const hasCriticalAlerts = alerts.some(a => a.severity === 'critical' && !a.canIgnore);
      setClinicalAlerts(alerts);
      setShowAlertsDialog(true);
      if (hasCriticalAlerts) {
        toast.error('⚠️ Alertas de segurança críticos! Resolva antes de prescrever.');
      }
      setGerando(false);
      return;
    }

    // Sem alertas: salvar direto
    await executeSaveAndPdf(paciente, medico);
  };

  // Função extraída: salva no DB e gera PDF. Chamada quando não há alertas
  // ou após o médico confirmar no dialog de alertas.
  const executeSaveAndPdf = async (paciente: any, medico: any) => {
    if (!profile?.clinica_id) {
      setGerando(false);
      toast.error('Sua clínica ainda não foi identificada.', {
        description: 'Atualize a página e entre novamente antes de emitir a receita.',
      });
      return;
    }

    // O retorno deste insert era descartado. O Supabase devolve `{ error }` em
    // vez de lançar exceção, então uma falha de RLS, de rede ou de constraint
    // passava batida: o PDF era gerado, a tela dizia "sucesso" e o médico
    // entregava ao paciente uma receita que não existia no prontuário.
    const { error: erroInsert } = await supabase.from('prescricoes').insert({
      paciente_id: form.paciente_id,
      medico_id: form.medico_id,
      clinica_id: profile.clinica_id,
      medicamento: form.medicamentos_texto.slice(0, 100),
      posologia: form.medicamentos_texto,
      data_emissao: form.data_emissao,
      tipo: 'simples',
    });

    if (erroInsert) {
      setGerando(false);
      toast.error('A receita não foi salva — nada foi gerado.', {
        description: `${erroInsert.message}. Tente de novo; se persistir, avise o suporte antes de entregar qualquer receita ao paciente.`,
        duration: 10000,
      });
      return;
    }

    refetch();

    // Generate PDF
    const doc = await buildReceitaPdf({
      pacienteNome: paciente.nome,
      cpf: paciente.cpf || '',
      dataEmissao: format(new Date(form.data_emissao + 'T12:00:00'), 'dd/MM/yyyy'),
      medicoNome: medico.nome || medico.crm,
      crm: medico.crm,
      especialidade: medico.especialidade || '',
      medicamentosTexto: form.medicamentos_texto,
      clinicaNome: clinicConfig?.nome_fantasia || 'Clínica Médica',
      clinicaEndereco: clinicConfig ? `${clinicConfig.endereco || ''} — ${clinicConfig.cidade || ''}/${clinicConfig.uf || ''}` : 'Endereço da clínica',
      clinicaTelefone: clinicConfig?.telefone || '(00) 0000-0000',
      clinicaCnpj: clinicConfig?.cnpj || '00.000.000/0001-00',
    });

    const blob = doc.output('blob');
    const safeName = paciente.nome.replace(/\s+/g, '_').slice(0, 25);
    setPdfBlob(blob);
    setPdfFileName(`receita_${safeName}_${form.data_emissao}.pdf`);
    setIsFormOpen(false);
    setIsResultOpen(true);
    setShowAlertsDialog(false);
    setClinicalAlerts([]);
    toast.success('Receita gerada com sucesso!');
    setGerando(false);
  };

  // Chamado pelo dialog de alertas quando o médico confirma prescrever apesar dos avisos
  const handleConfirmDespiteAlerts = async () => {
    setGerando(true);
    const paciente = pacientes.find(p => p.id === form.paciente_id);
    const medico = medicos.find(m => m.id === form.medico_id);
    if (!paciente || !medico) {
      setGerando(false);
      return;
    }
    await executeSaveAndPdf(paciente, medico);
  };

  const handleDownload = () => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenAssinador = () => {
    window.open('https://assinaturadigital.iti.gov.br/', '_blank');
  };

  const getPacienteNome = (id: string) => pacientes.find(p => p.id === id)?.nome || '—';
  const getMedicoNome = (id: string) => { const m = medicos.find(x => x.id === id); return m ? `Dr(a). ${m.nome || m.crm}` : '—'; };

  if (loadingPac || loadingMed || loadingPresc) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Pill className="h-8 w-8 text-primary" />
            Prescrições
          </h1>
          <p className="text-muted-foreground">Receituário digital com assinatura via ITI</p>
        </div>
        <Button onClick={handleOpen} className="gap-2"><Plus className="h-4 w-4" />Nova Prescrição</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Total', value: prescricoes.length, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
          { label: 'Hoje', value: prescricoes.filter(p => p.data_emissao === format(new Date(), 'yyyy-MM-dd')).length, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
          { label: 'Pacientes', value: new Set(prescricoes.map(p => p.paciente_id)).size, color: 'text-info', bg: 'bg-info/10', border: 'border-info/20' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className={cn('border', s.border)}>
              <CardContent className="py-4 px-5">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{s.label}</p>
                <p className={cn('text-2xl font-black mt-0.5 tabular-nums', s.color)}>{s.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Histórico</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar paciente..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead className="hidden md:table-cell">Médico</TableHead>
                  <TableHead className="hidden sm:table-cell">Medicamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPrescricoes.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-12">
                    <div className="flex flex-col items-center">
                      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                        <Pill className="h-7 w-7 text-primary" />
                      </div>
                      <p className="font-semibold text-foreground">Nenhuma prescrição</p>
                      <p className="text-sm text-muted-foreground mt-1">Crie sua primeira prescrição médica</p>
                    </div>
                  </TableCell></TableRow>
                ) : filteredPrescricoes.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{p.data_emissao ? format(new Date(p.data_emissao + 'T12:00:00'), 'dd/MM/yyyy') : '—'}</TableCell>
                    <TableCell className="font-medium">{getPacienteNome(p.paciente_id)}</TableCell>
                    <TableCell className="hidden md:table-cell">{getMedicoNome(p.medico_id)}</TableCell>
                    <TableCell className="hidden sm:table-cell max-w-[200px] truncate">{p.medicamento || p.posologia || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── New Prescription Dialog ── */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pill className="h-5 w-5 text-primary" />Nova Prescrição</DialogTitle>
            <DialogDescription>Preencha os dados da prescrição médica.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Paciente *</Label>
              <Select value={form.paciente_id} onValueChange={v => setForm(f => ({ ...f, paciente_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
                <SelectContent>
                  {pacientes.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}{p.cpf ? ` — ${p.cpf}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPaciente?.cpf && (
                <p className="text-xs text-muted-foreground">CPF: {selectedPaciente.cpf}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Médico Prescritor *</Label>
              <Select value={form.medico_id} onValueChange={v => setForm(f => ({ ...f, medico_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o médico" /></SelectTrigger>
                <SelectContent>
                  {medicos.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.nome || m.crm} — CRM {m.crm}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data de Emissão</Label>
              <Input type="date" value={form.data_emissao} onChange={e => setForm(f => ({ ...f, data_emissao: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Medicamentos e Posologia *</Label>
              <Textarea
                placeholder={`1) Amoxicilina 500mg — Tomar 1 cápsula de 8/8h por 7 dias\n2) Ibuprofeno 400mg — Tomar 1 comprimido de 12/12h por 5 dias\n3) Omeprazol 20mg — Tomar 1 cápsula em jejum por 30 dias`}
                value={form.medicamentos_texto}
                onChange={e => setForm(f => ({ ...f, medicamentos_texto: e.target.value }))}
                rows={8}
                className="font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <LoadingButton
              onClick={handleSaveAndGenerate}
              isLoading={gerando}
              loadingText="Gerando receita..."
              className="gap-2"
            >
              <FileDown className="h-4 w-4" />Gerar Receita PDF
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Clinical Alerts Dialog ── */}
      <Dialog open={showAlertsDialog} onOpenChange={setShowAlertsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              ⚠️ Alertas de Segurança Clínica
            </DialogTitle>
            <DialogDescription>
              Revisão antes de prescrever. Alertas com tag "Não ignorável" devem ser resolvidos
              antes de prosseguir.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <ClinicalAlertsDisplay alerts={clinicalAlerts} onDismiss={dismissAlert} />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAlertsDialog(false)}>
              Voltar à Prescrição
            </Button>
            {!clinicalAlerts.some(a => a.severity === 'critical' && !a.canIgnore) && (
              <Button onClick={handleConfirmDespiteAlerts}>
                Confirmar e Gerar Receita
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Result Dialog (Download + Assinar) ── */}
      <Dialog open={isResultOpen} onOpenChange={setIsResultOpen}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 text-lg">
              <Clipboard className="h-5 w-5 text-primary" />
              Receita Gerada!
            </DialogTitle>
            <DialogDescription>Baixe o PDF e assine digitalmente.</DialogDescription>
          </DialogHeader>

          <p className="text-muted-foreground text-sm">
            O PDF da receita está pronto. Baixe o arquivo e, em seguida, assine digitalmente gratuitamente pelo portal do ITI (Gov.br).
          </p>

          <div className="flex flex-col gap-3 mt-4">
            <Button onClick={handleDownload} size="lg" className="gap-2 w-full">
              <FileDown className="h-5 w-5" />Baixar Receita PDF
            </Button>

            <Button onClick={handleOpenAssinador} variant="premium" size="lg" className="gap-2 w-full">
              <ExternalLink className="h-5 w-5" />Ir para Assinador Digital (Grátis)
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            O assinador digital do ITI utiliza certificado ICP-Brasil via Gov.br, sem custo adicional.
          </p>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
