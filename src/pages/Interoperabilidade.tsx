import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { useEffect, useRef, useState } from 'react';
import { Download, FileJson, ShieldCheck, LockKeyhole, UnlockKeyhole } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExportacaoClinicaProtegida } from '@/components/clinical/ExportacaoClinicaProtegida';
import { descriptografarExportClinico } from '@/lib/clinicalExportEncryption';
import { PageHeader } from '@/components/PageHeader';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/checkbox';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { formatDateTimeSaoPaulo } from '@/lib/dateOnly';
import { GRUPOS_FHIR, filtrarBundleFhir, type GrupoFhir } from '@/lib/fhirExportFiltro';

export default function Interoperabilidade() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pacienteId, setPacienteId] = useState('');
  const { profile } = useSupabaseAuth();
  // Filtros aplicados ao Bundle antes de protegê-lo: grupos de recursos e período.
  const [grupos, setGrupos] = useState<GrupoFhir[]>(GRUPOS_FHIR.map(grupo => grupo.chave));
  const [periodoDe, setPeriodoDe] = useState('');
  const [periodoAte, setPeriodoAte] = useState('');
  const alternarGrupo = (grupo: GrupoFhir, marcado: boolean) => setGrupos(atual => marcado ? [...new Set([...atual, grupo])] : atual.filter(item => item !== grupo));
  const periodoInvalido = !!periodoDe && !!periodoAte && periodoDe > periodoAte;

  // Histórico das exportações (só metadados; o conteúdo nunca é guardado).
  // A política do banco mostra a lista apenas a quem gerencia os dados da clínica.
  const historicoQuery = useQuery({
    queryKey: ['interoperability-exports', profile?.clinica_id ?? null],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('interoperability_exports')
        .select('id, created_at, formato, quantidade_recursos, paciente_id, pacientes(nome, nome_social)')
        .eq('clinica_id', profile!.clinica_id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; created_at: string; formato: string; quantidade_recursos: number; paciente_id: string; pacientes?: { nome?: string | null; nome_social?: string | null } | null }>;
    },
  });
  const [exporting, setExporting] = useState(false);
  const [arquivoPendente, setArquivoPendente] = useState<{ conteudo: string; nomeArquivo: string; tipo: 'application/json' | 'application/xml' } | null>(null);
  const [arquivoProtegido, setArquivoProtegido] = useState<File | null>(null);
  const [senhaArquivo, setSenhaArquivo] = useState('');
  const [abrindoArquivo, setAbrindoArquivo] = useState(false);
  const exportScreen = searchParams.get('workflow') === 'proteger-exportacao';
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
  const wasOnExportScreen = useRef(false);

  useEffect(() => {
    if (!exportScreen && wasOnExportScreen.current) {
      wasOnExportScreen.current = false;
      setArquivoPendente(null);
      window.requestAnimationFrame(() => {
        const trigger = exportTriggerRef.current;
        if (trigger) trigger.focus();
        else document.getElementById('main-content')?.focus({ preventScroll: true });
      });
    } else if (exportScreen) {
      wasOnExportScreen.current = true;
    }
  }, [exportScreen]);

  const abrirProtecao = (arquivo: { conteudo: string; nomeArquivo: string; tipo: 'application/json' | 'application/xml' }) => {
    setArquivoPendente(arquivo);
    const params = new URLSearchParams(searchParams);
    params.set('workflow', 'proteger-exportacao');
    setSearchParams(params);
  };

  const fecharProtecao = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('workflow');
    setSearchParams(params, { replace: true });
  };

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

      const filtrado = filtrarBundleFhir(bundle, { grupos, de: periodoDe || undefined, ate: periodoAte || undefined });
      void historicoQuery.refetch();
      if ((filtrado.entry?.length ?? 0) <= 1) {
        toast.info('Nenhum registro clínico no filtro escolhido.', { description: 'Amplie o período ou marque mais grupos de recursos.' });
        return;
      }
      abrirProtecao({ conteudo: JSON.stringify(filtrado, null, 2), nomeArquivo: `fhir-${pacienteId}`, tipo: 'application/json' });
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

  if (exportScreen) {
    return <div className="space-y-5">
      {arquivoPendente ? (
        <ExportacaoClinicaProtegida
          onCancel={fecharProtecao}
          conteudo={arquivoPendente.conteudo}
          nomeArquivo={arquivoPendente.nomeArquivo}
          tipo={arquivoPendente.tipo}
        />
      ) : (
        <section className="mx-auto w-full max-w-3xl space-y-4" data-testid="protected-export-expired">
          <PageHeader title="Exportação não está mais disponível" description="O conteúdo clínico é mantido apenas nesta sessão e não foi incluído na URL nem salvo no navegador." icon={<ShieldCheck />} actions={<Button variant="outline" onClick={fecharProtecao}>Voltar à interoperabilidade</Button>} />
          <p role="alert" className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm text-muted-foreground">Gere a exportação novamente para protegê-la e baixar o arquivo.</p>
        </section>
      )}
    </div>;
  }

  return <div className="space-y-6">
    <PageHeader title="Interoperabilidade clínica" description="Exportação segura e auditada no padrão HL7 FHIR R4." icon={<ShieldCheck />} />
    <Card className="rounded-2xl border-border/60 shadow-xs"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><FileJson className="h-4 w-4"/></span>Bundle clínico FHIR R4</CardTitle></CardHeader><CardContent className="space-y-4"><div className="max-w-xl"><label htmlFor="fhir-paciente" className="mb-1.5 block text-sm font-medium">Paciente</label><PacienteCombobox id="fhir-paciente" value={pacienteId} onChange={setPacienteId} disabled={exporting} /></div>
      <fieldset className="space-y-2" disabled={exporting}>
        <legend className="mb-1.5 text-sm font-medium">Incluir</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {GRUPOS_FHIR.map(grupo => (
            <label key={grupo.chave} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
              <Checkbox checked={grupos.includes(grupo.chave)} onCheckedChange={marcado => alternarGrupo(grupo.chave, marcado === true)} />
              {grupo.rotulo}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">A identificação do paciente vai sempre junto.</p>
      </fieldset>
      <div className="grid max-w-xl gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="fhir-periodo-de">De</Label><Input id="fhir-periodo-de" type="date" value={periodoDe} max={periodoAte || undefined} onChange={event => setPeriodoDe(event.target.value)} disabled={exporting} /></div>
        <div className="space-y-1.5"><Label htmlFor="fhir-periodo-ate">Até</Label><Input id="fhir-periodo-ate" type="date" value={periodoAte} min={periodoDe || undefined} onChange={event => setPeriodoAte(event.target.value)} disabled={exporting} /></div>
        {periodoInvalido && <p role="alert" className="text-xs text-destructive sm:col-span-2">A data inicial deve ser anterior à final.</p>}
      </div>
      <Button ref={exportTriggerRef} className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={exportar} disabled={exporting || !pacienteId || grupos.length === 0 || periodoInvalido} aria-busy={exporting}><Download className="mr-2 h-4 w-4"/>{exporting?'Gerando…':'Exportar JSON FHIR'}</Button></CardContent></Card>
    <Card className="rounded-2xl border-border/60 shadow-xs"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><UnlockKeyhole className="h-4 w-4"/></span>Abrir arquivo clínico protegido</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Abra um arquivo .elolab recebido e salve o conteúdo original neste dispositivo. A senha é validada localmente.</p><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="arquivo-clinico-protegido">Arquivo .elolab</Label><Input id="arquivo-clinico-protegido" type="file" accept=".elolab,application/vnd.elolab.clinical-export+json" onChange={event => setArquivoProtegido(event.target.files?.[0] || null)} /></div><div className="space-y-1.5"><Label htmlFor="senha-arquivo-clinico">Senha</Label><Input id="senha-arquivo-clinico" type="password" autoComplete="off" value={senhaArquivo} onChange={event => setSenhaArquivo(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void abrirArquivoProtegido(); }} /></div></div><Button className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => void abrirArquivoProtegido()} disabled={!arquivoProtegido || !senhaArquivo || abrindoArquivo} aria-busy={abrindoArquivo}><LockKeyhole className="mr-2 h-4 w-4"/>{abrindoArquivo ? 'Abrindo…' : 'Descriptografar e baixar'}</Button></CardContent></Card>
    <Card className="rounded-2xl border-border/60 shadow-xs">
      <CardHeader><CardTitle className="text-base">Histórico de exportações</CardTitle></CardHeader>
      <CardContent>
        {historicoQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">Carregando histórico…</p>
          : historicoQuery.isError ? <div className="space-y-2"><p role="alert" className="text-sm text-muted-foreground">Não foi possível carregar o histórico.</p><Button variant="outline" size="sm" onClick={() => void historicoQuery.refetch()}>Tentar novamente</Button></div>
          : (historicoQuery.data?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">Nenhuma exportação registrada. O histórico aparece para quem administra os dados da clínica.</p>
          : <ul className="divide-y divide-border">
              {historicoQuery.data!.map(item => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium">{item.pacientes?.nome_social || item.pacientes?.nome || 'Paciente'}</span>
                    <span className="block text-xs text-muted-foreground">{formatDateTimeSaoPaulo(item.created_at)} · {item.quantidade_recursos} {item.quantidade_recursos === 1 ? 'recurso' : 'recursos'}</span>
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">FHIR R4</span>
                </li>
              ))}
            </ul>}
        <p className="mt-3 text-xs text-muted-foreground">A quantidade é a do Bundle gerado pelo servidor, antes dos filtros desta tela.</p>
      </CardContent>
    </Card>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Patient / AllergyIntolerance','Identificação, contatos e alergias'],['Encounter / Composition','Atendimentos e evoluções clínicas'],['ServiceRequest / DiagnosticReport','Solicitações de exames e laudos liberados'],['Observation / Condition / MedicationRequest','Sinais vitais, diagnósticos e prescrições']].map(([title,text])=><Card key={title} className="rounded-2xl border-border/60 shadow-xs"><CardContent className="p-4"><p className="font-medium">{title}</p><p className="text-xs text-muted-foreground">{text}</p></CardContent></Card>)}</div>
    <div role="note" className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-warning-foreground"><ShieldCheck className="h-4 w-4 shrink-0"/><span>O arquivo inclui dados pessoais (contato e endereço) e conteúdo clínico. Guarde e compartilhe somente em ambiente autorizado. Laudos anexados são incluídos por links privados temporários, válidos por 1 hora; transfira o Bundle ao destino dentro desse prazo. O CPF é omitido; a auditoria registra apenas metadados da exportação. Integrações DICOM devem usar QIDO-RS, WADO-RS e STOW-RS com um PACS configurado.</span></div>
  </div>;
}
