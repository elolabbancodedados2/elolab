import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { useState } from 'react';
import { Download, FileJson, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function Interoperabilidade() {
  const [pacienteId, setPacienteId] = useState('');
  const [exporting, setExporting] = useState(false);
  async function exportar() {
    if (!pacienteId) return toast.error('Selecione o paciente.');
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('fhir-export', { body: { paciente_id: pacienteId } });
      if (error) throw error;
      const bundle = typeof data === 'string' ? JSON.parse(data) : data;
      if (!bundle || bundle.resourceType !== 'Bundle' || !Array.isArray(bundle.entry)) {
        throw new Error(bundle?.error || 'A resposta recebida não é um Bundle FHIR válido.');
      }

      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/fhir+json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `fhir-${pacienteId}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${bundle.entry.length} recurso(s) FHIR exportado(s).`);
    } catch (error) {
      console.error('Falha ao exportar Bundle FHIR', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível exportar os dados. Tente novamente.');
    } finally {
      setExporting(false);
    }
  }
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Interoperabilidade clínica</h1><p className="text-sm text-muted-foreground">Exportação segura e auditada no padrão HL7 FHIR R4.</p></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileJson className="h-4 w-4"/>Bundle clínico FHIR R4</CardTitle></CardHeader><CardContent className="space-y-4"><div className="max-w-xl"><label className="mb-1.5 block text-sm font-medium">Paciente</label><PacienteCombobox value={pacienteId} onChange={setPacienteId} disabled={exporting} /></div><Button onClick={exportar} disabled={exporting || !pacienteId} aria-busy={exporting}><Download className="mr-2 h-4 w-4"/>{exporting?'Gerando…':'Exportar JSON FHIR'}</Button></CardContent></Card>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Patient / AllergyIntolerance','Identificação, contatos e alergias'],['Encounter / Composition','Atendimentos e evoluções clínicas'],['ServiceRequest / DiagnosticReport','Solicitações de exames e laudos liberados'],['Observation / Condition / MedicationRequest','Sinais vitais, diagnósticos e prescrições']].map(([title,text])=><Card key={title}><CardContent className="p-4"><p className="font-medium">{title}</p><p className="text-xs text-muted-foreground">{text}</p></CardContent></Card>)}</div>
    <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0"/><span>O arquivo inclui dados pessoais (contato e endereço) e conteúdo clínico. Guarde e compartilhe somente em ambiente autorizado. Laudos anexados são incluídos por links privados temporários, válidos por 1 hora; transfira o Bundle ao destino dentro desse prazo. O CPF é omitido; a auditoria registra apenas metadados da exportação. Integrações DICOM devem usar QIDO-RS, WADO-RS e STOW-RS com um PACS configurado.</span></div>
  </div>;
}
