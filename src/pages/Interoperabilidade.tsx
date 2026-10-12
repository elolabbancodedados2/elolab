import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { useState } from 'react';
import { Download, FileJson, ShieldCheck, LockKeyhole, UnlockKeyhole } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExportacaoClinicaProtegida } from '@/components/clinical/ExportacaoClinicaProtegida';
import { descriptografarExportClinico } from '@/lib/clinicalExportEncryption';

export default function Interoperabilidade() {
  const [pacienteId, setPacienteId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [arquivoPendente, setArquivoPendente] = useState<{ conteudo: string; nomeArquivo: string; tipo: 'application/json' | 'application/xml' } | null>(null);
  const [arquivoProtegido, setArquivoProtegido] = useState<File | null>(null);
  const [senhaArquivo, setSenhaArquivo] = useState('');
  const [abrindoArquivo, setAbrindoArquivo] = useState(false);
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

      setArquivoPendente({ conteudo: JSON.stringify(bundle, null, 2), nomeArquivo: `fhir-${pacienteId}`, tipo: 'application/json' });
      toast.success(`${bundle.entry.length} recurso(s) FHIR pronto(s) para criptografia.`);
    } catch (error) {
      console.error('Falha ao exportar Bundle FHIR', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível exportar os dados. Tente novamente.');
    } finally {
      setExporting(false);
    }
  }
  async function abrirArquivoProtegido() {
    if (!arquivoProtegido || !senhaArquivo) return toast.error('Selecione o arquivo e informe a senha.');
    if (arquivoProtegido.size > 80 * 1024 * 1024) return toast.error('O arquivo protegido ultrapassa o limite de 80 MB.');
    setAbrindoArquivo(true);
    try {
      const resultado = await descriptografarExportClinico(await arquivoProtegido.text(), senhaArquivo);
      const extension = resultado.tipo === 'application/xml' ? 'xml' : 'json';
      // eslint-disable-next-line no-control-regex -- downloaded filenames must not contain C0 control characters.
      const safeName = resultado.nomeArquivo.replace(/[\\/<>:"|?*\x00-\x1f]/g, '-').replace(/\.+$/, '') || 'exportacao-clinica';
      const url = URL.createObjectURL(new Blob([resultado.conteudo], { type: `${resultado.tipo};charset=utf-8` }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${safeName}.${extension}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setArquivoProtegido(null);
      setSenhaArquivo('');
      toast.success('Arquivo clínico descriptografado e baixado neste dispositivo.');
    } catch {
      toast.error('Não foi possível abrir o arquivo. Verifique a senha e se o arquivo é válido.');
    } finally {
      setAbrindoArquivo(false);
    }
  }
  return <div className="space-y-6">
    <header className="rounded-2xl border border-[#dce9f6] bg-gradient-to-r from-[#f3f8ff] via-white to-[#f3fbfa] p-5 sm:p-6"><div className="flex items-center gap-3"><span className="rounded-xl bg-[#eaf4ff] p-2.5 text-[#1766a8] ring-1 ring-[#d1e5f8]"><ShieldCheck className="h-5 w-5" /></span><div><h1 className="text-2xl font-bold text-[#0c1f54]">Interoperabilidade clínica</h1><p className="mt-1 text-sm text-[#52647a]">Exportação segura e auditada no padrão HL7 FHIR R4.</p></div></div></header>
    <Card className="border-[#d6e7f6] bg-gradient-to-br from-[#f5faff] to-white shadow-sm shadow-[#133453]/[0.03]"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileJson className="h-4 w-4"/>Bundle clínico FHIR R4</CardTitle></CardHeader><CardContent className="space-y-4"><div className="max-w-xl"><label htmlFor="fhir-paciente" className="mb-1.5 block text-sm font-medium">Paciente</label><PacienteCombobox id="fhir-paciente" value={pacienteId} onChange={setPacienteId} disabled={exporting} /></div><Button onClick={exportar} disabled={exporting || !pacienteId} aria-busy={exporting}><Download className="mr-2 h-4 w-4"/>{exporting?'Gerando…':'Exportar JSON FHIR'}</Button></CardContent></Card>
    <Card className="border-[#d6e7f6] bg-gradient-to-br from-[#f5faff] to-white shadow-sm shadow-[#133453]/[0.03]"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UnlockKeyhole className="h-4 w-4"/>Abrir arquivo clínico protegido</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Abra um arquivo .elolab recebido e salve o conteúdo original neste dispositivo. A senha é validada localmente.</p><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="arquivo-clinico-protegido">Arquivo .elolab</Label><Input id="arquivo-clinico-protegido" type="file" accept=".elolab,application/vnd.elolab.clinical-export+json" onChange={event => setArquivoProtegido(event.target.files?.[0] || null)} /></div><div className="space-y-1.5"><Label htmlFor="senha-arquivo-clinico">Senha</Label><Input id="senha-arquivo-clinico" type="password" autoComplete="off" value={senhaArquivo} onChange={event => setSenhaArquivo(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void abrirArquivoProtegido(); }} /></div></div><Button onClick={() => void abrirArquivoProtegido()} disabled={!arquivoProtegido || !senhaArquivo || abrindoArquivo} aria-busy={abrindoArquivo}><LockKeyhole className="mr-2 h-4 w-4"/>{abrindoArquivo ? 'Abrindo…' : 'Descriptografar e baixar'}</Button></CardContent></Card>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Patient / AllergyIntolerance','Identificação, contatos e alergias'],['Encounter / Composition','Atendimentos e evoluções clínicas'],['ServiceRequest / DiagnosticReport','Solicitações de exames e laudos liberados'],['Observation / Condition / MedicationRequest','Sinais vitais, diagnósticos e prescrições']].map(([title,text])=><Card key={title}><CardContent className="p-4"><p className="font-medium">{title}</p><p className="text-xs text-muted-foreground">{text}</p></CardContent></Card>)}</div>
    <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0"/><span>O arquivo inclui dados pessoais (contato e endereço) e conteúdo clínico. Guarde e compartilhe somente em ambiente autorizado. Laudos anexados são incluídos por links privados temporários, válidos por 1 hora; transfira o Bundle ao destino dentro desse prazo. O CPF é omitido; a auditoria registra apenas metadados da exportação. Integrações DICOM devem usar QIDO-RS, WADO-RS e STOW-RS com um PACS configurado.</span></div>
    {arquivoPendente && <ExportacaoClinicaProtegida open onOpenChange={open => { if (!open) setArquivoPendente(null); }} conteudo={arquivoPendente.conteudo} nomeArquivo={arquivoPendente.nomeArquivo} tipo={arquivoPendente.tipo} />}
  </div>;
}
