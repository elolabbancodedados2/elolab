import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, FileText, Plus, Save, CalendarCheck, FileDown, History,
  Heart, Thermometer, Activity, Scale, Ruler, Droplets,
  Stethoscope, Brain, Bone, Eye as EyeIcon, Pill, Paperclip,
  ClipboardList, AlertTriangle, User, Clock, ChevronDown, ChevronRight,
  Printer, BookOpen, ShieldCheck, FileCheck, X, Clipboard,
  Phone, Mail, Building2, CreditCard, Baby, Shield, Lock, PenLine,
  TestTube, ArrowRight, UserCheck, BadgeCheck, Share2, MessageCircle, ExternalLink,
  Hash, MapPin, Fingerprint, FileEdit, ScrollText,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
} from '@/components/clinical';
import { ProntuarioAdendos } from '@/components/clinical/ProntuarioAdendos';
import { usePacientes, useMedicos, useAgendamentos, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { exportToFHIR, exportToXML, downloadClinicalExport } from '@/lib/clinicalExport';
import { parseDateOnly, todayDateOnly } from '@/lib/dateOnly';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { useSearchParams } from 'react-router-dom';
import { logAudit } from '@/lib/auditTrail';

// ─── Types ─────────────────────────────────────────────────
interface PrescricaoForm {
  medicamento: string;
  dosagem: string;
  posologia: string;
  duracao: string;
  quantidade: string;
  observacoes: string;
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
  glasgow: string;
  dor: string;
}

const emptySinaisVitais: SinaisVitais = {
  pressao_sistolica: '', pressao_diastolica: '',
  frequencia_cardiaca: '', frequencia_respiratoria: '',
  temperatura: '', saturacao: '',
  peso: '', altura: '', imc: '',
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
  const hoje = new Date(), nasc = new Date(dn);
  let i = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) i--;
  return i;
}

function calcularIMC(peso: string, altura: string) {
  const p = parseFloat(peso), a = parseFloat(altura);
  if (!p || !a || a === 0) return '';
  const altM = a > 3 ? a / 100 : a;
  return (p / (altM * altM)).toFixed(1);
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
              <Label className={`text-[10px] font-semibold flex items-center gap-1 ${f.accent}`}>
                <Icon className="h-3 w-3" />{f.label}
              </Label>
              {f.dual ? (
                <div className="flex gap-1 items-center">
                  <Input placeholder="120" value={sinais.pressao_sistolica} onChange={e => update('pressao_sistolica', e.target.value)} className="h-7 text-xs px-2" disabled={disabled} />
                  <span className="text-muted-foreground text-xs font-bold">/</span>
                  <Input placeholder="80" value={sinais.pressao_diastolica} onChange={e => update('pressao_diastolica', e.target.value)} className="h-7 text-xs px-2" disabled={disabled} />
                </div>
              ) : (
                <Input placeholder={f.placeholder} value={(sinais as any)[f.field!] || ''} onChange={e => update(f.field!, e.target.value)} className="h-7 text-xs px-2" disabled={disabled} />
              )}
            </div>
          );
        })}
        <div className="rounded-xl border border-border/60 bg-card p-2.5 space-y-1">
          <Label className="text-[10px] font-semibold text-info">IMC</Label>
          <div className="h-7 flex items-center px-2 text-xs font-bold">
            {sinais.imc || '—'}
            {imcClass && <span className={`ml-1 text-[9px] ${imcClass.color}`}>({imcClass.label})</span>}
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
      <div className="rounded-2xl overflow-hidden border border-border/60 bg-card">
        <div className="bg-gradient-to-r from-primary/8 via-primary/4 to-transparent p-5">
          <div className="flex items-start gap-4">
            <PatientPhoto
              pacienteId={paciente.id}
              pacienteNome={paciente.nome}
              currentPhotoUrl={paciente.foto_url}
              size="lg"
              editable={false}
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-foreground truncate">
                {paciente.nome_social || paciente.nome}
              </h2>
              {paciente.nome_social && (
                <p className="text-[11px] text-muted-foreground">Civil: {paciente.nome}</p>
              )}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold px-2 py-0">
                  {paciente.data_nascimento ? `${idade} anos` : 'Idade N/I'}
                </Badge>
                {paciente.sexo && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {paciente.sexo === 'masculino' ? '♂ Masc' : paciente.sexo === 'feminino' ? '♀ Fem' : 'Outro'}
                  </Badge>
                )}
                {paciente.data_nascimento && (
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(paciente.data_nascimento + 'T12:00').toLocaleDateString('pt-BR')}
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
function ProntuarioAuditLog({ prontuarioId }: { prontuarioId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!prontuarioId) return;
    setLoading(true);
    Promise.all([
      (supabase as any).from('prontuario_acessos').select('*').eq('prontuario_id', prontuarioId)
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('audit_log').select('*').eq('record_id', prontuarioId).eq('collection', 'prontuarios')
        .order('timestamp', { ascending: false }).limit(20),
    ]).then(([acessos, audit]) => {
      const merged = [
        ...((acessos.data as any[]) || []).map(a => ({
          id: `a-${a.id}`, ts: a.created_at, action: a.acao,
          user_name: a.user_nome, user_crm: a.user_crm,
          justificativa: a.justificativa, source: 'cfm',
        })),
        ...((audit.data as any[]) || []).map(a => ({
          id: `l-${a.id}`, ts: a.timestamp, action: a.action,
          user_name: a.user_name, source: 'audit',
        })),
      ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
      setLogs(merged);
      setLoading(false);
    });
  }, [prontuarioId]);

  if (loading) return <Skeleton className="h-32" />;

  const actionLabel = (a: string) => ({
    create: 'Criação', update: 'Edição', access: 'Acesso',
    visualizacao: 'Visualização', edicao: 'Edição', assinatura: 'Assinatura',
    adendo: 'Adendo', sign: 'Assinatura', edit_request: 'Solicitou edição',
    exportacao: 'Exportação', impressao: 'Impressão',
  } as Record<string, string>)[a] || a;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Shield className="h-3.5 w-3.5" /> Trilha de Auditoria
      </h4>
      {logs.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Nenhum registro de auditoria</p>
      ) : (
        <div className="space-y-1.5">
          {logs.map((log: any) => (
            <div key={log.id} className="flex items-start gap-2.5 text-xs border-l-2 border-muted pl-3 py-1.5">
              <Lock className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">{actionLabel(log.action)}</Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {log.ts ? format(new Date(log.ts), "dd/MM/yy HH:mm", { locale: ptBR }) : '—'}
                  </span>
                </div>
                {log.user_name && (
                  <p className="text-[10px] text-muted-foreground">
                    por {log.user_name}{log.user_crm ? ` — CRM ${log.user_crm}` : ''}
                  </p>
                )}
                {log.justificativa && (
                  <p className="text-[10px] text-muted-foreground italic mt-0.5">{log.justificativa}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/40 rounded-lg p-2">
        <ShieldCheck className="h-3 w-3" />
        <span>LGPD • CFM nº 1.821/07 • Todos os acessos registrados</span>
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

  useEffect(() => {
    if (!pacienteId) return;
    setLoading(true);
    Promise.all([
      supabase.from('exames').select('id, tipo_exame, status, data_solicitacao').eq('paciente_id', pacienteId).order('data_solicitacao', { ascending: false }).limit(10),
      supabase.from('atestados').select('id, tipo, data_emissao, dias').eq('paciente_id', pacienteId).order('data_emissao', { ascending: false }).limit(10),
      supabase.from('encaminhamentos').select('id, especialidade_destino, status, urgencia').eq('paciente_id', pacienteId).order('data_encaminhamento', { ascending: false }).limit(10),
    ]).then(([ex, at, en]) => {
      setExames(ex.data || []); setAtestados(at.data || []); setEncaminhamentos(en.data || []);
      setLoading(false);
    });
  }, [pacienteId]);

  if (loading) return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>;

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
        {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
      </div>
      {badge && <Badge className={`text-[9px] px-1.5 py-0 ${badgeClass}`}>{badge}</Badge>}
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
function AnexosWrapper({ pacienteId, prontuarioId }: { pacienteId: string; prontuarioId: string }) {
  const [anexos, setAnexos] = useState<any[]>([]);
  const loadAnexos = useCallback(async () => {
    const { data } = await supabase.from('anexos_prontuario').select('*').eq('prontuario_id', prontuarioId).order('created_at', { ascending: false });
    setAnexos(data || []);
  }, [prontuarioId]);
  useEffect(() => { loadAnexos(); }, [loadAnexos]);
  return <AnexosProntuario pacienteId={pacienteId} prontuarioId={prontuarioId} anexos={anexos} onAnexoAdicionado={loadAnexos} onAnexoRemovido={loadAnexos} />;
}

// ═══════════════════════════════════════════════════════════
// ─── MAIN COMPONENT ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════
export default function Prontuarios() {
  const [dispensando, setDispensando] = useState(false);

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
      const { autoDispensarMedicamentos } = await import('@/lib/workflowAutomation');
      const r = await autoDispensarMedicamentos({
        medicamentos: itens,
        pacienteId: selectedPaciente?.id ?? '',
        pacienteNome: selectedPaciente?.nome ?? 'Paciente',
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

  const [searchParams] = useSearchParams();
  const routePacienteId = searchParams.get('paciente');
  const routeAgendamentoId = searchParams.get('agendamento');
  const routeOpenedRef = useRef(false);
  const routeKeyRef = useRef<string | null>(null);
  const [selectedPacienteId, setSelectedPacienteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProntuarioOpen, setIsProntuarioOpen] = useState(false);
  const [currentProntuario, setCurrentProntuario] = useState<Record<string, any>>({});
  const [prescricoes, setPrescricoes] = useState<PrescricaoForm[]>([]);
  const [showProtocols, setShowProtocols] = useState(false);
  const [showDischargeReport, setShowDischargeReport] = useState(false);
  const [sinaisVitais, setSinaisVitais] = useState<SinaisVitais>(emptySinaisVitais);
  const [isEditing, setIsEditing] = useState(false);
  const [autoSaveTime, setAutoSaveTime] = useState<string | null>(null);
  const [showExamSolicitation, setShowExamSolicitation] = useState(false);
  const [examForm, setExamForm] = useState({ tipo_exame: '', descricao: '', observacoes: '' });
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { profile: user } = useSupabaseAuth();

  const { data: pacientes = [], isLoading: loadingPacientes } = usePacientes();
  const { data: medicos = [] } = useMedicos();
  const { data: convenios = [] } = useSupabaseQuery<any>('convenios', { orderBy: { column: 'nome', ascending: true } });
  const { medicoId, isMedicoOnly } = useCurrentMedico();
  const [historicoEvolucoes, setHistoricoEvolucoes] = useState<any[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  useEffect(() => {
    if (!selectedPacienteId) { setHistoricoEvolucoes([]); return; }
    setLoadingHistorico(true);
    let query = supabase
      .from('prontuarios')
      .select('id, data, queixa_principal, historia_doenca_atual, exames_fisicos, hipotese_diagnostica, conduta, sinais_vitais, diagnostico_principal, plano_terapeutico, assinado, assinado_em, assinado_por, crm_assinante, medicos(nome, crm, especialidade)')
      .eq('paciente_id', selectedPacienteId)
      .order('data', { ascending: false })
      .limit(50);
    if (isMedicoOnly && medicoId) query = query.eq('medico_id', medicoId);
    query.then(({ data }) => { setHistoricoEvolucoes(data ?? []); setLoadingHistorico(false); });
  }, [selectedPacienteId, isMedicoOnly, medicoId]);

  // Filtra por paciente NO SERVIDOR. Antes esta query trazia a coleção inteira
  // de prontuários da clínica — o hook busca em blocos de 5.000 até o teto de
  // 20.000 — e a tela filtrava por `paciente_id` só depois, na memória. Abrir
  // um paciente baixava milhares de históricos clínicos de gente que não tinha
  // nada a ver com o atendimento em curso: lento, e dado sensível à toa no
  // navegador de uma máquina de recepção.
  const { data: prontuarios = [], isLoading: loadingProntuarios, refetch: refetchProntuarios } = useSupabaseQuery<Record<string, any>>('prontuarios', {
    orderBy: { column: 'data', ascending: false },
    enabled: !!selectedPacienteId,
    filters: [
      ...(selectedPacienteId ? [{ column: 'paciente_id', operator: 'eq', value: selectedPacienteId }] : []),
      ...(isMedicoOnly && medicoId ? [{ column: 'medico_id', operator: 'eq', value: medicoId }] : []),
    ],
  });

  const selectedPaciente = useMemo(() => pacientes.find(p => p.id === selectedPacienteId), [pacientes, selectedPacienteId]);

  const getConvenioNome = useCallback((convenioId: string | null) => {
    if (!convenioId) return 'Particular';
    const c = convenios.find((cv: any) => cv.id === convenioId);
    return c?.nome || 'Particular';
  }, [convenios]);

  const filteredPacientes = useMemo(() => {
    return pacientes.filter(p => pacienteCorresponde(p, searchTerm));
  }, [pacientes, searchTerm]);

  const pacienteProntuarios = useMemo(() => {
    if (!selectedPacienteId) return [];
    // A query já vem filtrada por paciente; o filtro local fica como rede de
    // segurança para o intervalo em que `selectedPacienteId` muda antes de a
    // nova resposta chegar.
    return prontuarios
      .filter(p => p.paciente_id === selectedPacienteId)
      .sort((a, b) => parseDateOnly(b.data)!.getTime() - parseDateOnly(a.data)!.getTime());
  }, [prontuarios, selectedPacienteId]);

  // ─── Handlers ────────────────────────────────────────────
  const handleNovoProntuario = () => {
    if (!selectedPacienteId) return false;
    if (isMedicoOnly && !medicoId) {
      toast.error('Usuário médico não vinculado', {
        description: 'Vincule esta conta ao cadastro do médico antes de abrir o prontuário.',
      });
      return false;
    }
    // Use linked medicoId, or fallback to first active medico (for admins)
    const resolvedMedicoId = medicoId || medicos.find(m => m.ativo !== false)?.id || '';
    if (!resolvedMedicoId) {
      toast.error('Erro', { description: 'Nenhum médico cadastrado no sistema.' });
      return false;
    }
    setCurrentProntuario({
      ...emptyProntuario,
      paciente_id: selectedPacienteId,
      medico_id: resolvedMedicoId,
      agendamento_id: routeAgendamentoId,
      data: format(new Date(), 'yyyy-MM-dd'),
      alergias_relatadas: selectedPaciente?.alergias?.join(', ') || '',
    });
    setSinaisVitais(emptySinaisVitais);
    setPrescricoes([]);
    setIsEditing(true);
    setIsProntuarioOpen(true);
    return true;
  };

  // A Fila envia paciente e agendamento. Abrimos a evolução existente ou
  // preparamos uma nova para o médico responsável.
  useEffect(() => {
    if (routeOpenedRef.current || !routePacienteId || loadingPacientes || loadingProntuarios) return;
    if (!pacientes.some(p => p.id === routePacienteId)) return;
    setSelectedPacienteId(routePacienteId);
  }, [routePacienteId, loadingPacientes, loadingProntuarios, pacientes]);

  const handleViewProntuario = async (prontuario: Record<string, any>) => {
    setCurrentProntuario(prontuario);
    setSinaisVitais({ ...emptySinaisVitais, ...(prontuario.sinais_vitais || {}) });
    const { data } = await supabase.from('prescricoes').select('*').eq('prontuario_id', prontuario.id);
    setPrescricoes((data || []).map((p: any) => ({
      medicamento: p.medicamento, dosagem: p.dosagem || '', posologia: p.posologia || '',
      duracao: p.duracao || '', quantidade: p.quantidade || '', observacoes: p.observacoes || '',
    })));
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
    const trilhaOk = await logAudit({
      action: 'access' as any,
      collection: 'prontuarios',
      recordId: prontuario.id,
      recordName: selectedPaciente?.nome || '',
      userId: user?.id || undefined,
      userName: user?.nome || undefined,
    });

    const { error: erroAcesso } = await (supabase as any).from('prontuario_acessos').insert({
      prontuario_id: prontuario.id,
      acao: 'visualizacao',
      user_nome: user?.nome || null,
    });

    if (!trilhaOk || erroAcesso) {
      console.error('[prontuário] registro de acesso falhou:', erroAcesso);
      toast.warning('O acesso a este prontuário não pôde ser registrado agora.', {
        description: 'O registro ficou na fila e será reenviado. Se persistir, avise o suporte — a trilha de acesso é exigida pela CFM 1.821/07.',
        duration: 8000,
      });
    }
  };

  useEffect(() => {
    const routeKey = `${routePacienteId || ''}:${routeAgendamentoId || ''}`;
    if (routeKeyRef.current !== routeKey) {
      routeKeyRef.current = routeKey;
      routeOpenedRef.current = false;
    }
  }, [routePacienteId, routeAgendamentoId]);

  useEffect(() => {
    if (routeOpenedRef.current || !routeAgendamentoId || selectedPacienteId !== routePacienteId || loadingProntuarios) return;
    const existing = pacienteProntuarios.find((p: any) => p.agendamento_id === routeAgendamentoId);
    if (existing) {
      routeOpenedRef.current = true;
      void handleViewProntuario(existing);
    } else if (handleNovoProntuario()) {
      routeOpenedRef.current = true;
    }
  }, [
    routeAgendamentoId,
    routePacienteId,
    selectedPacienteId,
    loadingProntuarios,
    pacienteProntuarios,
    handleViewProntuario,
    handleNovoProntuario,
  ]);

  const handleAddPrescricao = () => setPrescricoes([...prescricoes, { medicamento: '', dosagem: '', posologia: '', duracao: '', quantidade: '', observacoes: '' }]);
  const handleUpdatePrescricao = (i: number, field: keyof PrescricaoForm, value: string) => {
    const u = [...prescricoes]; u[i] = { ...u[i], [field]: value }; setPrescricoes(u);
  };
  const handleRemovePrescricao = (i: number) => setPrescricoes(prescricoes.filter((_, idx) => idx !== i));

  const isSigned = !!currentProntuario.assinado;
  const isReadOnly = (!!currentProntuario.id && !isEditing) || isSigned;

  const handleRequestEdit = async () => {
    if (isSigned) {
      toast.error('Prontuário assinado', {
        description: 'Registros assinados são imutáveis (CFM 1.821/07). Use "Adendos" para retificar ou complementar.',
      });
      return;
    }

    let auditado = false;
    try {
      await supabase.from('audit_log').insert({
        action: 'edit_request', collection: 'prontuarios', record_id: currentProntuario.id,
        record_name: `Edição — ${selectedPaciente?.nome || ''}`,
        user_id: user?.id || null, user_name: user?.nome || null,
        changes: { motivo: 'Edição solicitada pelo médico' },
      });
      const { error: acessoErr } = await (supabase as any).from('prontuario_acessos').insert({
        prontuario_id: currentProntuario.id,
        acao: 'edicao',
        user_nome: user?.nome || null,
        justificativa: 'Modo de edição ativado',
      });
      if (acessoErr) throw acessoErr;
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

  const updateField = (field: string, value: any) => setCurrentProntuario(prev => ({ ...prev, [field]: value }));

  // ─── Core save logic (used by manual save and auto-save) ───
  const performSave = async (silent = false): Promise<string | null> => {
    if (!currentProntuario.queixa_principal) {
      if (!silent) toast.error('Erro', { description: 'Preencha a queixa principal.' });
      return null;
    }
    if (isSigned) {
      if (!silent) toast.error('Prontuário assinado', {
        description: 'Registro imutável. Use "Adendos" para complementar ou retificar.',
      });
      return null;
    }
    try {
      const payload = {
        queixa_principal: currentProntuario.queixa_principal,
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
        const { error } = await supabase.from('prontuarios').update(payload).eq('id', currentProntuario.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('prontuarios').insert({
          ...payload, paciente_id: currentProntuario.paciente_id,
          medico_id: currentProntuario.medico_id,
          agendamento_id: currentProntuario.agendamento_id || null,
          data: currentProntuario.data,
          clinica_id: user?.clinica_id || null,
        }).select().single();
        if (error) throw error;
        prontuarioId = data.id;
        setCurrentProntuario(prev => ({ ...prev, id: prontuarioId }));
      }

      // ─── Save prescriptions (create + update) ───
      if (prontuarioId) {
        const validas = prescricoes.filter(p => p.medicamento);

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
              data_emissao: todayDateOnly(),
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
          for (const presc of validas) {
            // Casamento por nome aproximado pode acertar o medicamento errado.
            // Se houver mais de um candidato, não adivinhamos: registramos e
            // deixamos a baixa para o operador fazer manualmente.
            const { data: candidatos } = await supabase.from('estoque')
              .select('id, quantidade, nome')
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
            const qtd = parseInt(presc.quantidade) || 1;

            const { data: baixa, error: movErr } = await (supabase as any).rpc(
              'registrar_baixa_estoque',
              {
                p_item_id: estoqueItem.id,
                p_quantidade: qtd,
                p_prontuario_id: prontuarioId,
                p_usuario_id: user?.id || null,
                p_motivo: `Prescrição — ${selectedPaciente?.nome || 'paciente'}`,
              },
            );

            if (movErr) {
              // Baixa duplicada é tratada dentro do RPC como no-op. Qualquer
              // outro erro precisa aparecer, porque a transação inteira foi
              // desfeita e o saldo continua inalterado.
              toast.warning(`Estoque não foi baixado: ${estoqueItem.nome}`, {
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

      // ─── Audit log ───
      // Alteração de prontuário sem registro de autor é o que uma auditoria do
      // CFM procura. O `catch` vazio daqui nunca disparava (supabase-js devolve
      // `{ error }` em vez de lançar), então a falha era invisível.
      const trilhaOk = await logAudit({
        action: currentProntuario.id && !silent ? 'update' : 'create',
        collection: 'prontuarios',
        recordId: prontuarioId,
        recordName: selectedPaciente?.nome || '',
        userId: user?.id || undefined,
        userName: user?.nome || undefined,
      });

      // No autosave (`silent`) não interrompemos o médico a cada 60s: a fila de
      // reenvio cuida disso. No salvamento explícito, ele precisa saber.
      if (!trilhaOk && !silent) {
        toast.warning('A alteração foi salva, mas não foi registrada na auditoria.', {
          description: 'O registro ficou na fila de reenvio. Se persistir, avise o suporte.',
          duration: 8000,
        });
      }

      if (silent) {
        setAutoSaveTime(format(new Date(), 'HH:mm'));
      } else {
        refetchProntuarios();
        // Reload history
        const { data: hist } = await supabase.from('prontuarios')
          .select('id, data, queixa_principal, historia_doenca_atual, exames_fisicos, hipotese_diagnostica, conduta, sinais_vitais, diagnostico_principal, plano_terapeutico, assinado, assinado_em, assinado_por, crm_assinante, medicos(nome, crm, especialidade)')
          .eq('paciente_id', currentProntuario.paciente_id)
          .order('data', { ascending: false }).limit(50);
        setHistoricoEvolucoes(hist ?? []);
      }

      return prontuarioId;
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving prontuario:', error);
      if (!silent) toast.error('Erro', { description: 'Erro ao salvar prontuário.' });
      return null;
    }
  };

  const handleSave = async () => {
    const id = await performSave(false);
    if (id) {
      setIsProntuarioOpen(false);
      toast.success('Prontuário salvo', { description: 'Registro salvo com sucesso.' });
    }
  };

  // ─── Auto-save every 60s ───
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
    }, 60000);
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
  }, [isProntuarioOpen, isEditing]);

  // Reset auto-save time when dialog closes
  useEffect(() => {
    if (!isProntuarioOpen) setAutoSaveTime(null);
  }, [isProntuarioOpen]);

  // ─── Exam solicitation ───
  const handleSolicitarExame = async () => {
    if (!examForm.tipo_exame) {
      toast.error('Erro', { description: 'Informe o tipo do exame.' });
      return;
    }
    const resolvedMedicoId = medicoId || medicos.find(m => m.ativo !== false)?.id;
    if (!resolvedMedicoId || !selectedPacienteId) return;
    const { error } = await supabase.from('exames').insert({
      paciente_id: selectedPacienteId,
      medico_solicitante_id: resolvedMedicoId,
      tipo_exame: examForm.tipo_exame,
      descricao: examForm.descricao || null,
      observacoes: examForm.observacoes || null,
      status: 'solicitado',
      data_solicitacao: format(new Date(), 'yyyy-MM-dd'),
      clinica_id: user?.clinica_id || null,
    });
    if (!error) {
      toast.success('Exame solicitado', { description: `${examForm.tipo_exame} registrado.` });
      setExamForm({ tipo_exame: '', descricao: '', observacoes: '' });
      setShowExamSolicitation(false);
    } else {
      toast.error('Erro', { description: 'Erro ao solicitar exame.' });
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
      data: currentProntuario.data || format(new Date(), 'yyyy-MM-dd'),
      queixaPrincipal: currentProntuario.queixa_principal,
      hipoteseDiagnostica: currentProntuario.hipotese_diagnostica,
      conduta: currentProntuario.conduta,
    },
    prescricoes: prescricoes.filter(p => p.medicamento),
  });

  // ─── Loading state ───────────────────────────────────────
  if (loadingPacientes || loadingProntuarios) {
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

  // ═══════════════════════════════════════════════════════════
  // ─── RENDER ─────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Prontuário Eletrônico</h1>
            <p className="text-xs text-muted-foreground">Registro médico completo — LGPD • CFM</p>
          </div>
        </div>
        <Badge className="bg-success/10 text-success border-success/20 gap-1 text-[10px] rounded-full px-2.5 py-1">
          <ShieldCheck className="h-3 w-3" />Conforme LGPD
        </Badge>
      </div>

      {/* Main layout: patient list + content */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* ─── Patient List (Left column) ─── */}
        <div className="lg:col-span-3">
          <Card className="overflow-hidden border-border/50">
            <CardHeader className="pb-2 px-3 pt-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar paciente..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-240px)]">
                {filteredPacientes.map(pac => {
                  const isSelected = selectedPacienteId === pac.id;
                  return (
                    <motion.div
                      key={pac.id}
                      whileHover={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}
                      className={`px-3 py-2.5 cursor-pointer transition-all border-b border-border/30 ${
                        isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'
                      }`}
                      onClick={() => setSelectedPacienteId(pac.id)}
                    >
                      <div className="flex items-center gap-2.5">
                        <PatientPhoto pacienteId={pac.id} pacienteNome={pac.nome} currentPhotoUrl={pac.foto_url} size="sm" editable={false} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{(pac as any).nome_social || pac.nome}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {pac.data_nascimento ? `${calcularIdade(pac.data_nascimento)}a` : 'N/I'}
                            {pac.sexo && ` • ${pac.sexo === 'masculino' ? '♂' : '♀'}`}
                            {pac.cpf && ` • ${pac.cpf}`}
                          </p>
                        </div>
                        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />}
                      </div>
                      {pac.alergias && pac.alergias.length > 0 && (
                        <div className="mt-1.5">
                          <AllergyAlert alergias={pac.alergias} compact className="text-[9px]" />
                        </div>
                      )}
                    </motion.div>
                  );
                })}
                {filteredPacientes.length === 0 && (
                  <p className="text-center text-muted-foreground py-10 text-xs">Nenhum paciente encontrado</p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* ─── Patient File + Records (Right column) ─── */}
        <div className="lg:col-span-9 space-y-4">
          {!selectedPaciente ? (
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <FileText className="h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm">Selecione um paciente à esquerda</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Patient file card */}
              <FichaPaciente paciente={selectedPaciente} convenioNome={getConvenioNome(selectedPaciente.convenio_id)} />

              {/* Actions bar */}
              <div className="flex items-center gap-2">
                <Button onClick={handleNovoProntuario} size="sm" className="gap-1.5 rounded-xl">
                  <Plus className="h-3.5 w-3.5" />Novo Atendimento
                </Button>
                <span className="text-[10px] text-muted-foreground flex-1">
                  {pacienteProntuarios.length} evolução(ões) registrada(s)
                </span>
              </div>

              {/* Content tabs */}
              <Card className="border-border/50 overflow-hidden">
                <Tabs defaultValue="evolucoes" className="w-full">
                  <div className="border-b border-border/40 px-4 pt-3">
                    <TabsList className="bg-transparent h-auto p-0 gap-0">
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
                          className="gap-1 text-[11px] rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2"
                        >
                          <t.icon className="h-3 w-3" />{t.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  <div className="p-4">
                    <TabsContent value="evolucoes" className="mt-0">
                      {pacienteProntuarios.length === 0 ? (
                        <div className="flex flex-col items-center py-14 text-muted-foreground">
                          <FileText className="h-8 w-8 opacity-20 mb-2" />
                          <p className="text-xs">Nenhuma evolução registrada</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {pacienteProntuarios.map((p, idx) => (
                            <motion.div
                              key={p.id}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.02 }}
                              className="group border border-border/40 rounded-xl p-3.5 hover:border-primary/30 cursor-pointer transition-all hover:bg-primary/[0.02]"
                              onClick={() => handleViewProntuario(p)}
                            >
                              <div className="flex justify-between items-start">
                                <div className="space-y-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold px-1.5 py-0">
                                      {format(parseDateOnly(p.data)!, 'dd/MM/yyyy')}
                                    </Badge>
                                    {p.diagnostico_principal && (
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{p.diagnostico_principal}</Badge>
                                    )}
                                  </div>
                                  <p className="text-xs font-semibold text-foreground truncate">{p.queixa_principal}</p>
                                  {p.conduta && <p className="text-[11px] text-muted-foreground line-clamp-1">Conduta: {p.conduta}</p>}
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
                          Exporte dados clínicos em formatos interoperáveis (HL7 FHIR / XML CDA).
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="border rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">JSON</Badge>
                              <span className="text-xs font-bold">HL7 FHIR R4</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">Padrão internacional para interoperabilidade em saúde.</p>
                            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={() => {
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
                                  diagnostico_principal: p.diagnostico_principal, conduta: p.conduta,
                                  sinais_vitais: p.sinais_vitais, medico_nome: p.medicos?.nome, medico_crm: p.medicos?.crm,
                                })),
                              };
                              downloadClinicalExport(exportToFHIR(exportData), `prontuario-${selectedPaciente.nome.replace(/\s+/g, '-')}`, 'json');
                              toast.success('Exportado', { description: 'FHIR JSON baixado.' });
                            }}>
                              <FileDown className="h-3.5 w-3.5" />Exportar FHIR
                            </Button>
                          </div>
                          <div className="border rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">XML</Badge>
                              <span className="text-xs font-bold">CDA / HL7 v3</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">XML baseado no Clinical Document Architecture.</p>
                            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={() => {
                              const exportData = {
                                paciente: {
                                  id: selectedPaciente.id, nome: selectedPaciente.nome,
                                  nome_social: (selectedPaciente as any).nome_social,
                                  cpf: selectedPaciente.cpf || undefined, data_nascimento: selectedPaciente.data_nascimento || undefined,
                                  sexo: selectedPaciente.sexo || undefined, alergias: selectedPaciente.alergias || [],
                                },
                                prontuarios: historicoEvolucoes.map((p: any) => ({
                                  id: p.id, data: p.data, queixa_principal: p.queixa_principal,
                                  hipotese_diagnostica: p.hipotese_diagnostica, diagnostico_principal: p.diagnostico_principal,
                                  conduta: p.conduta, sinais_vitais: p.sinais_vitais,
                                  medico_nome: p.medicos?.nome, medico_crm: p.medicos?.crm,
                                })),
                              };
                              downloadClinicalExport(exportToXML(exportData), `prontuario-${selectedPaciente.nome.replace(/\s+/g, '-')}`, 'xml');
                              toast.success('Exportado', { description: 'XML CDA baixado.' });
                            }}>
                              <FileDown className="h-3.5 w-3.5" />Exportar XML
                            </Button>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" />Art. 18 LGPD — direito de portabilidade dos dados.
                        </p>
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ─── Prontuário Dialog ─────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Dialog open={isProntuarioOpen} onOpenChange={setIsProntuarioOpen}>
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
                        data: currentProntuario.data, queixaPrincipal: currentProntuario.queixa_principal,
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
                      prescricoes.filter(p => p.medicamento)
                    );
                  };
                  const fn = `prontuario-${selectedPaciente?.nome?.replace(/\s+/g, '-') || 'paciente'}`;
                  return (
                    <>
                      {/* `buildPDF()` agora é assíncrono: o jsPDF só é baixado
                          quando alguém clica, em vez de vir junto com a tela. */}
                      <Button variant="outline" size="sm" onClick={async () => openPDF(await buildPDF())} className="gap-1 text-xs h-7"><ExternalLink className="h-3 w-3" />Visualizar</Button>
                      <Button variant="outline" size="sm" onClick={async () => downloadPDF(await buildPDF(), fn)} className="gap-1 text-xs h-7"><Printer className="h-3 w-3" />PDF</Button>
                      <Button variant="outline" size="sm" onClick={async () => {
                        sharePDFWhatsApp(await buildPDF(), fn, selectedPaciente?.telefone);
                        toast.info('WhatsApp', { description: 'PDF baixado! Cole na conversa.' });
                      }} className="gap-1 text-xs h-7 text-success border-success/30 hover:bg-success/5">
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
              <Badge className="bg-primary/10 text-primary border-primary/20 gap-1 font-bold text-[10px]">
                <User className="h-2.5 w-2.5" />{selectedPaciente.nome}
              </Badge>
              <span className="text-muted-foreground">{selectedPaciente.data_nascimento ? `${calcularIdade(selectedPaciente.data_nascimento)}a` : 'N/I'}</span>
              {selectedPaciente.cpf && <span className="text-muted-foreground">• {selectedPaciente.cpf}</span>}
              <span className="text-muted-foreground">• {getConvenioNome(selectedPaciente.convenio_id)}</span>
              <Badge className="ml-auto bg-success/10 text-success border-success/20 text-[9px] rounded-full px-2">
                <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />LGPD
              </Badge>
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
                  ? `Assinado digitalmente — imutável (CFM 1.821/07)${currentProntuario.assinado_em ? ` em ${format(new Date(currentProntuario.assinado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}` : ''}`
                  : 'Somente leitura — CFM nº 1.821/07'}
              </span>
              {!isSigned && (
                <Button variant="outline" size="sm" onClick={handleRequestEdit} className="h-6 text-[10px] gap-1 border-warning/40 text-warning hover:bg-warning/10">
                  <PenLine className="h-3 w-3" />Solicitar Edição
                </Button>
              )}
            </motion.div>
          )}

          {/* Scrollable content */}
          <ScrollArea className="flex-1 pr-4">
            <fieldset disabled={isReadOnly} className="contents">
              <Tabs defaultValue="anamnese" className="w-full">
                <TabsList className="grid w-full grid-cols-9 mb-3 h-auto p-0.5 bg-muted/40 rounded-xl">
                  {[
                    { val: 'anamnese', icon: ClipboardList, label: 'Anamnese' },
                    { val: 'exame', icon: Stethoscope, label: 'Exame' },
                    { val: 'diagnostico', icon: BookOpen, label: 'Diagnóstico' },
                    { val: 'conduta', icon: FileCheck, label: 'Conduta' },
                    { val: 'prescricao', icon: Pill, label: 'Prescrição' },
                    { val: 'anexos', icon: Paperclip, label: 'Anexos' },
                    { val: 'historico', icon: History, label: 'Histórico' },
            { val: 'adendos', icon: ScrollText, label: 'Adendos' },
                    { val: 'auditoria', icon: Shield, label: 'Auditoria' },
                  ].map(t => (
                    <TabsTrigger key={t.val} value={t.val} className="text-[10px] gap-1 rounded-lg py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      <t.icon className="h-3 w-3" />{t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* ─── Anamnese ─── */}
                <TabsContent value="anamnese" className="space-y-4 pt-1">
                  {!currentProntuario.id && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
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
                          <Button key={t.label} variant="outline" size="sm" className="text-[10px] h-6 gap-1 px-2" onClick={() => {
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
                    <Textarea placeholder="Queixa principal..." value={currentProntuario.queixa_principal || ''} onChange={e => updateField('queixa_principal', e.target.value)} rows={2} />
                  </Section>
                  <Section icon={FileText} title="História da Doença Atual (HDA)">
                    <Textarea placeholder="Evolução cronológica, fatores de melhora/piora..." value={currentProntuario.historia_doenca_atual || ''} onChange={e => updateField('historia_doenca_atual', e.target.value)} rows={4} />
                  </Section>
                  <Section icon={History} title="Doenças Pregressas (HDP)" collapsible>
                    <Textarea placeholder="Doenças prévias, cirurgias, internações..." value={currentProntuario.historia_patologica_pregressa || ''} onChange={e => updateField('historia_patologica_pregressa', e.target.value)} rows={3} />
                  </Section>
                  <Section icon={ShieldCheck} title="Alergias e Medicamentos">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5 text-destructive" />Alergias</Label>
                        <Textarea placeholder="Medicamentos, alimentos..." value={currentProntuario.alergias_relatadas || ''} onChange={e => updateField('alergias_relatadas', e.target.value)} rows={2} className="border-destructive/30" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] flex items-center gap-1"><Pill className="h-2.5 w-2.5" />Em uso</Label>
                        <Textarea placeholder="Medicamentos em uso..." value={currentProntuario.medicamentos_em_uso || ''} onChange={e => updateField('medicamentos_em_uso', e.target.value)} rows={2} />
                      </div>
                    </div>
                  </Section>
                  <Section icon={User} title="História Familiar" collapsible>
                    <Textarea placeholder="DM, HAS, câncer, cardiopatias..." value={currentProntuario.historia_familiar || ''} onChange={e => updateField('historia_familiar', e.target.value)} rows={2} />
                  </Section>
                  <Section icon={Clipboard} title="História Social" collapsible>
                    <Textarea placeholder="Tabagismo, etilismo, profissão..." value={currentProntuario.historia_social || ''} onChange={e => updateField('historia_social', e.target.value)} rows={2} />
                  </Section>
                  <Section icon={ClipboardList} title="Revisão de Sistemas" collapsible>
                    <Textarea placeholder="Cardiovascular, respiratório, GI, neuro..." value={currentProntuario.revisao_sistemas || ''} onChange={e => updateField('revisao_sistemas', e.target.value)} rows={3} />
                  </Section>
                </TabsContent>

                {/* ─── Exame Físico ─── */}
                <TabsContent value="exame" className="space-y-4 pt-1">
                  <VitalSignsInput sinais={sinaisVitais} onChange={setSinaisVitais} />
                  <Separator />
                  <Section icon={Stethoscope} title="Exame Físico Geral">
                    <Textarea placeholder="Estado geral, consciência, hidratação..." value={currentProntuario.exames_fisicos || ''} onChange={e => updateField('exames_fisicos', e.target.value)} rows={3} />
                  </Section>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Section icon={EyeIcon} title="Cabeça e Pescoço" collapsible>
                      <Textarea placeholder="Olhos, ouvidos, tireoide..." value={currentProntuario.exame_cabeca_pescoco || ''} onChange={e => updateField('exame_cabeca_pescoco', e.target.value)} rows={3} />
                    </Section>
                    <Section icon={Heart} title="Tórax" collapsible>
                      <Textarea placeholder="Ausculta cardíaca/pulmonar..." value={currentProntuario.exame_torax || ''} onChange={e => updateField('exame_torax', e.target.value)} rows={3} />
                    </Section>
                    <Section icon={Activity} title="Abdome" collapsible>
                      <Textarea placeholder="Inspeção, palpação..." value={currentProntuario.exame_abdomen || ''} onChange={e => updateField('exame_abdomen', e.target.value)} rows={3} />
                    </Section>
                    <Section icon={Bone} title="Membros" collapsible>
                      <Textarea placeholder="Edema, pulsos, mobilidade..." value={currentProntuario.exame_membros || ''} onChange={e => updateField('exame_membros', e.target.value)} rows={3} />
                    </Section>
                    <Section icon={Brain} title="Neurológico" collapsible>
                      <Textarea placeholder="Força, sensibilidade, reflexos..." value={currentProntuario.exame_neurologico || ''} onChange={e => updateField('exame_neurologico', e.target.value)} rows={3} />
                    </Section>
                    <Section icon={Stethoscope} title="Pele / Tegumentar" collapsible>
                      <Textarea placeholder="Lesões, coloração, turgor..." value={currentProntuario.exame_pele || ''} onChange={e => updateField('exame_pele', e.target.value)} rows={3} />
                    </Section>
                  </div>
                </TabsContent>

                {/* ─── Diagnóstico ─── */}
                <TabsContent value="diagnostico" className="space-y-4 pt-1">
                  <Section icon={BookOpen} title="Hipótese Diagnóstica (CID-10)">
                    <Cid10Search value={currentProntuario.hipotese_diagnostica || ''} onChange={v => updateField('hipotese_diagnostica', v)} />
                  </Section>
                  <Section icon={FileCheck} title="Diagnóstico Principal">
                    <Input placeholder="Diagnóstico principal" value={currentProntuario.diagnostico_principal || ''} onChange={e => updateField('diagnostico_principal', e.target.value)} />
                  </Section>
                  <Section icon={ClipboardList} title="Diagnósticos Secundários" collapsible>
                    <Textarea placeholder="Comorbidades, um por linha" value={(currentProntuario.diagnosticos_secundarios || []).join('\n')} onChange={e => updateField('diagnosticos_secundarios', e.target.value.split('\n').filter(Boolean))} rows={3} />
                  </Section>
                </TabsContent>

                {/* ─── Conduta ─── */}
                <TabsContent value="conduta" className="space-y-4 pt-1">
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => setShowProtocols(true)} className="text-[10px] h-6 gap-1">
                      <CalendarCheck className="h-3 w-3" />Aplicar Protocolo Clínico
                    </Button>
                  </div>
                  <Section icon={FileCheck} title="Conduta">
                    <Textarea placeholder="Conduta terapêutica, exames, encaminhamentos..." value={currentProntuario.conduta || ''} onChange={e => updateField('conduta', e.target.value)} rows={4} />
                  </Section>
                  <Section icon={ClipboardList} title="Plano Terapêutico">
                    <Textarea placeholder="Plano detalhado..." value={currentProntuario.plano_terapeutico || ''} onChange={e => updateField('plano_terapeutico', e.target.value)} rows={3} />
                  </Section>
                  <Section icon={User} title="Orientações ao Paciente">
                    <Textarea placeholder="Cuidados, retorno, sinais de alarme..." value={currentProntuario.orientacoes_paciente || ''} onChange={e => updateField('orientacoes_paciente', e.target.value)} rows={3} />
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
                    <Textarea placeholder="Anotações internas (não imprime)..." value={currentProntuario.observacoes_internas || ''} onChange={e => updateField('observacoes_internas', e.target.value)} rows={2} className="border-dashed" />
                  </Section>
                </TabsContent>

                {/* ─── Prescrição ─── */}
                <TabsContent value="prescricao" className="space-y-3 pt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Pill className="h-3.5 w-3.5" />Receituário Digital
                    </span>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => setShowProtocols(true)} className="text-[10px] h-6 gap-1"><CalendarCheck className="h-3 w-3" />Protocolos</Button>
                      <Button variant="outline" size="sm" onClick={handleAddPrescricao} className="text-[10px] h-6 gap-1"><Plus className="h-3 w-3" />Adicionar</Button>
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
                      <p className="text-[10px] text-muted-foreground">
                        Entregou o medicamento aqui na clínica? Dê baixa no estoque.
                      </p>
                      <Button
                        variant="outline" size="sm" className="h-6 shrink-0 gap-1 text-[10px]"
                        disabled={dispensando}
                        onClick={dispensarNaClinica}
                      >
                        <Pill className="h-3 w-3" />
                        {dispensando ? 'Baixando…' : 'Dispensar na clínica'}
                      </Button>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 bg-muted/40 rounded-lg p-2">
                    <BadgeCheck className="h-3 w-3" />
                    Prescrição sai sem assinatura digital — imprima e assine, ou assine o PDF no gov.br
                  </p>

                  {/* Drug Interaction Checker */}
                  {prescricoes.filter(p => p.medicamento).length > 0 && (
                    <DrugInteractionChecker
                      medicamentos={prescricoes.filter(p => p.medicamento).map(p => p.medicamento)}
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
                            <div className="col-span-2 md:col-span-3">
                              <Input placeholder="Nome do medicamento *" value={presc.medicamento} onChange={e => handleUpdatePrescricao(i, 'medicamento', e.target.value)} className="text-xs h-8" />
                            </div>
                            <Input placeholder="Dosagem" value={presc.dosagem} onChange={e => handleUpdatePrescricao(i, 'dosagem', e.target.value)} className="text-xs h-8" />
                            <Input placeholder="Posologia" value={presc.posologia} onChange={e => handleUpdatePrescricao(i, 'posologia', e.target.value)} className="text-xs h-8" />
                            <Input placeholder="Duração" value={presc.duracao} onChange={e => handleUpdatePrescricao(i, 'duracao', e.target.value)} className="text-xs h-8" />
                            <Input placeholder="Quantidade" value={presc.quantidade} onChange={e => handleUpdatePrescricao(i, 'quantidade', e.target.value)} className="text-xs h-8" />
                            <div className="col-span-2">
                              <Input placeholder="Observações" value={presc.observacoes} onChange={e => handleUpdatePrescricao(i, 'observacoes', e.target.value)} className="text-xs h-8" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* ─── Anexos ─── */}
                <TabsContent value="anexos" className="pt-1">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 bg-muted/40 rounded-lg p-2 mb-3">
                    <Paperclip className="h-3 w-3" />Upload de PDFs, imagens e exames — LGPD.
                  </p>
                  {currentProntuario.id && selectedPacienteId ? (
                    <AnexosWrapper pacienteId={selectedPacienteId} prontuarioId={currentProntuario.id} />
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
                          onClick={() => {
                            setIsProntuarioOpen(false);
                            setTimeout(() => handleViewProntuario(ev), 150);
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold px-1.5 py-0">
                                {format(parseDateOnly(ev.data)!, 'dd/MM/yyyy', { locale: ptBR })}
                              </Badge>
                              {ev.medicos && <span className="text-[10px] text-muted-foreground">Dr(a). {ev.medicos.nome || ev.medicos.crm}</span>}
                              {ev.diagnostico_principal && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{ev.diagnostico_principal}</Badge>}
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" />
                          </div>
                          {ev.queixa_principal && <p className="text-xs"><strong>QP:</strong> <span className="text-muted-foreground">{ev.queixa_principal}</span></p>}
                          {ev.conduta && <p className="text-xs"><strong>Conduta:</strong> <span className="text-muted-foreground line-clamp-2">{ev.conduta}</span></p>}
                          {ev.sinais_vitais && Object.keys(ev.sinais_vitais).some(k => ev.sinais_vitais[k]) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {ev.sinais_vitais.pressao_sistolica && <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[9px] px-1.5 py-0">PA: {ev.sinais_vitais.pressao_sistolica}/{ev.sinais_vitais.pressao_diastolica}</Badge>}
                              {ev.sinais_vitais.frequencia_cardiaca && <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[9px] px-1.5 py-0">FC: {ev.sinais_vitais.frequencia_cardiaca}</Badge>}
                              {ev.sinais_vitais.temperatura && <Badge className="bg-warning/10 text-warning border-warning/20 text-[9px] px-1.5 py-0">T: {ev.sinais_vitais.temperatura}°C</Badge>}
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
                      medicoId={currentProntuario.medico_id}
                      medicoNome={medicos.find((m: any) => m.id === currentProntuario.medico_id)?.nome || user?.nome}
                      crm={medicos.find((m: any) => m.id === currentProntuario.medico_id)?.crm}
                    />
                  ) : (
                    <div className="flex flex-col items-center py-10 text-muted-foreground">
                      <ScrollText className="h-8 w-8 opacity-20 mb-2" />
                      <p className="text-xs">Salve o prontuário para registrar adendos</p>
                    </div>
                  )}
                </TabsContent>

                {/* ─── Auditoria ─── */}
                <TabsContent value="auditoria" className="pt-1">
                  {currentProntuario.id ? (
                    <ProntuarioAuditLog prontuarioId={currentProntuario.id} />
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 bg-muted/40 rounded-lg p-2">
                        <ShieldCheck className="h-3 w-3" />LGPD • CFM — Acessos registrados automaticamente.
                      </p>
                      <div className="space-y-1.5 text-xs">
                        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
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
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0">{r.role}</Badge>
                            <span className="text-muted-foreground text-[11px]">{r.desc}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground text-center py-4">Salve para ver a trilha de auditoria</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </fieldset>
          </ScrollArea>

          {/* Footer */}
          <DialogFooter className="flex-shrink-0 pt-3 border-t border-border/40">
            <div className="flex items-center gap-2 w-full justify-between">
              <div className="flex items-center gap-3 flex-1">
                {currentProntuario.id && (
                  <DigitalSignature
                    documentId={currentProntuario.id}
                    documentType="prontuario"
                    signerName={medicos.find((m: any) => m.id === currentProntuario.medico_id)?.nome || user?.nome || 'Médico'}
                    signerCRM={medicos.find((m: any) => m.id === currentProntuario.medico_id)?.crm}
                    compact
                    alreadySigned={isSigned}
                    signedAt={currentProntuario.assinado_em}
                    onSigned={() => {
                      setCurrentProntuario(prev => ({ ...prev, assinado: true, assinado_em: new Date().toISOString() }));
                      setIsEditing(false);
                      refetchProntuarios();
                    }}
                  />
                )}
                {autoSaveTime && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />Salvo às {autoSaveTime}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowExamSolicitation(true)} className="rounded-xl text-xs gap-1">
                  <TestTube className="h-3.5 w-3.5" />Solicitar Exame
                </Button>
                <Button variant="outline" onClick={() => setIsProntuarioOpen(false)} size="sm" className="rounded-xl text-xs">Cancelar</Button>
                {!isReadOnly && (
                  <Button onClick={handleSave} size="sm" className="gap-1.5 rounded-xl text-xs"><Save className="h-3.5 w-3.5" />Salvar Prontuário</Button>
                )}
              </div>
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
              <Label className="text-xs">Tipo do Exame *</Label>
              <Input placeholder="Ex: Hemograma, Glicemia, TSH..." value={examForm.tipo_exame} onChange={e => setExamForm(f => ({ ...f, tipo_exame: e.target.value }))} className="text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Input placeholder="Detalhes adicionais" value={examForm.descricao} onChange={e => setExamForm(f => ({ ...f, descricao: e.target.value }))} className="text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observações</Label>
              <Textarea placeholder="Jejum, preparo..." value={examForm.observacoes} onChange={e => setExamForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} className="text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowExamSolicitation(false)} className="text-xs">Cancelar</Button>
            <Button size="sm" onClick={handleSolicitarExame} className="gap-1.5 text-xs"><TestTube className="h-3.5 w-3.5" />Solicitar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
