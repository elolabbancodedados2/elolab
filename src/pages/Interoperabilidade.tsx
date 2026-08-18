import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileJson, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function Interoperabilidade() {
  const [pacienteId, setPacienteId] = useState('');
  const [exporting, setExporting] = useState(false);
  const { data: pacientes = [] } = useQuery({ queryKey: ['pacientes-interoperabilidade'], queryFn: async () => {
    const { data, error } = await supabase.from('pacientes').select('id,nome,data_nascimento').order('nome');
    if (error) throw error; return data ?? [];
  }});
  async function exportar() {
    if (!pacienteId) return toast.error('Selecione o paciente.');
    setExporting(true);
    const { data, error } = await supabase.functions.invoke('fhir-export', { body: { paciente_id: pacienteId } });
    setExporting(false);
    if (error || !data || data.resourceType !== 'Bundle') return toast.error(error?.message || 'Exportação inválida.');
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/fhir+json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `fhir-${pacienteId}.json`; anchor.click(); URL.revokeObjectURL(url);
    toast.success(`${data.entry?.length ?? 0} recurso(s) FHIR exportado(s).`);
  }
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Interoperabilidade clínica</h1><p className="text-sm text-muted-foreground">Exportação segura e auditada no padrão HL7 FHIR R4.</p></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileJson className="h-4 w-4"/>Bundle clínico FHIR R4</CardTitle></CardHeader><CardContent className="space-y-4"><div className="max-w-xl"><label className="mb-1.5 block text-sm font-medium">Paciente</label><Select value={pacienteId} onValueChange={setPacienteId}><SelectTrigger><SelectValue placeholder="Selecione um paciente"/></SelectTrigger><SelectContent>{pacientes.map(p=><SelectItem key={p.id} value={p.id}>{p.nome}{p.data_nascimento ? ` · ${new Date(`${p.data_nascimento}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}</SelectItem>)}</SelectContent></Select></div><Button onClick={exportar} disabled={exporting || !pacienteId}><Download className="mr-2 h-4 w-4"/>{exporting?'Gerando…':'Exportar JSON FHIR'}</Button></CardContent></Card>
    <div className="grid gap-3 md:grid-cols-3">{[['Patient','Dados demográficos essenciais'],['Encounter','Consultas e atendimentos'],['DiagnosticReport / Observation','Exames e sinais vitais']].map(([title,text])=><Card key={title}><CardContent className="p-4"><p className="font-medium">{title}</p><p className="text-xs text-muted-foreground">{text}</p></CardContent></Card>)}</div>
    <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0"/><span>A exportação respeita as permissões da clínica, não inclui CPF e registra somente metadados de auditoria. Integrações DICOM devem usar QIDO-RS, WADO-RS e STOW-RS com um PACS configurado.</span></div>
  </div>;
}
