import { formatWithDatePreference as format } from '@/lib/datePreference';
import { formatDate, nomeMedico } from '@/lib/formatters';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, FileText, Plus, Save, CalendarCheck, FileDown, History, Loader2,
  Heart, Thermometer, Activity, Scale, Ruler, Droplets,
  Stethoscope, Brain, Bone, Eye as EyeIcon, Pill, Paperclip,
  ClipboardList, AlertTriangle, User, Clock, ChevronDown, ChevronRight,
  Printer, BookOpen, ShieldCheck, FileCheck, X, Clipboard,
  Phone, Mail, Building2, CreditCard, Baby, Shield, Lock, PenLine,
  TestTube, ArrowRight, UserCheck, BadgeCheck, Share2, MessageCircle, ExternalLink,
  Hash, MapPin, Fingerprint, FileEdit, ScrollText,
} from 'lucide-react';

import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { gerarProntuarioPDF, downloadPDF, openPDF, sharePDFWhatsApp } from '@/lib/pdfGenerator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import {
  AllergyAlert, Cid10Search, ClinicalProtocols,
  ReturnScheduler, DischargeReport, AnexosProntuario,
  VitalSignsChart, PatientTimeline, PatientPhoto, DigitalSignature,
  DrugInteractionChecker, ProcedimentosDoAtendimento,
  ClinicalSafetyPanel,
} from '@/components/clinical';
import { ProntuarioAdendos } from '@/components/clinical/ProntuarioAdendos';
import { useMedicos, useAgendamentos, useAgendamentosPeriodo, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { supabase } from '@/integrations/supabase/client';
import { agruparBaixasEstoque } from '@/lib/stockPrescriptionDeductions';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { exportToFHIR, exportToXML } from '@/lib/clinicalExport';
import { ageFromDateOnly, parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { useBuscaPacientes } from '@/hooks/useBuscaPacientes';
import { PatientSearchResult } from '@/components/clinical/PatientSearchResult';
import { mensagemDeErro } from '@/lib/erros';
import { useSearchParams } from 'react-router-dom';
import { autorizarLeituraHistoricoPaciente, registrarAcessoProntuario, registrarExportacaoProntuarios } from '@/lib/prontuarioAudit';
import { obterIdentificacaoAssinante } from '@/lib/prontuarioSigner';
import { lerConfigsClinica } from '@/lib/configClinica';
import { buscarPorIdsEmLotes, buscarTodasAsPaginas, combinarEventosAuditoria, EventoAuditoriaExportavel, filtrarEventosAuditoria, gerarCsvAuditoria } from '@/lib/prontuarioAuditExport';
import { UnsavedChangesDialog } from '@/components/ConfirmDialog';
import { ExportacaoClinicaProtegida } from '@/components/clinical/ExportacaoClinicaProtegida';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { filtrarRascunhosAbertos } from '@/lib/prontuarioDrafts';

// ─── Types ─────────────────────────────────────────────────
interface PrescricaoForm {
  medicamento: string;
  dosagem: string;
  posologia: string;
  duracao: string;
  quantidade: string;
  observacoes: string;
}

interface RascunhoNaFila {
  id: string;
  paciente_id: string;
  medico_id: string | null;
  data: string;
  queixa_principal: string | null;
  updated_at: string | null;
  assinado: boolean | null;
  pacientes?: { nome?: string | null; nome_social?: string | null } | Array<{ nome?: string | null; nome_social?: string | null }> | null;
  [key: string]: unknown;
}

interface SinaisVitais {
  pressao_sistolica: string;
  pressao_diastolica: string;
  frequencia_cardiaca: string;
  frequencia_respiratoria: string;
  temperatura: string;
  saturacao: string;
  peso: string;
  altura: string;
  imc: string;
  glicemia: string;
  circunferencia_abdominal: string;
  circunferencia_craniana: string;
  glasgow: string;
  dor: string;
}

const emptySinaisVitais: SinaisVitais = {
  pressao_sistolica: '', pressao_diastolica: '',
  frequencia_cardiaca: '', frequencia_respiratoria: '',
  temperatura: '', saturacao: '',
  peso: '', altura: '', imc: '',
  glicemia: '', circunferencia_abdominal: '', circunferencia_craniana: '',
  glasgow: '', dor: '',
};

const emptyProntuario = {
  paciente_id: '', medico_id: '', agendamento_id: null as string | null, data: '',
  queixa_principal: '', historia_doenca_atual: '',
  historia_patologica_pregressa: '', historia_familiar: '',
  historia_social: '', revisao_sistemas: '',
  alergias_relatadas: '', medicamentos_em_uso: '',
  sinais_vitais: {} as SinaisVitais,
  exames_fisicos: '',
  exame_cabeca_pescoco: '', exame_torax: '',
  exame_abdomen: '', exame_membros: '',
  exame_neurologico: '', exame_pele: '',
  hipotese_diagnostica: '', diagnostico_principal: '',
  diagnosticos_secundarios: [] as string[],
  conduta: '', plano_terapeutico: '',
  orientacoes_paciente: '', observacoes_internas: '',
};

// ─── Helpers ───────────────────────────────────────────────
function calcularIdade(dn: string | null) {
  if (!dn) return 0;
  return ageFromDateOnly(dn);
}

function calcularIMC(peso: string, altura: string) {
  const numero = (valor: string) => {
    const normalizado = valor.trim().replace(',', '.');
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalizado)) return Number.NaN;
    return Number(normalizado);
  };
  const p = numero(peso), a = numero(altura);
  if (!Number.isFinite(p) || !Number.isFinite(a) || p <= 0 || a <= 0) return '';
  const altM = a > 3 ? a / 100 : a;
  const imc = p / (altM * altM);
  return Number.isFinite(imc) ? imc.toFixed(1) : '';
}

function classificarIMC(imc: string) {
  const v = parseFloat(imc);
  if (!v) return null;
  if (v < 18.5) return { label: 'Abaixo', color: 'text-info' };
  if (v < 25) return { label: 'Normal', color: 'text-success' };
  if (v < 30) return { label: 'Sobrepeso', color: 'text-warning' };
  return { label: 'Obesidade', color: 'text-destructive' };
}

// ─── Vital Signs Grid ──────────────────────────────────────
function VitalSignsInput({ sinais, onChange, disabled = false }: { sinais: SinaisVitais; onChange: (s: SinaisVitais) => void; disabled?: boolean }) {
  const update = (field: keyof SinaisVitais, value: string) => {
    const next = { ...sinais, [field]: value };
    if (field === 'peso' || field === 'altura') {
      next.imc = calcularIMC(field === 'peso' ? value : next.peso, field === 'altura' ? value : next.altura);
    }
    onChange(next);
  };

  const imcClass = classificarIMC(sinais.imc);

  const fields: { key: string; label: string; icon: any; field?: keyof SinaisVitais; placeholder?: string; dual?: boolean; accent: string }[] = [
    { key: 'pa', label: 'PA (mmHg)', icon: Heart, accent: 'text-destructive', dual: true },
    { key: 'fc', label: 'FC (bpm)', icon: Heart, accent: 'text-destructive', field: 'frequencia_cardiaca', placeholder: '72' },
    { key: 'fr', label: 'FR (irpm)', icon: Activity, accent: 'text-info', field: 'frequencia_respiratoria', placeholder: '16' },
    { key: 'temp', label: 'Temp (°C)', icon: Thermometer, accent: 'text-warning', field: 'temperatura', placeholder: '36.5' },
    { key: 'spo2', label: 'SpO₂ (%)', icon: Droplets, accent: 'text-info', field: 'saturacao', placeholder: '98' },
    { key: 'peso', label: 'Peso (kg)', icon: Scale, accent: 'text-success', field: 'peso', placeholder: '70' },
    { key: 'altura', label: 'Alt (cm)', icon: Ruler, accent: 'text-primary', field: 'altura', placeholder: '170' },
    { key: 'glicemia', label: 'Glicemia (mg/dL)', icon: Droplets, accent: 'text-warning', field: 'glicemia', placeholder: '90' },
    { key: 'circ-abd', label: 'Cintura (cm)', icon: Ruler, accent: 'text-info', field: 'circunferencia_abdominal', placeholder: '82' },
    { key: 'circ-cran', label: 'Cabeça (cm)', icon: Ruler, accent: 'text-info', field: 'circunferencia_craniana', placeholder: '54' },
    { key: 'glasgow', label: 'Glasgow', icon: Brain, accent: 'text-primary', field: 'glasgow', placeholder: '15' },
    { key: 'dor', label: 'Dor (0-10)', icon: AlertTriangle, accent: 'text-warning', field: 'dor', placeholder: '0' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sinais Vitais</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {fields.map(f => {
          const Icon = f.icon;
          return (
            <div key={f.key} className="rounded-xl border border-border/60 bg-card p-2.5 space-y-1">
              <Label htmlFor={f.dual ? undefined : `vital-${f.key}`} className={`text-xs font-semibold flex items-center gap-1 ${f.accent}`}>
                <Icon className="h-3 w-3" />{f.label}
              </Label>
              {f.dual ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="vital-pa-sistolica" className="text-xs text-muted-foreground">Sistólica</Label>
                    <Input id="vital-pa-sistolica" aria-label="Pressão arterial sistólica" inputMode="numeric" placeholder="120" value={sinais.pressao_sistolica} onChange={e => update('pressao_sistolica', e.target.value)} className="h-9 px-2 text-sm" disabled={disabled} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="vital-pa-diastolica" className="text-xs text-muted-foreground">Diastólica</Label>
                    <Input id="vital-pa-diastolica" aria-label="Pressão arterial diastólica" inputMode="numeric" placeholder="80" value={sinais.pressao_diastolica} onChange={e => update('pressao_diastolica', e.target.value)} className="h-9 px-2 text-sm" disabled={disabled} />
                  </div>
                </div>
              ) : (
                <Input id={`vital-${f.key}`} aria-label={f.label} placeholder={f.placeholder} value={(sinais as any)[f.field!] || ''} onChange={e => update(f.field!, e.target.value)} inputMode={['peso', 'altura', 'temperatura', 'glicemia', 'circunferencia_abdominal', 'circunferencia_craniana'].includes(f.field!) ? 'decimal' : 'numeric'} className="h-9 px-2 text-sm" disabled={disabled} />
              )}
            </div>
          );
        })}
        <div className="rounded-xl border border-border/60 bg-card p-2.5 space-y-1">
          <Label className="text-xs font-semibold text-info">IMC</Label>
          <div className="h-7 flex items-center px-2 text-xs font-bold">
            {sinais.imc || '—'}
            {imcClass && <span className={`ml-1 text-xs ${imcClass.color}`}>({imcClass.label})</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Collapsible Section ───────────────────────────────────
function Section({ icon: Icon, title, children, collapsible = false }: {
  icon: React.ElementType; title: string; children: React.ReactNode; collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => collapsible && setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2.5 w-full hover:bg-muted/30 transition-colors"
      >
        <Icon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-bold text-foreground uppercase tracking-wider">{title}</span>
        {collapsible && (
          <motion.div animate={{ rotate: open ? 180 : 0 }} className="ml-auto">
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </motion.div>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Patient File Card ─────────────────────────────────────
function FichaPaciente({ paciente, convenioNome }: { paciente: any; convenioNome: string }) {
  const idade = calcularIdade(paciente.data_nascimento);
  const isMenor = paciente.data_nascimento ? idade < 18 : false;

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div className="rounded-[24px] overflow-hidden border border-border/60 bg-card shadow-xs">
        <div className="relative overflow-hidden bg-[image:var(--gradient-hero)] p-5 text-white">
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -right-12 h-40 w-40 rounded-full bg-highlight/40 blur-3xl" />
          <div className="relative flex items-start gap-4">
            <PatientPhoto
              pacienteId={paciente.id}
              pacienteNome={paciente.nome}
              currentPhotoUrl={paciente.foto_url}
              size="lg"
              editable={false}
            />
            <div className="flex-1 min-w-0">
              <h2 className="break-words text-xl font-extrabold leading-tight text-white [overflow-wrap:anywhere]">
                {paciente.nome_social || paciente.nome}
              </h2>
              {paciente.nome_social && (
                <p className="text-xs text-white/75">Civil: {paciente.nome}</p>
              )}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <Badge className="border-white/25 bg-white/15 px-2 py-0 text-xs font-bold text-white">
                  {paciente.data_nascimento ? `${idade} anos` : 'Idade N/I'}
                </Badge>
                {paciente.sexo && (
                  <Badge variant="outline" className="border-white/25 px-1.5 py-0 text-xs text-white">
                    {paciente.sexo === 'masculino' ? '♂ Masc' : paciente.sexo === 'feminino' ? '♀ Fem' : 'Outro'}
                  </Badge>
                )}
                {paciente.data_nascimento && (
                  <span className="text-xs text-white/75">
                    {formatDate(paciente.data_nascimento, 'short')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Data grid */}
        <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs border-t border-border/40">
          {paciente.cpf && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Fingerprint className="h-3 w-3 flex-shrink-0" />CPF: {paciente.cpf}
            </div>
          )}
          {paciente.telefone && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="h-3 w-3 flex-shrink-0" />{paciente.telefone}
            </div>
          )}
          {paciente.email && (
            <div className="flex items-center gap-1.5 text-muted-foreground truncate col-span-2 sm:col-span-1">
              <Mail className="h-3 w-3 flex-shrink-0" /><span className="truncate">{paciente.email}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Building2 className="h-3 w-3 flex-shrink-0" />{convenioNome}
          </div>
          {paciente.numero_carteira && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CreditCard className="h-3 w-3 flex-shrink-0" />{paciente.numero_carteira}
            </div>
          )}
        </div>

        {/* Alergias */}
        {paciente.alergias && paciente.alergias.length > 0 && (
          <div className="px-4 pb-3">
            <AllergyAlert alergias={paciente.alergias} />
          </div>
        )}

        {/* Responsável */}
        {isMenor && paciente.nome_responsavel && (
          <div className="mx-4 mb-3 flex items-center gap-2 p-2 rounded-lg bg-warning/5 border border-warning/20 text-xs">
            <Baby className="h-3.5 w-3.5 text-warning flex-shrink-0" />
            <span className="text-warning">
              <strong>Responsável:</strong> {paciente.nome_responsavel}
              {paciente.parentesco_responsavel && ` (${paciente.parentesco_responsavel})`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Audit Log ─────────────────────────────────────────────
async function carregarPrescricoesParaExportacao(prontuarioIds: string[]) {
  return buscarPorIdsEmLotes(prontuarioIds, (lote) => buscarTodasAsPaginas((inicio, fim) =>
    supabase.from('prescricoes')
      .select('prontuario_id, medicamento, dosagem, posologia, duracao, quantidade, observacoes')
      .in('prontuario_id', lote)
      .order('prontuario_id', { ascending: true })
      .range(inicio, fim),
  ), 100);
}

function caminhoArquivoClinico(stored: string) {
  if (!stored.startsWith('http')) return stored;
  const afterBucket = stored.split('/medical-attachments/')[1];
  return decodeURIComponent((afterBucket || stored.split('/').slice(-2).join('/')).split('?')[0]);
}

async function blobParaBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function mimeDoArquivo(nome: string) {
  const ext = nome.split('.').pop()?.toLowerCase();
  return ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' } as Record<string, string>)[ext || ''] || 'application/octet-stream';
}

async function carregarDadosCompletosExportacao(pacienteId: string, prontuarioIds: string[]) {
  const ids = [...new Set(prontuarioIds.filter(Boolean))];
  const [prescricoes, exames, anexos, adendos] = await Promise.all([
    carregarPrescricoesParaExportacao(ids),
    buscarTodasAsPaginas((inicio, fim) => supabase.from('exames')
      .select('id,tipo_exame,data_solicitacao,data_realizacao,status,resultado,observacoes,arquivo_resultado')
      .eq('paciente_id', pacienteId).order('data_solicitacao', { ascending: true }).range(inicio, fim)),
    ids.length ? buscarTodasAsPaginas((inicio, fim) => supabase.from('anexos_prontuario')
      .select('id,nome_arquivo,tipo_arquivo,categoria,descricao,created_at,url_arquivo,tamanho_bytes')
      .in('prontuario_id', ids).order('created_at', { ascending: true }).range(inicio, fim)) : Promise.resolve([]),
    ids.length ? buscarTodasAsPaginas((inicio, fim) => (supabase as any).from('prontuario_adendos')
      .select('id,prontuario_id,tipo,motivo,texto,medico_nome,crm,created_at')
      .in('prontuario_id', ids).order('created_at', { ascending: true }).range(inicio, fim)) : Promise.resolve([]),
  ]);

  const arquivosPendentes = [
    ...anexos.map((anexo: any) => ({ id: anexo.id, nome: anexo.nome_arquivo, tipo: anexo.tipo_arquivo, path: caminhoArquivoClinico(anexo.url_arquivo), categoria: anexo.categoria, descricao: anexo.descricao, data: anexo.created_at, tamanho: anexo.tamanho_bytes, grupo: 'anexo' as const })),
    ...exames.filter((exame: any) => exame.arquivo_resultado).map((exame: any) => ({ id: exame.id, nome: exame.arquivo_resultado.split('/').pop() || `laudo-${exame.id}`, tipo: mimeDoArquivo(exame.arquivo_resultado), path: caminhoArquivoClinico(exame.arquivo_resultado), tamanho: null, grupo: 'exame' as const })),
  ];
  const tamanhoDeclarado = arquivosPendentes.reduce((total, arquivo) => total + (arquivo.tamanho || 0), 0);
  if (tamanhoDeclarado > 50 * 1024 * 1024) throw new Error('Os arquivos anexados ultrapassam 50 MB. Exporte os documentos em lotes menores.');
  let tamanhoReal = 0;
  const arquivosExportados = [] as Array<{ id: string; nome: string; tipo: string; categoria?: string; descricao?: string; data?: string; conteudoBase64: string }>;
  const examesExportados = exames.map((exame: any) => ({
    id: exame.id, tipo: exame.tipo_exame, data: exame.data_realizacao || exame.data_solicitacao,
    status: exame.status, resultado: exame.resultado || undefined, observacoes: exame.observacoes || undefined,
  })) as Array<{ id: string; tipo: string; data?: string; status?: string; resultado?: string; observacoes?: string; conteudoBase64?: string; nomeArquivo?: string; tipoArquivo?: string }>;
  for (const arquivo of arquivosPendentes) {
    const { data, error } = await supabase.storage.from('medical-attachments').download(arquivo.path);
    if (error || !data) throw new Error(`Não foi possível incluir o arquivo ${arquivo.nome} na portabilidade.`);
    tamanhoReal += data.size;
    if (tamanhoReal > 50 * 1024 * 1024) throw new Error('Os arquivos anexados ultrapassam 50 MB. Exporte os documentos em lotes menores.');
    const conteudoBase64 = await blobParaBase64(data);
    if (arquivo.grupo === 'anexo') {
      arquivosExportados.push({ id: arquivo.id, nome: arquivo.nome, tipo: arquivo.tipo, categoria: arquivo.categoria || undefined, descricao: arquivo.descricao || undefined, data: arquivo.data || undefined, conteudoBase64 });
    } else {
      const exame = examesExportados.find(item => item.id === arquivo.id);
      if (exame) Object.assign(exame, { conteudoBase64, nomeArquivo: arquivo.nome, tipoArquivo: arquivo.tipo });
    }
  }
  return {
    prescricoes: prescricoes.map((item: any) => ({ ...item })),
    exames: examesExportados,
    anexos: arquivosExportados,
    adendos: adendos.map((item: any) => ({ id: item.id, tipo: item.tipo, motivo: item.motivo, texto: item.texto, medico_nome: item.medico_nome, crm: item.crm, data: item.created_at })),
  };
}

function ProntuarioAuditLog({ prontuarioId, clinicaId }: { prontuarioId: string; clinicaId?: string }) {
  const [logs, setLogs] = useState<EventoAuditoriaExportavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [acao, setAcao] = useState('todos');
  const [userId, setUserId] = useState('todos');
  const [metadados, setMetadados] = useState({
    softwareNome: 'EloLab', softwareFornecedor: 'EloLab', softwareVersao: '0.0.0',
    softwareBuild: (globalThis as any).__APP_BUILD_ID__ || 'dev-build',
    instituicaoNome: '', instituicaoCnes: '', instituicaoCnpj: '',
  });

  useEffect(() => {
    if (!prontuarioId) return;
    setLoading(true);
    setErro(null);
    let active = true;
    const carregar = async () => {
      const db = supabase as any;
      const [acessos, alteracoes] = await Promise.all([
        buscarTodasAsPaginas<EventoAuditoriaExportavel>((inicio, fim) =>
        db.from('prontuario_acessos')
          .select('id,created_at,acao,user_id,user_nome,user_crm,prontuario_id')
          .eq('prontuario_id', prontuarioId)
          .order('created_at', { ascending: false }).order('id', { ascending: false })
          .range(inicio, fim).then(({ data, error }: any) => ({
            data: (data || []).map((a: any) => ({
              id: a.id, source: 'prontuario_acessos', ts: a.created_at,
              action: a.acao, user_id: a.user_id, user_name: a.user_nome,
              user_crm: a.user_crm, prontuario_id: a.prontuario_id,
            } as EventoAuditoriaExportavel)), error,
          })), 500),
        buscarTodasAsPaginas<EventoAuditoriaExportavel>((inicio, fim) =>
          db.from('audit_log')
            .select('id,timestamp,action,user_id,user_name,record_id,changes')
            .eq('collection', 'prontuarios').eq('record_id', prontuarioId)
            .order('timestamp', { ascending: false }).order('id', { ascending: false })
            .range(inicio, fim).then(({ data, error }: any) => ({
              data: (data || []).map((event: any) => ({
                id: event.id, source: 'audit_log', ts: event.timestamp,
                action: event.action === 'insert' ? 'insert' : event.action,
                operacaoBanco: event.action, possuiDiff: Boolean(event.changes),
                user_id: event.user_id, user_name: event.user_name,
                user_crm: null, prontuario_id: event.record_id,
              } as EventoAuditoriaExportavel)), error,
            })), 500),
      ]);
      const todos = combinarEventosAuditoria(acessos, alteracoes);
      let configClinica: any = {};
      let clinica: any = null;
      if (clinicaId) {
        const [config, clinicResult] = await Promise.all([
          lerConfigsClinica(clinicaId, ['config_clinica']).catch(() => ({})),
          db.from('clinicas').select('nome,cnpj').eq('id', clinicaId).maybeSingle(),
        ]);
        configClinica = (config as any).config_clinica || {};
        clinica = clinicResult.data;
      }
      if (!active) return;
      setLogs(todos);
      setMetadados((current) => ({
        ...current,
        instituicaoNome: configClinica.nomeClinica || clinica?.nome || '',
        instituicaoCnes: configClinica.cnes || '',
        instituicaoCnpj: configClinica.cnpj || clinica?.cnpj || '',
      }));
      setLoading(false);
    };
    carregar().catch(error => {
      if (!active) return;
      setErro(error);
      setLogs([]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [prontuarioId, clinicaId, reload]);

  if (loading) return <Skeleton className="h-32" />;
  if (erro) return <ErrorState compact error={erro} title="Não foi possível carregar a trilha de auditoria" onRetry={() => { setLoading(true); setReload(value => value + 1); }} />;

  const actionLabel = (a: string) => ({
    create: 'Criação', insert: 'Criação', update: 'Edição', delete: 'Exclusão', access: 'Acesso',
    visualizacao: 'Visualização', edicao: 'Edição', assinatura: 'Assinatura',
    adendo: 'Adendo', sign: 'Assinatura', edit_request: 'Solicitou edição',
    exportacao: 'Exportação', impressao: 'Impressão',
  } as Record<string, string>)[a] || a;
  const logsFiltrados = filtrarEventosAuditoria(logs, {
    dataInicial, dataFinal, acao, userId,
  });
  const usuarios = [...new Map(logs.filter(log => log.user_id).map(log => [log.user_id!, log])).values()];
  const exportar = () => {
    const csv = gerarCsvAuditoria(logsFiltrados, metadados);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `auditoria-prontuario-${prontuarioId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" /> Trilha de Auditoria
        </h4>
        <Button type="button" variant="outline" size="sm" onClick={exportar} disabled={logsFiltrados.length === 0}>
          <FileDown className="mr-1.5 h-3.5 w-3.5" />Exportar CSV ({logsFiltrados.length})
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <div className="space-y-1"><Label htmlFor="audit-data-inicial" className="text-xs">De</Label><Input id="audit-data-inicial" type="date" value={dataInicial} onChange={event => setDataInicial(event.target.value)} className="h-9" /></div>
        <div className="space-y-1"><Label htmlFor="audit-data-final" className="text-xs">Até</Label><Input id="audit-data-final" type="date" value={dataFinal} onChange={event => setDataFinal(event.target.value)} className="h-9" /></div>
        <div className="space-y-1"><Label htmlFor="audit-evento" className="text-xs">Evento</Label><Select value={acao} onValueChange={setAcao}><SelectTrigger id="audit-evento" className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{[...new Set(logs.map(log => log.action))].map(evento => <SelectItem key={evento} value={evento}>{actionLabel(evento)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label htmlFor="audit-usuario" className="text-xs">Usuário (ID)</Label><Select value={userId} onValueChange={setUserId}><SelectTrigger id="audit-usuario" className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{usuarios.map(log => <SelectItem key={log.user_id!} value={log.user_id!}>{log.user_name || log.user_id} · {log.user_id!.slice(0, 8)}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <p className="text-xs text-muted-foreground">{logsFiltrados.length} de {logs.length} eventos. O CSV contém os IDs do registro e do usuário, sem dados do paciente ou conteúdo clínico.</p>
      {(!metadados.instituicaoCnes || !metadados.instituicaoCnpj) && (
        <p className="text-xs text-warning">CNES ou CNPJ não configurado. O campo correspondente ficará vazio no arquivo; complete em Configurações da clínica.</p>
      )}
      {logs.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Nenhum registro de auditoria</p>
      ) : logsFiltrados.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Nenhum evento corresponde aos filtros.</p>
      ) : (
        <div className="space-y-1.5">
          {logsFiltrados.map((log) => (
            <div key={log.id} className="flex items-start gap-2.5 text-xs border-l-2 border-muted pl-3 py-1.5">
              <Lock className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-xs px-1.5 py-0">{actionLabel(log.action)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {log.ts ? format(new Date(log.ts), "dd/MM/yy HH:mm", { locale: ptBR }) : '—'}
                  </span>
                </div>
                {(log.user_name || log.user_id) && (
                  <p className="text-xs text-muted-foreground">
                    por {log.user_name || 'Usuário'} · ID {log.user_id}{log.user_crm ? ` — CRM ${log.user_crm}` : ''}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded-lg p-2">
        <ShieldCheck className="h-3 w-3" />
        <span>Trilha cronológica deste registro. Eventos antigos podem ter dados incompletos.</span>
      </div>
    </div>
  );
}

// ─── Related Records ───────────────────────────────────────
function RelatedRecords({ pacienteId }: { pacienteId: string }) {
  const [exames, setExames] = useState<any[]>([]);
  const [atestados, setAtestados] = useState<any[]>([]);
  const [encaminhamentos, setEncaminhamentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<unknown>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!pacienteId) return;
    setLoading(true);
    setErro(null);
    let active = true;
    Promise.all([
      supabase.from('exames').select('id, tipo_exame, status, data_solicitacao').eq('paciente_id', pacienteId).order('data_solicitacao', { ascending: false }).limit(10),
      supabase.from('atestados').select('id, tipo, data_emissao, dias').eq('paciente_id', pacienteId).order('data_emissao', { ascending: false }).limit(10),
      supabase.from('encaminhamentos').select('id, especialidade_destino, status, urgencia').eq('paciente_id', pacienteId).order('data_encaminhamento', { ascending: false }).limit(10),
    ]).then(([ex, at, en]) => {
      if (!active) return;
      if (ex.error || at.error || en.error) {
        setErro(ex.error || at.error || en.error);
        setExames([]); setAtestados([]); setEncaminhamentos([]);
        setLoading(false);
        return;
      }
      setExames(ex.data || []); setAtestados(at.data || []); setEncaminhamentos(en.data || []);
      setLoading(false);
    }).catch(error => {
      if (!active) return;
      setErro(error);
      setLoading(false);
    });
    return () => { active = false; };
  }, [pacienteId, reload]);

  if (loading) return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>;
  if (erro) return <ErrorState compact error={erro} title="Não foi possível carregar os registros relacionados" onRetry={() => { setLoading(true); setReload(value => value + 1); }} />;

  const sc = (s: string) => {
    if (s === 'laudo_disponivel' || s === 'concluido') return 'bg-success/10 text-success';
    if (s === 'pendente' || s === 'solicitado') return 'bg-warning/10 text-warning';
    if (s === 'em_andamento') return 'bg-info/10 text-info';
    return 'bg-muted text-muted-foreground';
  };

  const RecordItem = ({ icon: Icon, label, sub, badge, badgeClass }: any) => (
    <div className="flex items-center justify-between border border-border/40 rounded-lg px-3 py-2 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="font-medium truncate">{label}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
      {badge && <Badge className={`text-xs px-1.5 py-0 ${badgeClass}`}>{badge}</Badge>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><TestTube className="h-3.5 w-3.5" /> Exames ({exames.length})</h4>
        {exames.length === 0 ? <p className="text-xs text-muted-foreground py-2">Nenhum exame</p> : exames.map(e => (
          <RecordItem key={e.id} icon={TestTube} label={e.tipo_exame} sub={e.data_solicitacao ? format(parseDateOnly(e.data_solicitacao)!, 'dd/MM/yy') : ''} badge={e.status?.replace(/_/g, ' ')} badgeClass={sc(e.status)} />
        ))}
      </div>
      <div className="space-y-1.5">
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><FileCheck className="h-3.5 w-3.5" /> Atestados ({atestados.length})</h4>
        {atestados.length === 0 ? <p className="text-xs text-muted-foreground py-2">Nenhum atestado</p> : atestados.map(a => (
          <RecordItem key={a.id} icon={FileCheck} label={a.tipo || 'Atestado'} sub={a.dias ? `(${a.dias}d)` : ''} badge={a.data_emissao ? format(parseDateOnly(a.data_emissao)!, 'dd/MM/yy') : ''} badgeClass="bg-muted text-muted-foreground" />
        ))}
      </div>
      <div className="space-y-1.5">
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><ArrowRight className="h-3.5 w-3.5" /> Encaminhamentos ({encaminhamentos.length})</h4>
        {encaminhamentos.length === 0 ? <p className="text-xs text-muted-foreground py-2">Nenhum encaminhamento</p> : encaminhamentos.map(e => (
          <RecordItem key={e.id} icon={ArrowRight} label={e.especialidade_destino} badge={e.status} badgeClass={sc(e.status)} />
        ))}
      </div>
    </div>
  );
}

// ─── Anexos Wrapper ────────────────────────────────────────
function AnexosWrapper({ pacienteId, prontuarioId, readOnly }: { pacienteId: string; prontuarioId: string; readOnly: boolean }) {
  const [anexos, setAnexos] = useState<any[]>([]);
  const [erro, setErro] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const loadAnexos = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('anexos_prontuario').select('id,nome_arquivo,url_arquivo,categoria,descricao,created_at').eq('prontuario_id', prontuarioId).order('created_at', { ascending: false });
      if (error) throw error;
      setErro(null);
      setAnexos(data || []);
    } catch (error) {
      setErro(error);
      setAnexos([]);
    } finally {
      setLoading(false);
    }
  }, [prontuarioId]);
  useEffect(() => { loadAnexos(); }, [loadAnexos]);
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (erro) return <ErrorState compact error={erro} title="Não foi possível carregar os anexos" onRetry={() => { void loadAnexos(); }} />;
  return <AnexosProntuario pacienteId={pacienteId} prontuarioId={prontuarioId} anexos={anexos} readOnly={readOnly} onAnexoAdicionado={loadAnexos} onAnexoRemovido={loadAnexos} />;
}

// ═══════════════════════════════════════════════════════════
// ─── MAIN COMPONENT ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════
export default function Prontuarios() {
  const [dispensando, setDispensando] = useState(false);
  const [exportacaoPendente, setExportacaoPendente] = useState<{ conteudo: string; nomeArquivo: string; tipo: 'application/json' | 'application/xml'; formato: 'FHIR R4 JSON' | 'XML clínico simplificado'; ids: string[] } | null>(null);

  /**
   * Dá baixa no estoque dos medicamentos que a clínica entregou em mãos.
   *
   * Só o que tem quantidade preenchida entra: sem quantidade não há o que
   * descontar, e chutar "1" faria o estoque divergir do armário — que é pior
   * que não controlar.
   */
  const dispensarNaClinica = async () => {
    const itens = prescricoes
      .filter(p => p.medicamento?.trim() && p.quantidade?.trim())
      .map(p => ({ nome: p.medicamento.trim(), quantidade: p.quantidade.trim() }));

    if (itens.length === 0) {
      toast.error('Preencha a quantidade dos medicamentos entregues');
      return;
    }

    setDispensando(true);
    try {
      const prontuarioId = await performSave(true);
      if (!prontuarioId) {
        throw new Error('Não foi possível salvar as prescrições. Revise o atendimento e tente novamente.');
      }

      const { autoDispensarMedicamentos } = await import('@/lib/workflowAutomation');
      const r = await autoDispensarMedicamentos({
        medicamentos: itens,
        pacienteId: selectedPaciente?.id ?? '',
        pacienteNome: selectedPaciente?.nome ?? 'Paciente',
        prontuarioId,
        userId: user?.id,
      });

      if (!r.success) throw new Error(r.message);
      // Baixa parcial não é sucesso silencioso: o que não saiu precisa aparecer,
      // senão a clínica acha que descontou tudo.
      const houveAlerta = r.actions.some(a => a.includes('não encontrado') || a.includes('insuficiente'));
      if (houveAlerta) {
        toast.warning(r.message, { description: r.actions.join(' • '), duration: 9000 });
      } else {
        toast.success(r.message, { description: r.actions.join(' • ') });
      }
    } catch (e: any) {
      toast.error('Não foi possível dar baixa', { description: e?.message });
    } finally {
      setDispensando(false);
    }
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const routePacienteId = searchParams.get('paciente');
  const routeAgendamentoId = searchParams.get('agendamento');
  const routeOpenedRef = useRef(false);
  const routeKeyRef = useRef<string | null>(null);
  const [selectedPacienteId, setSelectedPacienteId] = useState<string | null>(null);
  const [showPatientPicker, setShowPatientPicker] = useState(true);
  const [rascunhoParaAbrir, setRascunhoParaAbrir] = useState<Record<string, any> | null>(null);
  const [rascunhoParaEditarId, setRascunhoParaEditarId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProntuarioOpen, setIsProntuarioOpen] = useState(false);
  const [currentProntuario, setCurrentProntuario] = useState<Record<string, any>>({});
  const prontuarioAposDescartarRef = useRef<Record<string, any> | null>(null);
  const [prescricoes, setPrescricoes] = useState<PrescricaoForm[]>([]);
  const [showProtocols, setShowProtocols] = useState(false);
  const [showDischargeReport, setShowDischargeReport] = useState(false);
  const [sinaisVitais, setSinaisVitais] = useState<SinaisVitais>(emptySinaisVitais);
  const [isEditing, setIsEditing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [erroPrescricoes, setErroPrescricoes] = useState<unknown>(null);
  const [autoSaveTime, setAutoSaveTime] = useState<string | null>(null);
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [showExamSolicitation, setShowExamSolicitation] = useState(false);
  const [examForm, setExamForm] = useState({ tipo_exame: '', descricao: '', observacoes: '' });
  const [isRequestingExam, setIsRequestingExam] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveInProgressRef = useRef(false);
  const changeVersionRef = useRef(0);
  const prescricoesRequestRef = useRef(0);
  const { profile: user } = useSupabaseAuth();

  const pacientesBuscaQuery = useBuscaPacientes(searchTerm, { limite: 50 });
  const pacientesBusca = pacientesBuscaQuery.data?.pacientes ?? [];
  const buscandoPacientes = pacientesBuscaQuery.isFetching || pacientesBuscaQuery.isDebouncing || pacientesBuscaQuery.isPlaceholderData;
  const { data: medicos = [], isLoading: loadingMedicos, error: erroMedicos, refetch: refetchMedicos } = useMedicos();
  const medicoDoProntuario = medicos.find((medico: any) => medico.id === currentProntuario.medico_id);
  const identificacaoAssinante = obterIdentificacaoAssinante({
    assinado: Boolean(currentProntuario.assinado),
    assinado_por: currentProntuario.assinado_por,
    crm_assinante: currentProntuario.crm_assinante,
    medicoVinculado: medicoDoProntuario,
  });
  const { data: convenios = [], error: erroConvenios, refetch: refetchConvenios } = useSupabaseQuery<any>('convenios', { orderBy: { column: 'nome', ascending: true } });
  const { medicoId, isMedicoOnly } = useCurrentMedico();
  // Pacientes agendados hoje para o médico logado: aparecem no topo da lista
  // para abrir o prontuário sem precisar buscar pelo nome.
  const hojeAgenda = todaySaoPauloDateOnly();
  const agendaHojeQuery = useAgendamentosPeriodo(hojeAgenda, hojeAgenda, { enabled: !!medicoId });
  const agendaHoje = useMemo(() => (agendaHojeQuery.data ?? [])
    .filter((ag: any) => ag.medico_id === medicoId && ag.paciente_id && !['cancelado', 'faltou'].includes(ag.status))
    .sort((a: any, b: any) => (a.hora_inicio || '').localeCompare(b.hora_inicio || '')), [agendaHojeQuery.data, medicoId]);
  const rascunhosQuery = useQuery<RascunhoNaFila[]>({
    queryKey: ['prontuarios-rascunhos-abertos', user?.id, user?.clinica_id, medicoId],
    enabled: !!user?.clinica_id && !!medicoId,
    queryFn: () => buscarEmBlocos<RascunhoNaFila>(() => (supabase as any)
      .from('prontuarios')
      .select('id, paciente_id, medico_id, data, queixa_principal, updated_at, assinado, pacientes(nome, nome_social)')
      .eq('clinica_id', user!.clinica_id)
      .eq('medico_id', medicoId!)
      .eq('assinado', false)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })),
    staleTime: 15_000,
  });
  const rascunhosAbertos = useMemo(
    () => filtrarRascunhosAbertos(rascunhosQuery.data || [], medicoId),
    [rascunhosQuery.data, medicoId],
  );
  const [historicoEvolucoes, setHistoricoEvolucoes] = useState<any[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [historicoAuditadoPacienteId, setHistoricoAuditadoPacienteId] = useState<string | null>(null);
  const [erroHistorico, setErroHistorico] = useState<unknown>(null);
  const [reloadHistorico, setReloadHistorico] = useState(0);

  useEffect(() => {
    if (!selectedPacienteId || (isMedicoOnly && !medicoId)) {
      setHistoricoAuditadoPacienteId(null);
      setHistoricoEvolucoes([]);
      setErroHistorico(null);
      setLoadingHistorico(false);
      return;
    }
    setLoadingHistorico(true);
    setHistoricoEvolucoes([]);
    setErroHistorico(null);
    setErroHistorico(null);
    let active = true;
    autorizarLeituraHistoricoPaciente(selectedPacienteId).then(() => {
      if (!active) return;
      setHistoricoAuditadoPacienteId(selectedPacienteId);
      return buscarTodasAsPaginas((inicio, fim) => {
      const query = supabase
        .from('prontuarios')
        .select('id, data, queixa_principal, historia_doenca_atual, historia_patologica_pregressa, historia_familiar, historia_social, revisao_sistemas, alergias_relatadas, medicamentos_em_uso, exames_fisicos, hipotese_diagnostica, conduta, sinais_vitais, diagnostico_principal, diagnosticos_secundarios, plano_terapeutico, assinado, assinado_em, assinado_por, crm_assinante, medicos(nome, crm, especialidade)')
        .eq('paciente_id', selectedPacienteId)
        .order('data', { ascending: false }).order('id', { ascending: false });
      return query.range(inicio, fim);
      });
    }).then(async (data) => {
      if (data === undefined) return;
      if (!active) return;
      setHistoricoEvolucoes(data ?? []);
      setLoadingHistorico(false);
    }).catch(error => {
      if (!active) return;
      setHistoricoEvolucoes([]);
      setErroHistorico(error);
      toast.error('Não foi possível carregar o histórico clínico.', { description: mensagemDeErro(error) });
      setLoadingHistorico(false);
    });
    return () => { active = false; };
  }, [selectedPacienteId, isMedicoOnly, medicoId, reloadHistorico]);

  // Filtra por paciente NO SERVIDOR. Antes esta query trazia a coleção inteira
  // de prontuários da clínica — o hook busca em blocos de 5.000 até o teto de
  // 20.000 — e a tela filtrava por `paciente_id` só depois, na memória. Abrir
  // um paciente baixava milhares de históricos clínicos de gente que não tinha
  // nada a ver com o atendimento em curso: lento, e dado sensível à toa no
  // navegador de uma máquina de recepção.
  const { data: prontuarios = [], isLoading: loadingProntuarios, error: erroProntuarios, refetch: refetchProntuarios } = useSupabaseQuery<Record<string, any>>('prontuarios', {
    orderBy: { column: 'data', ascending: false },
    enabled: !!selectedPacienteId && historicoAuditadoPacienteId === selectedPacienteId && (!isMedicoOnly || !!medicoId),
    filters: [
      ...(selectedPacienteId ? [{ column: 'paciente_id', operator: 'eq', value: selectedPacienteId }] : []),
    ],
  });

  const pacienteSelecionadoQuery = useSupabaseQuery<any>('pacientes', {
    enabled: !!selectedPacienteId && !!user?.clinica_id,
    limit: 1,
    filters: [
      { column: 'id', operator: 'eq', value: selectedPacienteId || '' },
      { column: 'clinica_id', operator: 'eq', value: user?.clinica_id || '' },
    ],
  });
  const selectedPaciente = pacienteSelecionadoQuery.data?.[0] ?? null;
  const routePacienteNaoEncontrado = Boolean(
    routePacienteId && routePacienteId === selectedPacienteId && !pacienteSelecionadoQuery.isLoading
    && !pacienteSelecionadoQuery.isError && !selectedPaciente,
  );

  const getConvenioNome = useCallback((convenioId: string | null) => {
    if (!convenioId) return 'Particular';
    if (erroConvenios) return 'Convênio não carregado';
    const c = convenios.find((cv: any) => cv.id === convenioId);
    return c?.nome || 'Particular';
  }, [convenios, erroConvenios]);

  const filteredPacientes = buscandoPacientes || pacientesBuscaQuery.isError ? [] : pacientesBusca;

  const pacienteProntuarios = useMemo(() => {
    if (!selectedPacienteId || (isMedicoOnly && !medicoId)) return [];
    // A query já vem filtrada por paciente; o filtro local fica como rede de
    // segurança para o intervalo em que `selectedPacienteId` muda antes de a
    // nova resposta chegar.
    return prontuarios
      .filter(p => p.paciente_id === selectedPacienteId)
      .sort((a, b) => (parseDateOnly(b.data)?.getTime() || 0) - (parseDateOnly(a.data)?.getTime() || 0));
  }, [prontuarios, selectedPacienteId, isMedicoOnly, medicoId]);

  // ─── Handlers ────────────────────────────────────────────
  const handleNovoProntuario = useCallback((agendamentoId?: string | null, medicoResponsavelId?: string | null) => {
    if (!selectedPacienteId) return false;
    if (isMedicoOnly && !medicoId) {
      toast.error('Usuário médico não vinculado', {
        description: 'Vincule esta conta ao cadastro do médico antes de abrir o prontuário.',
      });
      return false;
    }
    // A clinician with a linked profile is attributed automatically. Admins
    // without one must choose the responsible doctor in the draft; assigning
    // the first active doctor silently creates a false clinical authorship.
    const resolvedMedicoId = medicoId || medicoResponsavelId || '';
    if (!resolvedMedicoId && medicos.every(m => m.ativo === false)) {
      if (loadingMedicos) {
        toast.info('Carregando os profissionais disponíveis. Tente novamente em instantes.');
        return false;
      }
      toast.error('Erro', { description: 'Nenhum médico cadastrado no sistema.' });
      return false;
    }
    prescricoesRequestRef.current += 1;
    setCurrentProntuario({
      ...emptyProntuario,
      paciente_id: selectedPacienteId,
      medico_id: resolvedMedicoId,
      agendamento_id: agendamentoId || null,
      data: todaySaoPauloDateOnly(),
      alergias_relatadas: selectedPaciente?.alergias?.join(', ') || '',
    });
    setSinaisVitais(emptySinaisVitais);
    setPrescricoes([]);
    setHasUnsavedChanges(false);
    setErroPrescricoes(null);
    setAutoSaveError(null);
    setAutoSaveTime(null);
    setIsEditing(true);
    setIsProntuarioOpen(true);
    return true;
  }, [selectedPacienteId, isMedicoOnly, medicoId, medicos, loadingMedicos, selectedPaciente]);

  // A Fila envia paciente e agendamento. Abrimos a evolução existente ou
  // preparamos uma nova para o médico responsável.
  useEffect(() => {
    if (routePacienteId && selectedPacienteId !== routePacienteId) {
      prescricoesRequestRef.current += 1;
      setSelectedPacienteId(routePacienteId);
      setShowPatientPicker(false);
    }
  }, [routePacienteId, selectedPacienteId]);

  const carregarPrescricoes = async (prontuarioId: string, requestId = ++prescricoesRequestRef.current) => {
    try {
      const { data, error } = await supabase
        .from('prescricoes')
        .select('*')
        .eq('prontuario_id', prontuarioId);
      if (error) throw error;
      if (requestId !== prescricoesRequestRef.current) return false;
      setErroPrescricoes(null);
      setPrescricoes((data || []).map((p: any) => ({
        medicamento: p.medicamento, dosagem: p.dosagem || '', posologia: p.posologia || '',
        duracao: p.duracao || '', quantidade: p.quantidade || '', observacoes: p.observacoes || '',
      })));
      return true;
    } catch (error) {
      if (requestId !== prescricoesRequestRef.current) return false;
      setErroPrescricoes(error);
      return false;
    }
  };

  const handleViewProntuario = async (prontuario: Record<string, any>) => {
    const requestId = ++prescricoesRequestRef.current;
    try {
      await registrarAcessoProntuario(prontuario.id, 'visualizacao');
    } catch (error) {
      console.error('[prontuario] registro de acesso falhou:', error);
      toast.error('Nao foi possivel registrar o acesso ao prontuario.', {
        description: 'O prontuario permaneceu fechado. Tente novamente em instantes.',
      });
      return false;
    }
    if (requestId !== prescricoesRequestRef.current) return false;
    setCurrentProntuario(prontuario);
    setSinaisVitais({ ...emptySinaisVitais, ...(prontuario.sinais_vitais || {}) });
    setErroPrescricoes(null);
    const prescriptionsLoaded = await carregarPrescricoes(prontuario.id, requestId);
    if (requestId !== prescricoesRequestRef.current) return false;
    if (!prescriptionsLoaded) {
      setPrescricoes([]);
      setHasUnsavedChanges(false);
      setAutoSaveError(null);
      setAutoSaveTime(null);
      setIsEditing(false);
      setIsProntuarioOpen(true);
      toast.warning('Prontuário aberto em modo de leitura.', {
        description: 'As prescrições não carregaram. Recarregue essa seção antes de editar para evitar substituir dados que não foram exibidos.',
        duration: 9000,
      });
      return false;
    }
    setHasUnsavedChanges(false);
    setAutoSaveError(null);
    setAutoSaveTime(null);
    setIsEditing(false);
    setIsProntuarioOpen(true);
    // Registro de acesso ao prontuário — CFM Res. 1.821/2007.
    //
    // Isto vivia num `try { ... } catch { /* silent */ }`, e o supabase-js não
    // lança em erro de API: devolve `{ error }`. O catch nunca disparava e um
    // prontuário podia ser aberto sem qualquer registro de quem o abriu.
    //
    // Não bloqueamos a leitura: negar o prontuário ao médico porque o log
    // falhou é pior para o paciente. Mas a falha precisa ser visível e o
    // registro precisa sobreviver — daí a fila de reenvio em auditTrail.

    return true;
  };

  useEffect(() => {
    const routeKey = `${routePacienteId || ''}:${routeAgendamentoId || ''}`;
    if (routeKeyRef.current !== routeKey) {
      routeKeyRef.current = routeKey;
      routeOpenedRef.current = false;
    }
  }, [routePacienteId, routeAgendamentoId]);

  useEffect(() => {
    if (routeOpenedRef.current || !routeAgendamentoId || selectedPacienteId !== routePacienteId
      || !selectedPaciente || pacienteSelecionadoQuery.isLoading || pacienteSelecionadoQuery.isError
      || loadingProntuarios || loadingMedicos || erroProntuarios || erroMedicos) return;
    if (!user?.clinica_id) return;

    // O atalho vem da URL e pode estar desatualizado ou alterado. Confirme no
    // servidor que o agendamento pertence ao paciente e à clínica antes de
    // abrir ou criar uma evolução vinculada a ele.
    routeOpenedRef.current = true;
    let active = true;
    const abrirAtendimentoDoAtalho = async () => {
      const { data: agendamento, error } = await supabase
        .from('agendamentos')
        .select('id, paciente_id, medico_id')
        .eq('id', routeAgendamentoId)
        .eq('clinica_id', user.clinica_id)
        .maybeSingle();

      if (!active) return;
      const limparAtalho = () => {
        const params = new URLSearchParams(searchParams);
        params.delete('paciente');
        params.delete('agendamento');
        setSearchParams(params, { replace: true });
      };

      if (error || !agendamento || agendamento.paciente_id !== routePacienteId) {
        toast.error('Não foi possível abrir este atendimento', {
          description: error?.message || 'O agendamento não pertence a este paciente ou não está disponível nesta clínica.',
        });
        limparAtalho();
        return;
      }

      const existing = pacienteProntuarios.find((p: any) => p.agendamento_id === routeAgendamentoId);
      if (existing) {
        void handleViewProntuarioRef.current(existing);
      } else {
        handleNovoProntuario(routeAgendamentoId, agendamento.medico_id);
      }
      limparAtalho();
    };

    void abrirAtendimentoDoAtalho();
    return () => { active = false; };
  }, [
    routeAgendamentoId,
    routePacienteId,
    selectedPacienteId,
    selectedPaciente,
    pacienteSelecionadoQuery.isLoading,
    pacienteSelecionadoQuery.isError,
    loadingProntuarios,
    loadingMedicos,
    erroProntuarios,
    erroMedicos,
    pacienteProntuarios,
    handleNovoProntuario,
    user?.clinica_id,
    searchParams,
    setSearchParams,
  ]);

  const handleAddPrescricao = () => {
    setPrescricoes([...prescricoes, { medicamento: '', dosagem: '', posologia: '', duracao: '', quantidade: '', observacoes: '' }]);
    setHasUnsavedChanges(true);
    changeVersionRef.current += 1;
  };
  const handleUpdatePrescricao = (i: number, field: keyof PrescricaoForm, value: string) => {
    const u = [...prescricoes]; u[i] = { ...u[i], [field]: value }; setPrescricoes(u); setHasUnsavedChanges(true); changeVersionRef.current += 1;
  };
  const handleRemovePrescricao = (i: number) => {
    setPrescricoes(prescricoes.filter((_, idx) => idx !== i));
    setHasUnsavedChanges(true);
    changeVersionRef.current += 1;
  };

  const isSigned = !!currentProntuario.assinado;
  const isReadOnly = (!!currentProntuario.id && !isEditing) || isSigned;
  const podeAdendar = isSigned && !!user?.roles?.includes('medico') && medicoId === currentProntuario.medico_id && !!medicoDoProntuario?.crm;

  const handleRequestEdit = async () => {
    if (erroPrescricoes) {
      toast.error('Edição temporariamente bloqueada', {
        description: 'Carregue as prescrições do prontuário antes de editar.',
      });
      return;
    }
    if (isSigned) {
      toast.error('Prontuário assinado', {
        description: 'Registros assinados são bloqueados para edição. Use "Adendos" para retificar ou complementar.',
      });
      return;
    }

    let auditado = false;
    try {
      await registrarAcessoProntuario(currentProntuario.id, 'edicao', 'Modo de edição ativado');
      auditado = true;
    } catch (e) {
      // Engolir a falha em silêncio era pior que não auditar: a tela afirmava
      // "Alterações serão auditadas" mesmo quando o registro não fora gravado.
      // Auditoria que falha calada cria garantia falsa — justamente o que a
      // rastreabilidade exigida pela LGPD deveria impedir.
      console.error('Falha ao registrar acesso ao prontuário:', e);
    }

    setIsEditing(true);
    if (auditado) {
      toast.success('Modo de edição ativado', { description: 'Alterações serão auditadas.' });
    } else {
      toast.warning('Modo de edição ativado', {
        description: 'Não foi possível registrar o acesso na auditoria.',
      });
    }
  };

  const handleViewProntuarioRef = useRef(handleViewProntuario);
  handleViewProntuarioRef.current = handleViewProntuario;
  const handleRequestEditRef = useRef(handleRequestEdit);
  handleRequestEditRef.current = handleRequestEdit;

  useEffect(() => {
    if (!rascunhoParaAbrir || selectedPacienteId !== rascunhoParaAbrir.paciente_id) return;
    if (pacienteSelecionadoQuery.isLoading || loadingProntuarios) return;
    if (historicoAuditadoPacienteId !== selectedPacienteId) return;
    if (pacienteSelecionadoQuery.isError || !selectedPaciente) {
      toast.error('NÃ£o foi possÃ­vel retomar este rascunho.', {
        description: 'O paciente nÃ£o estÃ¡ acessÃ­vel nesta clÃ­nica.',
      });
      setRascunhoParaAbrir(null);
      return;
    }
    if (erroProntuarios) {
      setRascunhoParaAbrir(null);
      return;
    }
    const draft = pacienteProntuarios.find((item) => item.id === rascunhoParaAbrir.id);
    if (!draft) {
      toast.error('Este rascunho nÃ£o estÃ¡ mais disponÃ­vel para sua conta. Atualize a lista.');
      setRascunhoParaAbrir(null);
      return;
    }

    setRascunhoParaAbrir(null);
    void handleViewProntuarioRef.current(draft).then((opened) => {
      if (opened) setRascunhoParaEditarId(draft.id);
    });
  }, [rascunhoParaAbrir, selectedPacienteId, pacienteSelecionadoQuery.isLoading, pacienteSelecionadoQuery.isError, selectedPaciente, loadingProntuarios, erroProntuarios, pacienteProntuarios, historicoAuditadoPacienteId]);

  useEffect(() => {
    if (!rascunhoParaEditarId || !isProntuarioOpen || currentProntuario.id !== rascunhoParaEditarId) return;
    setRascunhoParaEditarId(null);
    void handleRequestEditRef.current();
  }, [rascunhoParaEditarId, isProntuarioOpen, currentProntuario.id]);

  const updateField = (field: string, value: any) => {
    setCurrentProntuario(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
    changeVersionRef.current += 1;
  };

  // ─── Core save logic (used by manual save and auto-save) ───
  const performSave = async (silent = false): Promise<string | null> => {
    if (silent && !hasUnsavedChanges) return currentProntuario.id || null;
    if (saveInProgressRef.current) {
      if (!silent) toast.info('Salvamento em andamento. Aguarde a conclusão.');
      return null;
    }
    saveInProgressRef.current = true;
    if (!user?.clinica_id) {
      if (silent) setAutoSaveError('Clínica não identificada. Atualize a sessão antes de salvar.');
      else toast.error('Não foi possível salvar o prontuário.', { description: 'Clínica não identificada. Atualize a sessão e tente novamente.' });
      saveInProgressRef.current = false;
      return null;
    }
    const queixaPrincipal = currentProntuario.queixa_principal?.trim() || '';
    if (!queixaPrincipal) {
      if (silent) setAutoSaveError('Preencha a queixa principal antes de salvar.');
      else toast.error('Erro', { description: 'Preencha a queixa principal.' });
      saveInProgressRef.current = false;
      return null;
    }
    if (!currentProntuario.id && !currentProntuario.medico_id) {
      const message = 'Selecione o médico responsável antes de salvar esta evolução.';
      if (silent) setAutoSaveError(message);
      else toast.error('Médico responsável obrigatório', { description: message });
      saveInProgressRef.current = false;
      return null;
    }
    if (isSigned) {
      if (silent) setAutoSaveError('O prontuário está assinado e não pode mais ser alterado.');
      else toast.error('Prontuário assinado', {
        description: 'Registro imutável. Use "Adendos" para complementar ou retificar.',
      });
      saveInProgressRef.current = false;
      return null;
    }
    let prontuarioPersistido = false;
    try {
      const savingVersion = changeVersionRef.current;
      const payload = {
        queixa_principal: queixaPrincipal,
        historia_doenca_atual: currentProntuario.historia_doenca_atual,
        historia_patologica_pregressa: currentProntuario.historia_patologica_pregressa,
        historia_familiar: currentProntuario.historia_familiar,
        historia_social: currentProntuario.historia_social,
        revisao_sistemas: currentProntuario.revisao_sistemas,
        alergias_relatadas: currentProntuario.alergias_relatadas,
        medicamentos_em_uso: currentProntuario.medicamentos_em_uso,
        sinais_vitais: JSON.parse(JSON.stringify(sinaisVitais)),
        exames_fisicos: currentProntuario.exames_fisicos,
        exame_cabeca_pescoco: currentProntuario.exame_cabeca_pescoco,
        exame_torax: currentProntuario.exame_torax,
        exame_abdomen: currentProntuario.exame_abdomen,
        exame_membros: currentProntuario.exame_membros,
        exame_neurologico: currentProntuario.exame_neurologico,
        exame_pele: currentProntuario.exame_pele,
        hipotese_diagnostica: currentProntuario.hipotese_diagnostica,
        diagnostico_principal: currentProntuario.diagnostico_principal,
        diagnosticos_secundarios: currentProntuario.diagnosticos_secundarios || [],
        conduta: currentProntuario.conduta,
        plano_terapeutico: currentProntuario.plano_terapeutico,
        orientacoes_paciente: currentProntuario.orientacoes_paciente,
        observacoes_internas: currentProntuario.observacoes_internas,
      };

      let prontuarioId = currentProntuario.id;
      if (currentProntuario.id) {
        if (!currentProntuario.updated_at) {
          throw new Error('Não foi possível confirmar a versão deste prontuário. Feche e abra o registro novamente antes de editar.');
        }
        const { data, error } = await supabase.from('prontuarios')
          .update(payload)
          .eq('id', currentProntuario.id)
          .eq('clinica_id', user.clinica_id)
          .eq('updated_at', currentProntuario.updated_at)
          .select('id, updated_at')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Este prontuário foi alterado ou removido em outra sessão. Suas alterações continuam nesta tela; recarregue o registro e confira o histórico antes de salvar novamente.');
        setCurrentProntuario(prev => ({ ...prev, updated_at: data.updated_at }));
      } else {
        const { data, error } = await supabase.from('prontuarios').insert({
          ...payload, paciente_id: currentProntuario.paciente_id,
          medico_id: currentProntuario.medico_id,
          agendamento_id: currentProntuario.agendamento_id || null,
          data: currentProntuario.data,
          clinica_id: user.clinica_id,
        }).select().single();
        if (error) throw error;
        prontuarioId = data.id;
        setCurrentProntuario(prev => ({ ...prev, id: prontuarioId, updated_at: data.updated_at }));
      }
      prontuarioPersistido = true;

      // ─── Save prescriptions (create + update) ───
      if (prontuarioId) {
        const validas = prescricoes.filter(p => p.medicamento.trim());

        // Troca tudo numa transação só (migration 20260812120000). Antes eram
        // um delete e N inserts independentes: uma falha no meio deixava o
        // prontuário sem as prescrições antigas e sem as novas, em definitivo.
        const { error: prescErr } = await (supabase as any).rpc(
          'substituir_prescricoes_do_prontuario',
          {
            p_prontuario_id: prontuarioId,
            p_prescricoes: validas.map(presc => ({
              medicamento: presc.medicamento,
              dosagem: presc.dosagem || null,
              posologia: presc.posologia || null,
              duracao: presc.duracao || null,
              quantidade: presc.quantidade || null,
              observacoes: presc.observacoes || null,
              data_emissao: todaySaoPauloDateOnly(),
              tipo: 'simples',
            })),
          }
        );
        if (prescErr) throw prescErr;

        // ─── Baixa de estoque ───
        // NÃO roda no autosave. O autosave dispara a cada 60s e usava este
        // mesmo caminho, debitando o estoque de novo a cada minuto enquanto o
        // prontuário ficasse aberto. A idempotência real vem do índice único
        // (prontuario_id, item_id) criado na migration 20260728020000. A baixa
        // agora passa pelo RPC transacional, que serializa o item e grava o
        // movimento junto com o novo saldo.
        if (!silent) {
          const baixasSolicitadas: Array<{ itemId: string; itemName: string; quantity: number }> = [];
          for (const presc of validas) {
            // Casamento por nome aproximado pode acertar o medicamento errado.
            // Se houver mais de um candidato, não adivinhamos: registramos e
            // deixamos a baixa para o operador fazer manualmente.
            const { data: candidatos } = await supabase.from('estoque')
              .select('id, quantidade, nome')
              .eq('clinica_id', user.clinica_id)
              .ilike('nome', `%${presc.medicamento}%`)
              .gt('quantidade', 0)
              .limit(2);

            if (!candidatos || candidatos.length === 0) continue;
            if (candidatos.length > 1) {
              console.warn(
                `Baixa de estoque ignorada: "${presc.medicamento}" casa com mais de um item.`
              );
              continue;
            }

            const estoqueItem = candidatos[0];
            const qtdTexto = presc.quantidade.trim();
            if (!qtdTexto || !/^\d+$/.test(qtdTexto) || Number(qtdTexto) <= 0) {
              toast.warning(`Estoque não foi baixado: ${estoqueItem.nome}`, {
                description: 'Informe uma quantidade inteira maior que zero na prescrição para registrar a baixa.',
              });
              continue;
            }
            const qtd = Number(qtdTexto);
            baixasSolicitadas.push({
              itemId: estoqueItem.id,
              itemName: estoqueItem.nome,
              quantity: qtd,
            });
          }

          for (const baixaSolicitada of agruparBaixasEstoque(baixasSolicitadas)) {
            const { data: baixa, error: movErr } = await (supabase as any).rpc(
              'registrar_baixa_estoque',
              {
                p_item_id: baixaSolicitada.itemId,
                p_quantidade: baixaSolicitada.quantity,
                p_prontuario_id: prontuarioId,
                p_usuario_id: user?.id || null,
                p_motivo: `Prescrição — ${selectedPaciente?.nome || 'paciente'}`,
              },
            );

            if (movErr) {
              // Baixa duplicada é tratada dentro do RPC como no-op. Qualquer
              // outro erro precisa aparecer, porque a transação inteira foi
              // desfeita e o saldo continua inalterado.
              toast.warning(`Estoque não foi baixado: ${baixaSolicitada.itemName}`, {
                description: movErr.message,
              });
              continue;
            }

            // A função SQL já grava a movimentação e o saldo na mesma
            // transação. O retorno é usado apenas para manter o fluxo
            // explícito quando a chamada foi idempotente.
            if (baixa?.[0]?.ja_baixado) continue;
          }
        }
      }

      // Leituras e edições são registradas pela RPC de acesso; criação e
      // atualização são registradas pelo trigger do banco.
      if (silent) {
        setAutoSaveTime(format(new Date(), 'HH:mm'));
        setAutoSaveError(null);
      } else {
        refetchProntuarios();
        // Reload history
        try {
          const hist = await buscarTodasAsPaginas((inicio, fim) => {
            const historicoQuery = supabase.from('prontuarios')
              .select('id, data, queixa_principal, historia_doenca_atual, historia_patologica_pregressa, historia_familiar, historia_social, revisao_sistemas, alergias_relatadas, medicamentos_em_uso, exames_fisicos, hipotese_diagnostica, conduta, sinais_vitais, diagnostico_principal, diagnosticos_secundarios, plano_terapeutico, assinado, assinado_em, assinado_por, crm_assinante, medicos(nome, crm, especialidade)')
              .eq('paciente_id', currentProntuario.paciente_id)
              .order('data', { ascending: false }).order('id', { ascending: false });
            return historicoQuery.range(inicio, fim);
          });
          setHistoricoEvolucoes(hist);
          setErroHistorico(null);
        } catch (historicoErr) {
          setHistoricoEvolucoes([]);
          setErroHistorico(historicoErr);
        }
      }

      // Se o profissional digitou enquanto a requisição estava em trânsito,
      // a nova versão continua pendente e será salva no próximo ciclo.
      if (changeVersionRef.current === savingVersion) setHasUnsavedChanges(false);

      return prontuarioId;
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving prontuario:', error);
      if (silent) {
        setAutoSaveError(mensagemDeErro(error));
      } else if (prontuarioPersistido) {
        toast.error('A evolução foi salva, mas as prescrições não foram atualizadas.', {
          description: 'O registro clínico continua aberto. Tente salvar novamente para concluir as prescrições.',
        });
      } else {
        toast.error('Erro ao salvar prontuário.', { description: mensagemDeErro(error) });
      }
      return null;
    } finally {
      saveInProgressRef.current = false;
    }
  };

  // Trava de duplo clique no salvar: sem ela, dois cliques rápidos inseriam a
  // evolução duas vezes (o id só é conhecido depois do primeiro insert).
  const [salvandoProntuario, setSalvandoProntuario] = useState(false);
  /** Confirmação antes de descartar a evolução não salva. */
  const [perguntandoDescartar, setPerguntandoDescartar] = useState(false);
  const handleSave = async () => {
    if (salvandoProntuario) return;
    const versaoAntesDeSalvar = changeVersionRef.current;
    setSalvandoProntuario(true);
    try {
      const id = await performSave(false);
      if (id) {
        if (changeVersionRef.current === versaoAntesDeSalvar) {
          setIsProntuarioOpen(false);
          toast.success('Prontuário salvo', { description: 'Registro salvo com sucesso.' });
        } else {
          toast.warning('O prontuário foi salvo, mas houve novas alterações.', {
            description: 'Revise e salve novamente antes de fechar.',
          });
        }
      }
    } finally {
      setSalvandoProntuario(false);
    }
  };

  // ─── Auto-save every 30s ───
  // IMPORTANTE: dependências limitadas a flags estáveis (open/editing) para
  // não recriar o setInterval a cada tecla — bug anterior fazia o auto-save
  // nunca disparar em digitação contínua. Usamos ref para acessar o valor
  // mais recente dentro do interval sem depender dele.
  const performSaveRef = useRef(performSave);
  useEffect(() => { performSaveRef.current = performSave; });
  useEffect(() => {
    if (!(isProntuarioOpen && isEditing)) return;
    autoSaveRef.current = setInterval(() => {
      performSaveRef.current(true);
    }, 30000);
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
  }, [isProntuarioOpen, isEditing]);

  // Evita perder uma evolução digitada caso a aba seja fechada antes do
  // próximo autosave. Não persistimos texto clínico em localStorage: em
  // computadores compartilhados isso deixaria dados sensíveis no disco.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleProntuarioOpenChange = (open: boolean) => {
    if (!open && salvandoProntuario) {
      toast.info('Aguarde o salvamento terminar antes de fechar o prontuário.');
      return;
    }
    // Confirmação visual no lugar do window.confirm nativo — o mesmo padrão do
    // resto do app, acessível com teclado e leitor de tela.
    if (!open && hasUnsavedChanges) {
      setPerguntandoDescartar(true);
      return;
    }
    setIsProntuarioOpen(open);
  };

  // Reset auto-save time when dialog closes
  useEffect(() => {
    if (!isProntuarioOpen) setAutoSaveTime(null);
  }, [isProntuarioOpen]);

  const auditarExportacaoPdf = async (formato: 'PDF' | 'WhatsApp') => {
    if (!currentProntuario.id) {
      toast.info('Salve o prontuÃ¡rio antes de exportar para registrar a auditoria.');
      return false;
    }
    try {
      await registrarExportacaoProntuarios([currentProntuario.id], formato);
      return true;
    } catch (error) {
      toast.error('ExportaÃ§Ã£o cancelada: nÃ£o foi possÃ­vel registrar a auditoria.', { description: mensagemDeErro(error) });
      return false;
    }
  };

  // ─── Exam solicitation ───
  const handleSolicitarExame = async () => {
    if (isRequestingExam) return;
    if (!examForm.tipo_exame) {
      toast.error('Erro', { description: 'Informe o tipo do exame.' });
      return;
    }
    if (!currentProntuario.id || !medicoId || !selectedPacienteId) {
      toast.error('Não foi possível identificar o paciente ou médico solicitante.');
      return;
    }
    if (!user?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a sessão antes de solicitar o exame.');
      return;
    }
    setIsRequestingExam(true);
    try {
      const { error } = await supabase.from('exames').insert({
        paciente_id: selectedPacienteId,
        medico_solicitante_id: medicoId,
        prontuario_id: currentProntuario.id,
        tipo_exame: examForm.tipo_exame,
        descricao: examForm.descricao || null,
        observacoes: examForm.observacoes || null,
        status: 'solicitado',
        data_solicitacao: todaySaoPauloDateOnly(),
        clinica_id: user.clinica_id,
      });
      if (error) throw error;
      toast.success('Exame solicitado', { description: `${examForm.tipo_exame} registrado.` });
      setExamForm({ tipo_exame: '', descricao: '', observacoes: '' });
      setShowExamSolicitation(false);
    } catch (error) {
      toast.error('Erro ao solicitar exame.', { description: mensagemDeErro(error) });
    } finally {
      setIsRequestingExam(false);
    }
  };

  const handleApplyProtocol = (protocol: any) => {
    if (protocol.medicamentos_sugeridos?.length > 0) {
      const novas = protocol.medicamentos_sugeridos.map((med: any) => ({
        medicamento: med.nome, dosagem: '', posologia: med.posologia, duracao: '', quantidade: '', observacoes: '',
      }));
      setPrescricoes([...prescricoes, ...novas]);
    }
    let conduta = currentProntuario.conduta || '';
    if (protocol.orientacoes) conduta += `\n\n[Protocolo: ${protocol.nome}]\n${protocol.orientacoes}`;
    updateField('conduta', conduta.trim());
    setShowProtocols(false);
    toast.success('Protocolo aplicado', { description: `"${protocol.nome}" aplicado.` });
  };

  const getDischargeReportData = () => ({
    paciente: { nome: selectedPaciente?.nome || '', dataNascimento: selectedPaciente?.data_nascimento, cpf: selectedPaciente?.cpf },
    medico: { nome: user?.nome || 'Médico' },
    consulta: {
      data: currentProntuario.data || todaySaoPauloDateOnly(),
      queixaPrincipal: currentProntuario.queixa_principal,
      hipoteseDiagnostica: currentProntuario.hipotese_diagnostica,
      conduta: currentProntuario.conduta,
    },
    prescricoes: prescricoes.filter(p => p.medicamento.trim()),
  });

  // ─── Loading state ───────────────────────────────────────
  if (loadingMedicos || loadingProntuarios) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-12">
          <Skeleton className="h-[600px] lg:col-span-3" />
          <Skeleton className="h-[600px] lg:col-span-9" />
        </div>
      </div>
    );
  }

  if (selectedPacienteId && erroProntuarios) return <ErrorState error={erroProntuarios} title="Não foi possível carregar o histórico clínico" description="Não é seguro abrir uma evolução nova enquanto não confirmarmos se já existe atendimento para este paciente." onRetry={() => { void refetchProntuarios(); }} />;

  // ═══════════════════════════════════════════════════════════
  // ─── RENDER ─────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">
      {erroMedicos && <ErrorState compact error={erroMedicos} title="Lista de médicos indisponível" description="Não é possível iniciar um atendimento ou assinar um prontuário sem carregar os dados do médico." onRetry={() => { void refetchMedicos(); }} />}
      {erroConvenios && <ErrorState compact error={erroConvenios} title="Convênios indisponíveis" description="A ficha pode ser consultada, mas o convênio do paciente não será identificado até atualizar os dados." onRetry={() => { void refetchConvenios(); }} />}
      <PageHeader
        title="Prontuário Eletrônico"
        description="Registro médico, evolução e prescrições do paciente"
        icon={<ClipboardList />}
        actions={(
          <Badge className="shrink-0 gap-1 rounded-full border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-primary">
            <ShieldCheck className="h-3 w-3" />Acesso clínico
          </Badge>
        )}
      />

      {routePacienteNaoEncontrado && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p>O paciente do atalho não foi encontrado ou não está acessível nesta clínica. Selecione outro paciente na lista ou limpe o atalho.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              const params = new URLSearchParams(searchParams);
              params.delete('paciente');
              params.delete('agendamento');
              setSearchParams(params, { replace: true });
            }}
          >
            Limpar atalho
          </Button>
        </div>
      )}

      {/* Main layout: patient list + content */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* ─── Patient List (Left column) ─── */}
        <div className="lg:col-span-3">
          {selectedPacienteId && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card px-3 py-2 lg:hidden">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Paciente selecionado</p>
                <p className="truncate text-sm font-semibold text-foreground" aria-live="polite">
                  {selectedPaciente?.nome || (pacienteSelecionadoQuery.isLoading ? 'Carregando paciente…' : 'Paciente')}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-expanded={showPatientPicker}
                aria-controls="prontuario-patient-picker"
                onClick={() => setShowPatientPicker(value => !value)}
                className="min-h-10 shrink-0"
              >
                {showPatientPicker ? 'Fechar lista' : 'Trocar paciente'}
              </Button>
            </div>
          )}
          <Card
            id="prontuario-patient-picker"
            className={`overflow-hidden rounded-[24px] border-border/60 ${selectedPacienteId && !showPatientPicker ? 'hidden lg:block' : ''}`}
          >
            <CardHeader className="space-y-2 pb-2 px-3 pt-3">
              <Label htmlFor="prontuario-busca-paciente" className="text-xs font-semibold">Buscar paciente</Label>
              <div className="relative">
                <Search aria-hidden="true" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="prontuario-busca-paciente"
                  aria-label="Buscar paciente por nome, CPF, telefone ou e-mail"
                  placeholder="Nome, CPF ou telefone"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-8 h-10 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[38dvh] max-h-[420px] lg:h-[calc(100vh-240px)] lg:max-h-none">
                {medicoId && agendaHoje.length > 0 && (
                  <section aria-labelledby="pacientes-hoje-prontuario" className="border-b border-border/60 p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      <h2 id="pacientes-hoje-prontuario" className="text-xs font-extrabold uppercase tracking-[0.08em] text-foreground">Pacientes de hoje</h2>
                      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-extrabold text-primary">{agendaHoje.length}</span>
                    </div>
                    <ul className="space-y-1">
                      {agendaHoje.map((ag: any) => {
                        const nome = ag.pacientes?.nome_social || ag.pacientes?.nome || 'Paciente';
                        const ativo = ag.paciente_id === selectedPacienteId;
                        const encerrado = ['finalizado', 'atendimento_finalizado', 'pago'].includes(ag.status);
                        return (
                          <li key={ag.id}>
                            <button
                              type="button"
                              onClick={() => {
                                prescricoesRequestRef.current += 1;
                                setRascunhoParaAbrir(null);
                                setErroPrescricoes(null);
                                setSelectedPacienteId(ag.paciente_id);
                                setShowPatientPicker(false);
                              }}
                              className={`flex min-h-11 w-full items-center gap-2.5 rounded-2xl p-2 text-left transition ${ativo ? 'bg-accent' : 'hover:bg-muted/60'}`}
                            >
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-extrabold ${ativo ? 'bg-[image:var(--gradient-primary)] text-white shadow-glow' : 'bg-accent text-primary'}`}>
                                {nome.split(' ').filter(Boolean).map((p: string) => p[0]).slice(0, 2).join('').toUpperCase()}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className={`block truncate text-xs font-bold ${encerrado ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{nome}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">{ag.tipo || 'Consulta'}</span>
                              </span>
                              <span className="text-[11px] font-extrabold tabular-nums text-muted-foreground">{ag.hora_inicio?.slice(0, 5)}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
                {medicoId && (
                  <section aria-labelledby="open-medical-drafts" className="border-b border-[#E0DCF2] bg-[#F7F5FE] p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h2 id="open-medical-drafts" className="text-xs font-bold text-[#17122B]">Rascunhos em aberto</h2>
                      <Badge variant="outline" className="h-5 border-[#D5CFF1] bg-white text-xs text-[#5B47E0]">
                        {rascunhosAbertos.length}
                      </Badge>
                    </div>
                    {rascunhosQuery.isError ? (
                      <ErrorState compact title="Rascunhos indisponíveis" error={rascunhosQuery.error} onRetry={() => void rascunhosQuery.refetch()} />
                    ) : rascunhosQuery.isLoading ? (
                      <p role="status" className="py-3 text-center text-xs text-muted-foreground">Carregando rascunhos…</p>
                    ) : rascunhosAbertos.length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">Você não tem rascunhos para continuar.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {rascunhosAbertos.map((draft) => {
                          const paciente = Array.isArray(draft.pacientes) ? draft.pacientes[0] : draft.pacientes;
                          return (
                            <Button
                              key={draft.id}
                              type="button"
                              variant="ghost"
                              className="h-auto min-h-11 w-full justify-start whitespace-normal rounded-lg border border-[#E0DCF2] bg-white px-2.5 py-2 text-left hover:border-[#CFC6FF] hover:bg-[#F2F0FE]"
                              onClick={() => {
                                setRascunhoParaAbrir(draft);
                                setSelectedPacienteId(draft.paciente_id);
                                setShowPatientPicker(false);
                              }}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-2">
                                  <span className="truncate text-xs font-semibold text-[#17122B]">{paciente?.nome_social || paciente?.nome || 'Paciente'}</span>
                                  <span className="shrink-0 text-xs text-[#5B47E0]">Retomar</span>
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                  {draft.queixa_principal?.trim() || 'Evolução sem queixa principal'}
                                  {draft.updated_at ? ` · salva ${format(new Date(draft.updated_at), 'dd/MM HH:mm', { locale: ptBR })}` : ''}
                                </span>
                              </span>
                              <ArrowRight className="ml-2 h-3.5 w-3.5 shrink-0 text-[#7B6CF6]" aria-hidden="true" />
                            </Button>
                          );
                        })}
                        {rascunhosAbertos.length >= LIMITE_BUSCA_EM_BLOCOS && (
                          <p role="status" className="text-xs text-warning-foreground">A lista atingiu o limite de consulta. Refine os rascunhos ou peça apoio ao administrador.</p>
                        )}
                      </div>
                    )}
                  </section>
                )}
                {pacientesBuscaQuery.isError ? (
                  <div className="p-3">
                    <ErrorState compact title="Não foi possível buscar pacientes" error={pacientesBuscaQuery.error} onRetry={() => void pacientesBuscaQuery.refetch()} />
                  </div>
                ) : buscandoPacientes ? (
                  <p className="px-3 py-8 text-center text-xs text-muted-foreground" role="status">Buscando pacientes…</p>
                ) : null}
                {filteredPacientes.map(pac => {
                  const isSelected = selectedPacienteId === pac.id;
                  return (
                    <PatientSearchResult
                      key={pac.id}
                      paciente={pac}
                      selecionado={isSelected}
                      detalhe={pac.data_nascimento ? `${calcularIdade(pac.data_nascimento)} anos` : 'Data de nascimento não informada'}
                      onSelect={() => {
                        prescricoesRequestRef.current += 1;
                        setRascunhoParaAbrir(null);
                        setErroPrescricoes(null);
                        setSelectedPacienteId(pac.id);
                        setShowPatientPicker(false);
                      }}
                    />
                  );
                })}
                {!pacientesBuscaQuery.isError && !buscandoPacientes && filteredPacientes.length === 0 && (
                  <div className="flex flex-col items-center gap-2 px-3 py-10 text-center text-xs text-muted-foreground">
                    <p>{searchTerm.trim() ? 'Nenhum paciente corresponde à busca' : 'Nenhum paciente cadastrado recentemente'}</p>
                    {searchTerm.trim() && (
                      <Button size="sm" variant="outline" onClick={() => setSearchTerm('')}>
                        Limpar busca
                      </Button>
                    )}
                  </div>
                )}
                {!pacientesBuscaQuery.isError && !buscandoPacientes && pacientesBuscaQuery.data?.incompleta && (
                  <p className="border-t px-3 py-2 text-xs text-muted-foreground" role="status">
                    Há mais resultados. Digite mais caracteres para refinar a busca.
                  </p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* ─── Patient File + Records (Right column) ─── */}
        <div className="lg:col-span-9 space-y-4">
          {selectedPacienteId && pacienteSelecionadoQuery.isError ? (
            <ErrorState
              title="Não foi possível carregar a ficha do paciente"
              error={pacienteSelecionadoQuery.error}
              onRetry={() => void pacienteSelecionadoQuery.refetch()}
            />
          ) : selectedPacienteId && pacienteSelecionadoQuery.isLoading ? (
            <Card><CardContent className="space-y-3 py-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-24" /></CardContent></Card>
          ) : !selectedPaciente ? (
            <Card className="relative overflow-hidden rounded-[24px] border-dashed border-border/70">
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
              <CardContent className="relative flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground lg:py-20">
                <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[image:var(--gradient-primary)] text-white shadow-glow">
                  <FileText className="h-7 w-7" />
                </span>
                <p className="text-lg font-extrabold text-foreground">Escolha um paciente para começar</p>
                <p className="text-center text-sm">
                  <span className="lg:hidden">Selecione um paciente na lista acima para abrir o prontuário.</span>
                  <span className="hidden lg:inline">Selecione um paciente na lista à esquerda para abrir o prontuário.</span>
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid min-w-0 gap-4 xl:grid-cols-12 xl:items-start">
              <aside aria-label="Contexto clínico do paciente" className="min-w-0 space-y-3 xl:col-span-4 xl:sticky xl:top-4">
                <FichaPaciente paciente={selectedPaciente} convenioNome={getConvenioNome(selectedPaciente.convenio_id)} />
                <ClinicalSafetyPanel compact pacienteId={selectedPacienteId!} alergias={selectedPaciente.alergias} />
              </aside>

              <section aria-label="Evoluções e ações do prontuário" className="min-w-0 space-y-4 xl:col-span-8">
              {/* Actions bar */}
              <div className="flex items-center gap-2">
                <Button onClick={() => handleNovoProntuario()} size="sm" className="gap-1.5 rounded-xl" disabled={!!erroMedicos || !!erroProntuarios}>
                  <Plus className="h-3.5 w-3.5" />Novo Atendimento
                </Button>
                <span className="text-xs text-muted-foreground flex-1">
                  {pacienteProntuarios.length} evolução(ões) registrada(s)
                </span>
              </div>

              {/* Content tabs */}
              <Card className="border-border/50 overflow-hidden">
                <Tabs defaultValue="evolucoes" className="w-full">
                  <div className="border-b border-border/40 px-4 pt-3">
                    <TabsList
                      aria-label="Abas da ficha do paciente"
                      className="grid h-auto w-full grid-cols-2 gap-1 bg-transparent p-0 sm:flex sm:flex-wrap sm:gap-0"
                    >
                      {[
                        { val: 'evolucoes', icon: FileText, label: 'Evoluções' },
                        { val: 'solicitacoes', icon: TestTube, label: 'Solicitações' },
                        { val: 'timeline', icon: History, label: 'Timeline' },
                        { val: 'vitais', icon: Activity, label: 'Sinais' },
                        { val: 'ficha', icon: User, label: 'Ficha' },
                        { val: 'exportar', icon: Share2, label: 'Exportar' },
                      ].map(t => (
                        <TabsTrigger
                          key={t.val}
                          value={t.val}
                          className="min-h-11 justify-center gap-1 rounded-lg border border-transparent px-2 py-2 text-xs data-[state=active]:border-primary/30 data-[state=active]:bg-primary/5 data-[state=active]:shadow-none sm:min-h-9 sm:justify-start sm:px-3"
                        >
                          <t.icon className="h-3 w-3" />{t.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  <div className="p-4">
                    <TabsContent value="evolucoes" className="mt-0">
                      {erroProntuarios ? (
                        <ErrorState compact error={erroProntuarios} title="Histórico indisponível" onRetry={() => { void refetchProntuarios(); }} />
                      ) : pacienteProntuarios.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-12 text-center">
                          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] text-white shadow-glow"><FileText className="h-5 w-5" /></span>
                          <p className="text-sm font-bold text-foreground">Nenhuma evolução registrada</p>
                          <p className="max-w-sm text-xs text-muted-foreground">O primeiro atendimento deste paciente aparecerá aqui, com queixa, exame físico, conduta e prescrições.</p>
                          <Button size="sm" className="mt-1" onClick={() => handleNovoProntuario()} disabled={!!erroMedicos || !!erroProntuarios}><Plus className="h-3.5 w-3.5" />Iniciar primeiro atendimento</Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {pacienteProntuarios.map((p, idx) => (
                            <motion.div
                              key={p.id}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.02 }}
                              role="button"
                              tabIndex={0}
                              className="group cursor-pointer rounded-xl border border-border/40 p-3.5 transition-colors hover:border-primary/30 hover:bg-primary/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              aria-label={`Abrir evolução de ${format(new Date(p.data), 'dd/MM/yyyy')}: ${p.queixa_principal || 'Atendimento clínico'}`}
                              onKeyDown={event => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  handleViewProntuario(p);
                                }
                              }}
                              onClick={() => handleViewProntuario(p)}
                            >
                              <div className="flex justify-between items-start">
                                <div className="space-y-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-bold px-1.5 py-0">
                                      {format(parseDateOnly(p.data)!, 'dd/MM/yyyy')}
                                    </Badge>
                                    {p.diagnostico_principal && (
                                      <Badge variant="secondary" className="text-xs px-1.5 py-0">{p.diagnostico_principal}</Badge>
                                    )}
                                  </div>
                                  <p className="text-xs font-semibold text-foreground truncate">{p.queixa_principal}</p>
                                  {p.conduta && <p className="text-xs text-muted-foreground line-clamp-1">Conduta: {p.conduta}</p>}
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="solicitacoes" className="mt-0">
                      <RelatedRecords pacienteId={selectedPacienteId!} />
                    </TabsContent>

                    <TabsContent value="timeline" className="mt-0">
                      <PatientTimeline pacienteId={selectedPacienteId!} maxItems={30} />
                    </TabsContent>

                    <TabsContent value="vitais" className="mt-0">
                      <VitalSignsChart pacienteId={selectedPacienteId!} />
                    </TabsContent>

                    <TabsContent value="ficha" className="mt-0">
                      <FichaPaciente paciente={selectedPaciente} convenioNome={getConvenioNome(selectedPaciente.convenio_id)} />
                    </TabsContent>

                    <TabsContent value="exportar" className="mt-0">
                      <div className="space-y-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Share2 className="h-3.5 w-3.5" />
                          Exporta evoluções, prescrições, exames, adendos e arquivos anexados. O FHIR inclui CPF, telefone e e-mail. O arquivo sai criptografado e pode ser aberto na área de Interoperabilidade.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="border rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">JSON</Badge>
                              <span className="text-xs font-bold">HL7 FHIR R4</span>
                            </div>
                            <p className="text-xs text-muted-foreground">Padrão internacional para interoperabilidade em saúde.</p>
                            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" disabled={loadingHistorico || !!erroHistorico} onClick={async () => {
                              const ids = historicoEvolucoes.map((p: any) => p.id);
                              let complementosExportacao: Awaited<ReturnType<typeof carregarDadosCompletosExportacao>>;
                              try { complementosExportacao = await carregarDadosCompletosExportacao(selectedPaciente.id, ids); }
                              catch (error) { toast.error('A portabilidade foi interrompida porque algum dado ou arquivo clínico não pôde ser carregado.', { description: mensagemDeErro(error) }); return; }
                              const exportFormat = 'FHIR R4 JSON';
                              const exportData = {
                                paciente: {
                                  id: selectedPaciente.id, nome: selectedPaciente.nome,
                                  nome_social: (selectedPaciente as any).nome_social,
                                  cpf: selectedPaciente.cpf || undefined, data_nascimento: selectedPaciente.data_nascimento || undefined,
                                  sexo: selectedPaciente.sexo || undefined, telefone: selectedPaciente.telefone || undefined,
                                  email: selectedPaciente.email || undefined, alergias: selectedPaciente.alergias || [],
                                },
                                prontuarios: historicoEvolucoes.map((p: any) => ({
                                  id: p.id, data: p.data, queixa_principal: p.queixa_principal,
                                  historia_doenca_atual: p.historia_doenca_atual, hipotese_diagnostica: p.hipotese_diagnostica,
                                  historia_patologica_pregressa: p.historia_patologica_pregressa, historia_familiar: p.historia_familiar,
                                  historia_social: p.historia_social, revisao_sistemas: p.revisao_sistemas,
                                  exames_fisicos: p.exames_fisicos, alergias_relatadas: p.alergias_relatadas,
                                  medicamentos_em_uso: p.medicamentos_em_uso,
                                  diagnostico_principal: p.diagnostico_principal, diagnosticos_secundarios: p.diagnosticos_secundarios,
                                  conduta: p.conduta,
                                  sinais_vitais: p.sinais_vitais, assinado: p.assinado,
                                  medico_nome: p.medicos?.nome, medico_crm: p.medicos?.crm,
                                  assinado_por: p.assinado_por, crm_assinante: p.crm_assinante,
                                })),
                                ...complementosExportacao,
                              };
                              setExportacaoPendente({ conteudo: exportToFHIR(exportData), nomeArquivo: `prontuario-${selectedPaciente.id}`, tipo: 'application/json', formato: exportFormat, ids });
                            }}>
                              <FileDown className="h-3.5 w-3.5" />Exportar FHIR
                            </Button>
                          </div>
                          <div className="border rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">XML</Badge>
                              <span className="text-xs font-bold">XML clínico simplificado</span>
                            </div>
                          <p className="text-xs text-muted-foreground">Documento XML com seções clínicas e anexos embutidos.</p>
                            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" disabled={loadingHistorico || !!erroHistorico} onClick={async () => {
                              const ids = historicoEvolucoes.map((p: any) => p.id);
                              let complementosExportacao: Awaited<ReturnType<typeof carregarDadosCompletosExportacao>>;
                              try { complementosExportacao = await carregarDadosCompletosExportacao(selectedPaciente.id, ids); }
                              catch (error) { toast.error('A portabilidade foi interrompida porque algum dado ou arquivo clínico não pôde ser carregado.', { description: mensagemDeErro(error) }); return; }
                              const exportFormat = 'XML clínico simplificado';
                              const exportData = {
                                paciente: {
                                  id: selectedPaciente.id, nome: selectedPaciente.nome,
                                  nome_social: (selectedPaciente as any).nome_social,
                                  cpf: selectedPaciente.cpf || undefined, data_nascimento: selectedPaciente.data_nascimento || undefined,
                                  sexo: selectedPaciente.sexo || undefined, alergias: selectedPaciente.alergias || [],
                                },
                                prontuarios: historicoEvolucoes.map((p: any) => ({
                                  id: p.id, data: p.data, queixa_principal: p.queixa_principal,
                                  historia_doenca_atual: p.historia_doenca_atual,
                                  historia_patologica_pregressa: p.historia_patologica_pregressa, historia_familiar: p.historia_familiar,
                                  historia_social: p.historia_social, revisao_sistemas: p.revisao_sistemas,
                                  exames_fisicos: p.exames_fisicos, alergias_relatadas: p.alergias_relatadas,
                                  medicamentos_em_uso: p.medicamentos_em_uso,
                                  hipotese_diagnostica: p.hipotese_diagnostica, diagnostico_principal: p.diagnostico_principal,
                                  diagnosticos_secundarios: p.diagnosticos_secundarios,
                                  conduta: p.conduta, sinais_vitais: p.sinais_vitais,
                                  medico_nome: p.medicos?.nome, medico_crm: p.medicos?.crm,
                                  assinado_por: p.assinado_por, crm_assinante: p.crm_assinante,
                                })),
                                ...complementosExportacao,
                              };
                              setExportacaoPendente({ conteudo: exportToXML(exportData), nomeArquivo: `prontuario-${selectedPaciente.id}`, tipo: 'application/xml', formato: exportFormat, ids });
                            }}>
                              <FileDown className="h-3.5 w-3.5" />Exportar XML
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" />Art. 18 LGPD — direito de portabilidade dos dados.
                        </p>
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </Card>
              </section>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ─── Prontuário Dialog ─────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════ */}
      {exportacaoPendente && <ExportacaoClinicaProtegida
        open={Boolean(exportacaoPendente)}
        onOpenChange={aberto => { if (!aberto) setExportacaoPendente(null); }}
        conteudo={exportacaoPendente.conteudo}
        nomeArquivo={exportacaoPendente.nomeArquivo}
        tipo={exportacaoPendente.tipo}
        onBeforeDownload={async () => {
          try { await registrarExportacaoProntuarios(exportacaoPendente.ids, exportacaoPendente.formato); }
          catch (error) { throw new Error(`Exportação bloqueada porque a auditoria não pôde ser registrada: ${mensagemDeErro(error)}`); }
        }}
      />}
      <Dialog open={isProntuarioOpen} onOpenChange={handleProntuarioOpenChange}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center justify-between flex-wrap gap-2">
              <span className="flex items-center gap-2 text-base">
                <Stethoscope className="h-4 w-4 text-primary" />
                {currentProntuario.id ? 'Prontuário' : 'Novo Atendimento'}
                {selectedPaciente && <span className="text-muted-foreground font-normal text-sm">— {selectedPaciente.nome}</span>}
              </span>
              <div className="flex gap-1.5 flex-wrap">
                {selectedPaciente && (medicoId || user?.id) && (
                  <ReturnScheduler pacienteId={selectedPaciente.id} prontuarioId={currentProntuario.id} medicoId={medicoId || user?.id || ''} compact />
                )}
                {currentProntuario.id && (() => {
                  const buildPDF = () => {
                    const md = medicos.find((m: any) => m.id === currentProntuario.medico_id);
                    return gerarProntuarioPDF(
                      {
                        nome: selectedPaciente?.nome || '', cpf: selectedPaciente?.cpf || undefined,
                        dataNascimento: selectedPaciente?.data_nascimento || undefined,
                        alergias: selectedPaciente?.alergias || [], telefone: selectedPaciente?.telefone || undefined,
                        email: selectedPaciente?.email || undefined, sexo: selectedPaciente?.sexo || undefined,
                        convenio: getConvenioNome(selectedPaciente?.convenio_id),
                        numeroCarteira: selectedPaciente?.numero_carteira || undefined,
                        nomeResponsavel: selectedPaciente?.nome_responsavel || undefined,
                      },
                      { nome: md?.nome || user?.nome || 'Médico', crm: md?.crm, especialidade: md?.especialidade, rqe: md?.rqe, crmUf: md?.crm_uf },
                      {
                        id: currentProntuario.id, data: currentProntuario.data, queixaPrincipal: currentProntuario.queixa_principal,
                        historiaDoencaAtual: currentProntuario.historia_doenca_atual,
                        historiaPatologicaPregressa: currentProntuario.historia_patologica_pregressa,
                        historiaFamiliar: currentProntuario.historia_familiar, historiaSocial: currentProntuario.historia_social,
                        revisaoSistemas: currentProntuario.revisao_sistemas, alergiasRelatadas: currentProntuario.alergias_relatadas,
                        medicamentosEmUso: currentProntuario.medicamentos_em_uso, examesFisicos: currentProntuario.exames_fisicos,
                        exameCabecaPescoco: currentProntuario.exame_cabeca_pescoco, exameTorax: currentProntuario.exame_torax,
                        exameAbdomen: currentProntuario.exame_abdomen, exameMembros: currentProntuario.exame_membros,
                        exameNeurologico: currentProntuario.exame_neurologico, examePele: currentProntuario.exame_pele,
                        hipoteseDiagnostica: currentProntuario.hipotese_diagnostica, diagnosticoPrincipal: currentProntuario.diagnostico_principal,
                        diagnosticosSecundarios: currentProntuario.diagnosticos_secundarios,
                        conduta: currentProntuario.conduta, planoTerapeutico: currentProntuario.plano_terapeutico,
                        orientacoesPaciente: currentProntuario.orientacoes_paciente,
                        sinaisVitais: sinaisVitais as unknown as Record<string, string>,
                      },
                      prescricoes.filter(p => p.medicamento.trim())
                    );
                  };
                  const fn = `prontuario-${selectedPaciente?.nome?.replace(/\s+/g, '-') || 'paciente'}`;
                  return (
                    <>
                      {/* `buildPDF()` agora é assíncrono: o jsPDF só é baixado
                          quando alguém clica, em vez de vir junto com a tela. */}
                      <Button variant="outline" size="sm" disabled={!currentProntuario.id || salvandoProntuario} onClick={async () => { if (await auditarExportacaoPdf('PDF')) openPDF(await buildPDF()); }} className="gap-1 text-xs h-7"><ExternalLink className="h-3 w-3" />Visualizar</Button>
                      <Button variant="outline" size="sm" disabled={!currentProntuario.id || salvandoProntuario} onClick={async () => { if (await auditarExportacaoPdf('PDF')) downloadPDF(await buildPDF(), fn); }} className="gap-1 text-xs h-7"><Printer className="h-3 w-3" />PDF</Button>
                      <Button variant="outline" size="sm" onClick={async () => {
                        if (!await auditarExportacaoPdf('WhatsApp')) return;
                        sharePDFWhatsApp(await buildPDF(), fn, selectedPaciente?.telefone);
                        toast.info('WhatsApp', { description: 'PDF baixado! Cole na conversa.' });
                      }} disabled={!currentProntuario.id || salvandoProntuario} className="gap-1 text-xs h-7 text-success border-success/30 hover:bg-success/5">
                        <MessageCircle className="h-3 w-3" />WhatsApp
                      </Button>
                    </>
                  );
                })()}
                <Button variant="outline" size="sm" onClick={() => setShowDischargeReport(true)} className="text-xs h-7 gap-1">
                  <FileCheck className="h-3 w-3" />Alta
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          {/* Patient summary strip */}
          {selectedPaciente && (
            <div className="flex-shrink-0 flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-xl text-xs border border-border/40">
              <Badge className="bg-primary/10 text-primary border-primary/20 gap-1 font-bold text-xs">
                <User className="h-2.5 w-2.5" />{selectedPaciente.nome}
              </Badge>
              <span className="text-muted-foreground">{selectedPaciente.data_nascimento ? `${calcularIdade(selectedPaciente.data_nascimento)}a` : 'N/I'}</span>
              {selectedPaciente.cpf && <span className="text-muted-foreground">• {selectedPaciente.cpf}</span>}
              <span className="text-muted-foreground">• {getConvenioNome(selectedPaciente.convenio_id)}</span>
              <Badge className="ml-auto bg-success/10 text-success border-success/20 text-xs rounded-full px-2">
                <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />LGPD
              </Badge>
            </div>
          )}

          {!currentProntuario.id && !medicoId && (
            <div className="flex-shrink-0 space-y-1.5 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2">
              <Label htmlFor="prontuario-medico-responsavel" className="text-xs font-semibold">
                Médico responsável pela evolução *
              </Label>
              <Select
                value={currentProntuario.medico_id || ''}
                onValueChange={value => updateField('medico_id', value)}
                disabled={salvandoProntuario}
              >
                <SelectTrigger id="prontuario-medico-responsavel" className="h-10 bg-background">
                  <SelectValue placeholder="Selecione quem realizou o atendimento" />
                </SelectTrigger>
                <SelectContent>
                  {medicos
                    .filter((medico: any) => medico.ativo !== false || medico.id === currentProntuario.medico_id)
                    .map((medico: any) => (
                      <SelectItem key={medico.id} value={medico.id}>
                        {medico.nome || `CRM ${medico.crm}`}{medico.ativo === false ? ' (inativo — vínculo existente)' : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A evolução será registrada no prontuário deste profissional.
              </p>
            </div>
          )}

          {/* Read-only banner */}
          {isReadOnly && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border ${
                isSigned ? 'bg-success/8 border-success/30' : 'bg-warning/8 border-warning/25'
              }`}
            >
              <Lock className={`h-3.5 w-3.5 flex-shrink-0 ${isSigned ? 'text-success' : 'text-warning'}`} />
              <span className={`text-xs font-medium flex-1 ${isSigned ? 'text-success' : 'text-warning'}`}>
                {isSigned
                  ? `Assinado eletronicamente — bloqueado para edição${currentProntuario.assinado_em ? ` em ${format(new Date(currentProntuario.assinado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}` : ''}`
                  : 'Rascunho em modo de leitura'}
              </span>
              {!isSigned && (
                <Button variant="outline" size="sm" onClick={handleRequestEdit} disabled={!!erroPrescricoes} className="h-6 text-xs gap-1 border-warning/40 text-warning hover:bg-warning/10">
                  <PenLine className="h-3 w-3" />Solicitar Edição
                </Button>
              )}
            </motion.div>
          )}

          {erroPrescricoes && currentProntuario.id && (
            <ErrorState
              compact
              error={erroPrescricoes}
              title="Prescrições não carregaram"
              description="O prontuário está em modo de leitura para evitar sobrescrever prescrições ocultas. Recarregue antes de solicitar edição."
              onRetry={() => void carregarPrescricoes(currentProntuario.id)}
            />
          )}

          {/* Scrollable content */}
          <ScrollArea className="flex-1 pr-4">
            <Tabs defaultValue="anamnese" className="w-full">
                <TabsList
                  aria-label="Seções do prontuário"
                  className="mb-3 grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted/40 p-1 sm:flex sm:flex-wrap sm:justify-start sm:gap-0.5"
                >
                  {[
                    { val: 'anamnese', icon: ClipboardList, label: 'Anamnese' },
                    { val: 'exame', icon: Stethoscope, label: 'Exame' },
                    { val: 'diagnostico', icon: BookOpen, label: 'Diagnóstico' },
                    { val: 'conduta', icon: FileCheck, label: 'Conduta' },
                    { val: 'prescricao', icon: Pill, label: 'Prescrição' },
                    { val: 'anexos', icon: Paperclip, label: 'Anexos' },
                    { val: 'historico', icon: History, label: 'Histórico' },
            { val: 'adendos', icon: ScrollText, label: 'Adendos' },
                    ...(user?.roles?.includes('admin') ? [{ val: 'auditoria', icon: Shield, label: 'Auditoria' }] : []),
                  ].map(t => (
                    <TabsTrigger key={t.val} value={t.val} className="min-h-11 justify-start gap-1.5 rounded-lg px-2.5 py-2 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm sm:min-h-9 sm:justify-center sm:px-3 sm:py-1.5">
                      <t.icon className="h-3.5 w-3.5" />{t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* ─── Anamnese ─── */}
                <TabsContent value="anamnese" className="space-y-4 pt-1">
                  <fieldset disabled={isReadOnly || salvandoProntuario} className="contents">
                  {!currentProntuario.id && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />Templates SOAP
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: 'Rotina', data: { queixa_principal: 'Consulta de rotina / Check-up', historia_doenca_atual: 'Paciente comparece para avaliação de rotina. Nega queixas ativas.', conduta: 'Exames de rotina. Orientações. Retorno com resultados.' } },
                          { label: 'Retorno', data: { queixa_principal: 'Retorno com resultados', historia_doenca_atual: 'Retorna para avaliação de exames. Nega intercorrências.' } },
                          { label: 'Pré-Natal', data: { queixa_principal: 'Consulta pré-natal', historia_doenca_atual: 'Gestante. IG: __ sem. DUM: __. Mov. fetal: presente.' } },
                          { label: 'Pediatria', data: { queixa_principal: 'Puericultura', historia_doenca_atual: 'Acompanhamento infantil. Peso: __kg. Altura: __cm.' } },
                          { label: 'Urgência', data: { queixa_principal: '', historia_doenca_atual: 'Início: ___. Duração: ___. Localização: ___. Intensidade: ___/10.' } },
                          { label: 'Ortopedia', data: { queixa_principal: 'Dor em ___', historia_doenca_atual: 'Dor há ___. Mecanismo do trauma: ___. Limitação funcional: ___.' } },
                          { label: 'Dermatologia', data: { queixa_principal: 'Lesão cutânea', historia_doenca_atual: 'Lesão em ___. Tipo: ___. Tamanho: ___cm. Prurido: ___.' } },
                        ].map(t => (
                          <Button key={t.label} variant="outline" size="sm" className="text-xs h-6 gap-1 px-2" onClick={() => {
                            Object.entries(t.data).forEach(([f, v]) => { if (v) updateField(f, v); });
                            toast.success('Template aplicado', { description: `"${t.label}" preenchido.` });
                          }}>
                            <Clipboard className="h-2.5 w-2.5" />{t.label}
                          </Button>
                        ))}
                      </div>
                      <Separator />
                    </div>
                  )}

                  <Section icon={AlertTriangle} title="Queixa Principal *">
                    <Textarea aria-label="Queixa principal" placeholder="Queixa principal..." value={currentProntuario.queixa_principal || ''} onChange={e => updateField('queixa_principal', e.target.value)} rows={2} />
                  </Section>
                  <Section icon={FileText} title="História da Doença Atual (HDA)">
                    <Textarea aria-label="História da doença atual" placeholder="Evolução cronológica, fatores de melhora/piora..." value={currentProntuario.historia_doenca_atual || ''} onChange={e => updateField('historia_doenca_atual', e.target.value)} rows={4} />
                  </Section>
                  <Section icon={History} title="Doenças Pregressas (HDP)" collapsible>
                    <Textarea aria-label="História patológica pregressa" placeholder="Doenças prévias, cirurgias, internações..." value={currentProntuario.historia_patologica_pregressa || ''} onChange={e => updateField('historia_patologica_pregressa', e.target.value)} rows={3} />
                  </Section>
                  <Section icon={ShieldCheck} title="Alergias e Medicamentos">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5 text-destructive" />Alergias</Label>
                        <Textarea aria-label="Alergias relatadas" placeholder="Medicamentos, alimentos..." value={currentProntuario.alergias_relatadas || ''} onChange={e => updateField('alergias_relatadas', e.target.value)} rows={2} className="border-destructive/30" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1"><Pill className="h-2.5 w-2.5" />Em uso</Label>
                        <Textarea aria-label="Medicamentos em uso" placeholder="Medicamentos em uso..." value={currentProntuario.medicamentos_em_uso || ''} onChange={e => updateField('medicamentos_em_uso', e.target.value)} rows={2} />
                      </div>
                    </div>
                  </Section>
                  <Section icon={User} title="História Familiar" collapsible>
                    <Textarea aria-label="História familiar" placeholder="DM, HAS, câncer, cardiopatias..." value={currentProntuario.historia_familiar || ''} onChange={e => updateField('historia_familiar', e.target.value)} rows={2} />
                  </Section>
                  <Section icon={Clipboard} title="História Social" collapsible>
                    <Textarea aria-label="História social" placeholder="Tabagismo, etilismo, profissão..." value={currentProntuario.historia_social || ''} onChange={e => updateField('historia_social', e.target.value)} rows={2} />
                  </Section>
                  <Section icon={ClipboardList} title="Revisão de Sistemas" collapsible>
                    <Textarea aria-label="Revisão de sistemas" placeholder="Cardiovascular, respiratório, GI, neuro..." value={currentProntuario.revisao_sistemas || ''} onChange={e => updateField('revisao_sistemas', e.target.value)} rows={3} />
                  </Section>

                  </fieldset></TabsContent>

                {/* ─── Exame Físico ─── */}
                <TabsContent value="exame" className="space-y-4 pt-1">
                  <fieldset disabled={isReadOnly || salvandoProntuario} className="contents">
                  <VitalSignsInput sinais={sinaisVitais} onChange={(value) => { setSinaisVitais(value); setHasUnsavedChanges(true); changeVersionRef.current += 1; }} />
                  <Separator />
                  <Section icon={Stethoscope} title="Exame Físico Geral">
                    <Textarea aria-label="Exame físico geral" placeholder="Estado geral, consciência, hidratação..." value={currentProntuario.exames_fisicos || ''} onChange={e => updateField('exames_fisicos', e.target.value)} rows={3} />
                  </Section>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Section icon={EyeIcon} title="Cabeça e Pescoço" collapsible>
                      <Textarea aria-label="Exame de cabeça e pescoço" placeholder="Olhos, ouvidos, tireoide..." value={currentProntuario.exame_cabeca_pescoco || ''} onChange={e => updateField('exame_cabeca_pescoco', e.target.value)} rows={3} />
                    </Section>
                    <Section icon={Heart} title="Tórax" collapsible>
                      <Textarea aria-label="Exame do tórax" placeholder="Ausculta cardíaca/pulmonar..." value={currentProntuario.exame_torax || ''} onChange={e => updateField('exame_torax', e.target.value)} rows={3} />
                    </Section>
                    <Section icon={Activity} title="Abdome" collapsible>
                      <Textarea aria-label="Exame do abdome" placeholder="Inspeção, palpação..." value={currentProntuario.exame_abdomen || ''} onChange={e => updateField('exame_abdomen', e.target.value)} rows={3} />
                    </Section>
                    <Section icon={Bone} title="Membros" collapsible>
                      <Textarea aria-label="Exame dos membros" placeholder="Edema, pulsos, mobilidade..." value={currentProntuario.exame_membros || ''} onChange={e => updateField('exame_membros', e.target.value)} rows={3} />
                    </Section>
                    <Section icon={Brain} title="Neurológico" collapsible>
                      <Textarea aria-label="Exame neurológico" placeholder="Força, sensibilidade, reflexos..." value={currentProntuario.exame_neurologico || ''} onChange={e => updateField('exame_neurologico', e.target.value)} rows={3} />
                    </Section>
                    <Section icon={Stethoscope} title="Pele / Tegumentar" collapsible>
                      <Textarea aria-label="Exame da pele" placeholder="Lesões, coloração, turgor..." value={currentProntuario.exame_pele || ''} onChange={e => updateField('exame_pele', e.target.value)} rows={3} />
                    </Section>
                  </div>

                  </fieldset></TabsContent>

                {/* ─── Diagnóstico ─── */}
                <TabsContent value="diagnostico" className="space-y-4 pt-1">
                  <fieldset disabled={isReadOnly || salvandoProntuario} className="contents">
                  <Section icon={BookOpen} title="Hipótese Diagnóstica (CID-10)">
                    <Cid10Search ariaLabel="Hipótese diagnóstica CID-10" value={currentProntuario.hipotese_diagnostica || ''} onChange={v => updateField('hipotese_diagnostica', v)} />
                  </Section>
                  <Section icon={FileCheck} title="Diagnóstico Principal">
                    <Cid10Search ariaLabel="Diagnóstico principal CID-10" value={currentProntuario.diagnostico_principal || ''} onChange={v => updateField('diagnostico_principal', v)} placeholder="Buscar CID-10 principal..." multiple={false} />
                  </Section>
                  <Section icon={ClipboardList} title="Diagnósticos Secundários" collapsible>
                    <Textarea aria-label="Diagnósticos secundários" placeholder="Comorbidades, um por linha" value={(currentProntuario.diagnosticos_secundarios || []).join('\n')} onChange={e => updateField('diagnosticos_secundarios', e.target.value.split('\n').filter(Boolean))} rows={3} />
                  </Section>

                  </fieldset></TabsContent>

                {/* ─── Conduta ─── */}
                <TabsContent value="conduta" className="space-y-4 pt-1">
                  <fieldset disabled={isReadOnly || salvandoProntuario} className="contents">
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => setShowProtocols(true)} className="text-xs h-6 gap-1">
                      <CalendarCheck className="h-3 w-3" />Aplicar Protocolo Clínico
                    </Button>
                  </div>
                  <Section icon={FileCheck} title="Conduta">
                    <Textarea aria-label="Conduta" placeholder="Conduta terapêutica, exames, encaminhamentos..." value={currentProntuario.conduta || ''} onChange={e => updateField('conduta', e.target.value)} rows={4} />
                  </Section>
                  <Section icon={ClipboardList} title="Plano Terapêutico">
                    <Textarea aria-label="Plano terapêutico" placeholder="Plano detalhado..." value={currentProntuario.plano_terapeutico || ''} onChange={e => updateField('plano_terapeutico', e.target.value)} rows={3} />
                  </Section>
                  <Section icon={User} title="Orientações ao Paciente">
                    <Textarea aria-label="Orientações ao paciente" placeholder="Cuidados, retorno, sinais de alarme..." value={currentProntuario.orientacoes_paciente || ''} onChange={e => updateField('orientacoes_paciente', e.target.value)} rows={3} />
                  </Section>
                  {/* Procedimento feito na consulta vira cobrança no balcão.
                      Sem agendamento não há conta onde lançar. */}
                  {routeAgendamentoId && (
                    <Section icon={CreditCard} title="Procedimentos Realizados (cobrança)">
                      <ProcedimentosDoAtendimento
                        agendamentoId={routeAgendamentoId}
                        prontuarioId={currentProntuario.id || null}
                      />
                    </Section>
                  )}
                  <Section icon={ShieldCheck} title="Observações Internas" collapsible>
                    <Textarea aria-label="Observações internas" placeholder="Anotações internas (não imprime)..." value={currentProntuario.observacoes_internas || ''} onChange={e => updateField('observacoes_internas', e.target.value)} rows={2} className="border-dashed" />
                  </Section>

                  </fieldset></TabsContent>

                {/* ─── Prescrição ─── */}
                <TabsContent value="prescricao" className="space-y-3 pt-1">
                  <fieldset disabled={isReadOnly || salvandoProntuario} className="contents">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Pill className="h-3.5 w-3.5" />Receituário Digital
                    </span>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => setShowProtocols(true)} className="text-xs h-6 gap-1"><CalendarCheck className="h-3 w-3" />Protocolos</Button>
                      <Button variant="outline" size="sm" onClick={handleAddPrescricao} className="text-xs h-6 gap-1"><Plus className="h-3 w-3" />Adicionar</Button>
                    </div>
                  </div>

                  {/* Dispensar é DIFERENTE de prescrever, e por isso é um botão
                      separado: a maioria das receitas o paciente leva para a
                      farmácia. Baixar o estoque a cada prescrição faria o
                      sistema descontar remédio que nunca saiu do armário.

                      A função de baixa existia, testada, e NINGUÉM a chamava —
                      por isso o estoque tinha zero movimentações e o alerta de
                      estoque baixo disparava todo dia sobre um número que nunca
                      mudava. */}
                  {prescricoes.filter(p => p.medicamento && p.quantidade).length > 0 && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        Entregou o medicamento aqui na clínica? Dê baixa no estoque.
                      </p>
                      <Button
                        variant="outline" size="sm" className="h-6 shrink-0 gap-1 text-xs"
                        disabled={dispensando || salvandoProntuario}
                        onClick={dispensarNaClinica}
                      >
                        <Pill className="h-3 w-3" />
                        {dispensando ? 'Baixando…' : 'Dispensar na clínica'}
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground flex items-center gap-1 bg-muted/40 rounded-lg p-2">
                    <BadgeCheck className="h-3 w-3" />
                    Prescrição sai sem assinatura digital — imprima e assine, ou assine o PDF no gov.br
                  </p>

                  {/* Drug Interaction Checker */}
                  {prescricoes.filter(p => p.medicamento.trim()).length > 0 && (
                    <DrugInteractionChecker
                      medicamentos={prescricoes.filter(p => p.medicamento.trim()).map(p => p.medicamento.trim())}
                      alergias={selectedPaciente?.alergias || []}
                    />
                  )}

                  {prescricoes.length === 0 ? (
                    <div className="flex flex-col items-center py-10 text-muted-foreground">
                      <Pill className="h-8 w-8 opacity-20 mb-2" />
                      <p className="text-xs">Nenhuma prescrição</p>
                      <Button variant="link" size="sm" onClick={handleAddPrescricao} className="text-xs">Adicionar medicamento</Button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {prescricoes.map((presc, i) => (
                        <div key={i} className="border rounded-xl p-3 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-semibold">Medicamento {i + 1}</span>
                            <Button variant="ghost" size="sm" onClick={() => handleRemovePrescricao(i)} className="text-destructive h-6 w-6 p-0"><X className="h-3 w-3" /></Button>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                            <div className="col-span-2 space-y-1 md:col-span-3">
                              <Label htmlFor={`prescricao-${i}-medicamento`} className="text-xs">Medicamento *</Label>
                              <Input id={`prescricao-${i}-medicamento`} aria-label={`Medicamento ${i + 1}: nome`} placeholder="Nome do medicamento" value={presc.medicamento} onChange={e => handleUpdatePrescricao(i, 'medicamento', e.target.value)} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`prescricao-${i}-dosagem`} className="text-xs">Dosagem</Label>
                              <Input id={`prescricao-${i}-dosagem`} aria-label={`Medicamento ${i + 1}: dosagem`} placeholder="Ex.: 500 mg" value={presc.dosagem} onChange={e => handleUpdatePrescricao(i, 'dosagem', e.target.value)} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`prescricao-${i}-posologia`} className="text-xs">Posologia</Label>
                              <Input id={`prescricao-${i}-posologia`} aria-label={`Medicamento ${i + 1}: posologia`} placeholder="Ex.: 1 comprimido a cada 8 h" value={presc.posologia} onChange={e => handleUpdatePrescricao(i, 'posologia', e.target.value)} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`prescricao-${i}-duracao`} className="text-xs">Duração</Label>
                              <Input id={`prescricao-${i}-duracao`} aria-label={`Medicamento ${i + 1}: duração do tratamento`} placeholder="Ex.: 7 dias" value={presc.duracao} onChange={e => handleUpdatePrescricao(i, 'duracao', e.target.value)} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`prescricao-${i}-quantidade`} className="text-xs">Quantidade</Label>
                              <Input id={`prescricao-${i}-quantidade`} aria-label={`Medicamento ${i + 1}: quantidade`} placeholder="Ex.: 21" value={presc.quantidade} onChange={e => handleUpdatePrescricao(i, 'quantidade', e.target.value)} className="h-9 text-sm" />
                            </div>
                            <div className="col-span-2 space-y-1 md:col-span-2">
                              <Label htmlFor={`prescricao-${i}-observacoes`} className="text-xs">Observações</Label>
                              <Input id={`prescricao-${i}-observacoes`} aria-label={`Medicamento ${i + 1}: observações`} placeholder="Instruções adicionais" value={presc.observacoes} onChange={e => handleUpdatePrescricao(i, 'observacoes', e.target.value)} className="h-9 text-sm" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  </fieldset></TabsContent>

                {/* ─── Anexos ─── */}
                <TabsContent value="anexos" className="pt-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1 bg-muted/40 rounded-lg p-2 mb-3">
                    <Paperclip className="h-3 w-3" />Upload de PDFs, imagens e exames — LGPD.
                  </p>
                  {currentProntuario.id && selectedPacienteId ? (
                    <AnexosWrapper pacienteId={selectedPacienteId} prontuarioId={currentProntuario.id} readOnly={isReadOnly || salvandoProntuario} />
                  ) : (
                    <div className="flex flex-col items-center py-10 text-muted-foreground">
                      <Paperclip className="h-8 w-8 opacity-20 mb-2" />
                      <p className="text-xs">Salve primeiro para anexar</p>
                    </div>
                  )}

                </TabsContent>

                {/* ─── Histórico ─── */}
                <TabsContent value="historico" className="pt-1">
                  {loadingHistorico ? (
                    <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>
                  ) : erroHistorico ? (
                    <ErrorState compact error={erroHistorico} title="Histórico clínico indisponível" description="Tente carregar novamente antes de exportar ou consultar os registros anteriores." onRetry={() => { setLoadingHistorico(true); setReloadHistorico(value => value + 1); }} />
                  ) : historicoEvolucoes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-10 text-xs">Nenhum registro anterior</p>
                  ) : (
                    <div className="space-y-2">
                      {historicoEvolucoes.map((ev, idx) => (
                        <motion.div
                          key={ev.id}
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.02 }}
                          className="border border-border/40 rounded-xl p-3 space-y-1.5 hover:bg-primary/[0.03] hover:border-primary/30 transition-colors cursor-pointer group"
                          role="button"
                          tabIndex={0}
                          aria-label={`Abrir registro clínico: ${ev.queixa_principal || 'Evolução'}`}
                          onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.currentTarget.click();
                            }
                          }}
                          onClick={() => {
                            if (salvandoProntuario) {
                              toast.info('Aguarde o salvamento terminar antes de abrir outra evolução.');
                              return;
                            }
                            if (hasUnsavedChanges) {
                              prontuarioAposDescartarRef.current = ev;
                              setPerguntandoDescartar(true);
                              return;
                            }
                            setIsProntuarioOpen(false);
                            setTimeout(() => handleViewProntuario(ev), 150);
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-bold px-1.5 py-0">
                                {format(parseDateOnly(ev.data)!, 'dd/MM/yyyy', { locale: ptBR })}
                              </Badge>
                              {ev.medicos && <span className="text-xs text-muted-foreground">{nomeMedico(ev.medicos.nome || ev.medicos.crm)}</span>}
                              {ev.diagnostico_principal && <Badge variant="secondary" className="text-xs px-1.5 py-0">{ev.diagnostico_principal}</Badge>}
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" />
                          </div>
                          {ev.queixa_principal && <p className="text-xs"><strong>QP:</strong> <span className="text-muted-foreground">{ev.queixa_principal}</span></p>}
                          {ev.conduta && <p className="text-xs"><strong>Conduta:</strong> <span className="text-muted-foreground line-clamp-2">{ev.conduta}</span></p>}
                          {ev.sinais_vitais && Object.keys(ev.sinais_vitais).some(k => ev.sinais_vitais[k]) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {ev.sinais_vitais.pressao_sistolica && <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-xs px-1.5 py-0">PA: {ev.sinais_vitais.pressao_sistolica}/{ev.sinais_vitais.pressao_diastolica}</Badge>}
                              {ev.sinais_vitais.frequencia_cardiaca && <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-xs px-1.5 py-0">FC: {ev.sinais_vitais.frequencia_cardiaca}</Badge>}
                              {ev.sinais_vitais.temperatura && <Badge className="bg-warning/10 text-warning border-warning/20 text-xs px-1.5 py-0">T: {ev.sinais_vitais.temperatura}°C</Badge>}
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* ─── Adendos ─── */}
                <TabsContent value="adendos" className="pt-1">
                  {currentProntuario.id ? (
                    <ProntuarioAdendos
                      prontuarioId={currentProntuario.id}
                      medicoNome={medicoDoProntuario?.nome}
                      crm={medicoDoProntuario?.crm}
                      disabled={!podeAdendar}
                    />
                  ) : (
                    <div className="flex flex-col items-center py-10 text-muted-foreground">
                      <ScrollText className="h-8 w-8 opacity-20 mb-2" />
                      <p className="text-xs">Salve o prontuário para registrar adendos</p>
                    </div>
                  )}
                </TabsContent>

                {/* ─── Auditoria ─── */}
                {user?.roles?.includes('admin') && <TabsContent value="auditoria" className="pt-1">
                  {currentProntuario.id ? (
                    <ProntuarioAuditLog prontuarioId={currentProntuario.id} clinicaId={user?.clinica_id} />
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1 bg-muted/40 rounded-lg p-2">
                        <ShieldCheck className="h-3 w-3" />LGPD • CFM — Acessos registrados automaticamente.
                      </p>
                      <div className="space-y-1.5 text-xs">
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Lock className="h-3 w-3" />Níveis de Acesso
                        </h4>
                        {[
                          { role: 'Admin', desc: 'Acesso total ao prontuário e auditoria' },
                          { role: 'Médico', desc: 'Leitura e escrita do prontuário' },
                          { role: 'Enfermagem', desc: 'Triagem e sinais vitais' },
                          { role: 'Recepção', desc: 'Agenda e cadastro — sem histórico médico' },
                          { role: 'Financeiro', desc: 'Sem acesso ao prontuário clínico' },
                        ].map(r => (
                          <div key={r.role} className="flex items-center gap-2 border border-border/40 rounded-lg px-2.5 py-1.5">
                            <Badge variant="outline" className="text-xs px-1.5 py-0">{r.role}</Badge>
                            <span className="text-muted-foreground text-xs">{r.desc}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground text-center py-4">Salve para ver a trilha de auditoria</p>
                    </div>
                  )}
                </TabsContent>}
              </Tabs>
          </ScrollArea>

          {/* Footer */}
          <DialogFooter className="flex-shrink-0 flex-col gap-3 border-t border-border/40 pt-3 sm:flex-row">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                {currentProntuario.id && (
                  <DigitalSignature
                    documentId={currentProntuario.id}
                    documentType="prontuario"
                    signerName={identificacaoAssinante.nome}
                    signerCRM={identificacaoAssinante.crm}
                    compact
                    alreadySigned={isSigned}
                    signedAt={currentProntuario.assinado_em}
                    disabledReason={isEditing || hasUnsavedChanges || salvandoProntuario
                      ? 'Salve as alteraÃ§Ãµes e reabra o prontuÃ¡rio para assinar a versÃ£o atual.'
                      : undefined}
                    onSigned={() => {
                      setCurrentProntuario(prev => ({ ...prev, assinado: true, assinado_em: new Date().toISOString() }));
                      setIsEditing(false);
                      refetchProntuarios();
                    }}
                  />
                )}
                {autoSaveTime && !autoSaveError && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />Salvo às {autoSaveTime}
                  </span>
                )}
                {autoSaveError && (
                  <span role="alert" className="text-xs text-destructive">
                    Falha no salvamento automático: {autoSaveError}. Mantenha esta tela aberta e salve manualmente.
                  </span>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowExamSolicitation(true)} disabled={!currentProntuario.id || !medicoId || isRequestingExam} title={!currentProntuario.id ? 'Salve a evolução antes de solicitar o exame.' : !medicoId ? 'A solicitação exige um médico responsável vinculado à sua sessão.' : undefined} className="rounded-xl text-xs gap-1">
                  <TestTube className="h-3.5 w-3.5" />Solicitar Exame
                </Button>
                <Button variant="outline" onClick={() => handleProntuarioOpenChange(false)} disabled={salvandoProntuario} size="sm" className="rounded-xl text-xs">Cancelar</Button>
                {!isReadOnly && (
                  <Button onClick={handleSave} size="sm" className="gap-1.5 rounded-xl text-xs" disabled={salvandoProntuario}><Save className="h-3.5 w-3.5" />Salvar Prontuário</Button>
                )}
              </div>

              {/* Confirmação antes de fechar com evolução não salva — antes
                  era um window.confirm nativo, fora do padrão do app. */}
              <UnsavedChangesDialog
                open={perguntandoDescartar}
                onOpenChange={(o) => {
                  if (!o) {
                    setPerguntandoDescartar(false);
                    prontuarioAposDescartarRef.current = null;
                  }
                }}
                onConfirm={() => {
                  const proximoProntuario = prontuarioAposDescartarRef.current;
                  prontuarioAposDescartarRef.current = null;
                  setPerguntandoDescartar(false);
                  setIsProntuarioOpen(false);
                  if (proximoProntuario) {
                    window.setTimeout(() => void handleViewProntuario(proximoProntuario), 150);
                  }
                }}
              />
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Protocols Dialog */}
      <Dialog open={showProtocols} onOpenChange={setShowProtocols}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Protocolos Clínicos</DialogTitle></DialogHeader>
          <ClinicalProtocols onSelectProtocol={handleApplyProtocol} />
        </DialogContent>
      </Dialog>

      <DischargeReport isOpen={showDischargeReport} onClose={() => setShowDischargeReport(false)} data={getDischargeReportData()} />

      {/* Exam Solicitation Dialog */}
      <Dialog open={showExamSolicitation} onOpenChange={setShowExamSolicitation}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <TestTube className="h-4 w-4 text-primary" />Solicitar Exame
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="solicitacao-exame-tipo" className="text-xs">Tipo do Exame *</Label>
              <Input id="solicitacao-exame-tipo" aria-label="Nome do exame" placeholder="Ex: Hemograma, Glicemia, TSH..." value={examForm.tipo_exame} onChange={e => setExamForm(f => ({ ...f, tipo_exame: e.target.value }))} className="h-10 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="solicitacao-exame-descricao" className="text-xs">Descrição</Label>
              <Input id="solicitacao-exame-descricao" aria-label="Detalhes do exame" placeholder="Detalhes adicionais" value={examForm.descricao} onChange={e => setExamForm(f => ({ ...f, descricao: e.target.value }))} className="h-10 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="solicitacao-exame-observacoes" className="text-xs">Observações</Label>
              <Textarea id="solicitacao-exame-observacoes" aria-label="Orientações e preparo do exame" placeholder="Jejum, preparo..." value={examForm.observacoes} onChange={e => setExamForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} className="text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowExamSolicitation(false)} className="text-xs">Cancelar</Button>
            <Button size="sm" onClick={handleSolicitarExame} disabled={isRequestingExam} className="gap-1.5 text-xs">
              {isRequestingExam ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
              {isRequestingExam ? 'Solicitando…' : 'Solicitar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
