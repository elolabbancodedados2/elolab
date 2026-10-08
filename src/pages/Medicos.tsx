import { nomeMedico, validateCPF } from '@/lib/formatters';
import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Pencil, Stethoscope, Phone, Mail, BadgeCheck, Award,
  FileText, Clock, User, Upload, Image, Calendar, ClipboardList, Pill,
  ChevronRight, X, Activity, Users, Eye, Filter, Heart, ShieldCheck,
  ExternalLink, Copy, Send, UserX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { LoadingButton } from '@/components/ui/loading-button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useMedicos } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { StorageAvatarImage, StorageImg } from '@/components/StorageImage';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MedicoAvailabilityManager } from '@/components/medicos/MedicoAvailabilityManager';
import { normalizarTexto } from '@/lib/buscaPaciente';
import { todaySaoPauloDateOnly, parseDateOnly } from '@/lib/dateOnly';

const UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA',
   'PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
 ];
 
 const TIPOS_REGISTRO = [
   'CRM', 'CRP', 'CRO', 'CREFITO', 'COREN', 'CRMV', 'CRBM', 'CRN', 'CRF', 'CREF', 'CRTR', 'CRP', 'CRFA'
];

const INTERVALOS = [10, 15, 20, 25, 30, 40, 45, 50, 60];

const ESPECIALIDADES_SUGESTOES = [
  'Clínico Geral', 'Cardiologia', 'Dermatologia', 'Endocrinologia', 'Gastroenterologia',
  'Geriatria', 'Ginecologia e Obstetrícia', 'Infectologia', 'Medicina do Trabalho',
  'Nefrologia', 'Neurologia', 'Oftalmologia', 'Oncologia', 'Ortopedia e Traumatologia',
  'Otorrinolaringologia', 'Pediatria', 'Pneumologia', 'Psiquiatria', 'Radiologia',
  'Reumatologia', 'Urologia', 'Cirurgia Geral', 'Cirurgia Plástica', 'Anestesiologia',
  'Hematologia', 'Medicina de Família', 'Nutrologia', 'Proctologia', 'Mastologia',
];

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

interface FormData {
   nome: string; email: string; crm: string; tipo_registro: string; crm_uf: string; cpf: string;
  data_nascimento: string; rqe: string; cns: string; especialidade: string; telefone: string;
  intervalo_consulta: number; ativo: boolean; foto_url: string; carimbo_url: string;
}

const initialFormData: FormData = {
   nome: '', email: '', crm: '', tipo_registro: 'CRM', crm_uf: 'SP', cpf: '', data_nascimento: '', rqe: '', cns: '',
  especialidade: '', telefone: '', intervalo_consulta: 30, ativo: true,
  foto_url: '', carimbo_url: '',
};

// ─── Especialidade Combobox ───
function EspecialidadeCombobox({ value, onChange, especialidadesExtras }: { value: string; onChange: (v: string) => void; especialidadesExtras: string[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const allEspecialidades = useMemo(() => {
    const merged = new Set([...ESPECIALIDADES_SUGESTOES, ...especialidadesExtras]);
    return Array.from(merged).sort();
  }, [especialidadesExtras]);

  const filtered = useMemo(() => {
    if (!search) return allEspecialidades;
    const term = search.toLowerCase();
    return allEspecialidades.filter(e => e.toLowerCase().includes(term));
  }, [search, allEspecialidades]);

  const handleSelect = (esp: string) => {
    onChange(esp);
    setSearch('');
    setOpen(false);
  };

  return (
    <div className="mt-4 space-y-1.5">
      <Label className="text-xs">Especialidade</Label>
      <div className="relative">
        <Input
          ref={inputRef}
          value={open ? search : value}
          onChange={e => {
            setSearch(e.target.value);
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => { setOpen(true); setSearch(value); }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Digite ou selecione uma especialidade"
          autoComplete="off"
        />
        {value && !open && (
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => { onChange(''); setSearch(''); inputRef.current?.focus(); }}>
            <X className="h-4 w-4" />
          </button>
        )}
        <AnimatePresence>
          {open && filtered.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border bg-popover shadow-lg"
            >
              {filtered.map(esp => (
                <button key={esp} type="button"
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${esp === value ? 'bg-primary/10 text-primary font-medium' : 'text-popover-foreground'}`}
                  onMouseDown={e => { e.preventDefault(); handleSelect(esp); }}
                >
                  {esp}
                </button>
              ))}
              {search && !filtered.some(e => e.toLowerCase() === search.toLowerCase()) && (
                <button type="button"
                  className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-accent transition-colors border-t"
                  onMouseDown={e => { e.preventDefault(); handleSelect(search); }}
                >
                  + Criar "{search}"
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Doctor Profile Panel ───
function MedicoProfilePanel({ medico, onClose, onEdit }: { medico: any; onClose: () => void; onEdit: () => void }) {
  const navigate = useNavigate();
  const { user, profile } = useSupabaseAuth();

  const agendamentosQuery = useQuery({
    queryKey: ['medico-agendamentos', user?.id ?? null, profile?.clinica_id ?? null, medico.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('agendamentos')
        .select('*, pacientes(nome, telefone)')
        .eq('clinica_id', profile!.clinica_id!).eq('medico_id', medico.id)
        .order('data', { ascending: false }).order('hora_inicio', { ascending: true }).limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!profile?.clinica_id,
  });

  const prontuariosQuery = useQuery({
    queryKey: ['medico-prontuarios', user?.id ?? null, profile?.clinica_id ?? null, medico.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('prontuarios')
        .select('id, data, queixa_principal, diagnostico_principal, pacientes(nome)')
        .eq('clinica_id', profile!.clinica_id!).eq('medico_id', medico.id).order('data', { ascending: false }).limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!profile?.clinica_id,
  });

  const prescricoesQuery = useQuery({
    queryKey: ['medico-prescricoes', user?.id ?? null, profile?.clinica_id ?? null, medico.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('prescricoes')
        .select('id, medicamento, dosagem, data_emissao, pacientes(nome)')
        .eq('clinica_id', profile!.clinica_id!).eq('medico_id', medico.id).order('data_emissao', { ascending: false }).limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!profile?.clinica_id,
  });

  const atestadosQuery = useQuery({
    queryKey: ['medico-atestados', user?.id ?? null, profile?.clinica_id ?? null, medico.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('atestados')
        .select('id, tipo, dias, data_emissao, motivo, pacientes(nome)')
        .eq('clinica_id', profile!.clinica_id!).eq('medico_id', medico.id).order('data_emissao', { ascending: false }).limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!profile?.clinica_id,
  });

  const agendamentos = agendamentosQuery.data ?? [];
  const prontuarios = prontuariosQuery.data ?? [];
  const prescricoes = prescricoesQuery.data ?? [];
  const atestados = atestadosQuery.data ?? [];

  const today = todaySaoPauloDateOnly();
  const agendamentosHoje = agendamentos.filter((a: any) => a.data === today);
  const agendamentosFuturos = agendamentos.filter((a: any) => a.data > today);
  const totalPacientes = new Set(agendamentos.map((a: any) => a.paciente_id)).size;

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      agendado: 'bg-info/10 text-info border-info/20',
      confirmado: 'bg-success/10 text-success border-success/20',
      finalizado: 'bg-muted text-muted-foreground',
      cancelado: 'bg-destructive/10 text-destructive border-destructive/20',
      em_atendimento: 'bg-warning/10 text-warning border-warning/20',
      aguardando_pagamento: 'bg-warning/10 text-warning border-warning/20',
      pago: 'bg-success/10 text-success border-success/20',
      atendimento_finalizado: 'bg-muted text-muted-foreground',
      aguardando_pagamento_adicional: 'bg-destructive/10 text-destructive border-destructive/20',
    };
    return map[s] || 'bg-muted text-muted-foreground';
  };

  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 border-b">
          <SheetHeader className="mb-4"><SheetTitle className="sr-only">Perfil do Médico</SheetTitle></SheetHeader>
          <div className="flex items-start gap-4">
            <Avatar className="h-20 w-20 ring-4 ring-background shadow-xl">
              {medico.foto_url && <StorageAvatarImage bucket="patient-photos" path={medico.foto_url} alt={medico.nome} />}
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                {(medico.nome || medico.crm).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-foreground truncate">{nomeMedico(medico.nome || medico.crm)}</h2>
              <p className="text-sm text-muted-foreground">{medico.especialidade || 'Clínico Geral'}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                 <Badge variant="outline" className="text-[11px] gap-1">
                   <BadgeCheck className="h-3 w-3" /> {medico.tipo_registro || 'CRM'} {medico.crm}/{medico.crm_uf}
                 </Badge>
                {medico.rqe && <Badge variant="outline" className="text-[11px] gap-1"><Award className="h-3 w-3" /> RQE {medico.rqe}</Badge>}
                <Badge className={medico.ativo ? 'bg-success/10 text-success border-success/20 text-[11px]' : 'bg-muted text-muted-foreground text-[11px]'}>
                  {medico.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-4 text-sm">
            {medico.telefone && <a href={`tel:${medico.telefone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"><Phone className="h-3.5 w-3.5" /> {medico.telefone}</a>}
            {medico.email && <a href={`mailto:${medico.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"><Mail className="h-3.5 w-3.5" /> {medico.email}</a>}
            <span className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {medico.intervalo_consulta ?? 30}min/consulta</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onEdit}><Pencil className="h-3 w-3" /> Editar</Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => navigate('/agenda')}><Calendar className="h-3 w-3" /> Agenda</Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => navigate('/prontuarios')}><ClipboardList className="h-3 w-3" /> Prontuários</Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => navigate('/prescricoes')}><Pill className="h-3 w-3" /> Prescrições</Button>
          </div>

          {/* Portal do Médico */}
          <div className="mt-4 p-3 rounded-xl border border-primary/20 bg-primary/5">
            <div className="flex items-center gap-2 mb-2">
              <ExternalLink className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Portal do Médico</p>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2.5">
              Ao fazer login, o médico é redirecionado automaticamente para seu portal exclusivo com dashboard pessoal, agenda e prontuários.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={async () => {
                  const portalUrl = `${window.location.origin}/auth`;
                  try {
                    if (!navigator.clipboard?.writeText) throw new Error('Clipboard indisponível');
                    await navigator.clipboard.writeText(portalUrl);
                    toast.success('Link de acesso copiado!', { description: portalUrl });
                  } catch {
                    toast.error('Não foi possível copiar o link automaticamente', {
                      description: `Copie o endereço do portal: ${portalUrl}`,
                      duration: 10000,
                    });
                  }
                }}
              >
                <Copy className="h-3 w-3" /> Copiar Link
              </Button>
              {medico.email && (
                <Button
                  size="sm"
                  variant="default"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    const portalUrl = `${window.location.origin}/auth`;
                    const subject = encodeURIComponent('Seu acesso ao Portal do Médico — EloLab');
                    const body = encodeURIComponent(
                      `Olá ${nomeMedico(medico.nome || '')},\n\n` +
                      `Você possui acesso ao Portal do Médico na plataforma EloLab.\n\n` +
                      `Para acessar seu portal exclusivo, entre pelo link abaixo com suas credenciais:\n\n` +
                      `🔗 ${portalUrl}\n\n` +
                      `Ao fazer login, você será direcionado automaticamente para seu dashboard pessoal, onde poderá:\n` +
                      `• Consultar sua agenda do dia\n` +
                      `• Acessar prontuários dos seus pacientes\n` +
                      `• Emitir prescrições e atestados\n` +
                      `• Visualizar suas estatísticas de atendimento\n\n` +
                      `Caso ainda não tenha recebido suas credenciais, entre em contato com a administração da clínica.\n\n` +
                      `Atenciosamente,\nEquipe EloLab`
                    );
                    window.open(`mailto:${medico.email}?subject=${subject}&body=${body}`, '_blank');
                    toast.info('Cliente de e-mail aberto', {
                      description: `Revise e envie a mensagem para ${medico.email}`,
                    });
                  }}
                >
                  <Send className="h-3 w-3" /> Abrir no E-mail
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-3 border-b bg-muted/30">
          {[
            { label: 'Hoje', value: agendamentosQuery.isError ? '—' : agendamentosHoje.length, icon: Activity, color: 'text-primary' },
            { label: 'Futuros', value: agendamentosQuery.isError ? '—' : agendamentosFuturos.length, icon: Calendar, color: 'text-info' },
            { label: 'Pacientes', value: agendamentosQuery.isError ? '—' : totalPacientes, icon: Users, color: 'text-success' },
            { label: 'Prontuários', value: prontuariosQuery.isError ? '—' : prontuarios.length, icon: ClipboardList, color: 'text-warning' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <s.icon className={`h-4 w-4 mx-auto mb-0.5 ${s.color}`} />
              <p className="text-lg font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="agenda" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 mt-3 grid grid-cols-2 sm:grid-cols-4 h-auto sm:h-9">
            <TabsTrigger value="agenda" className="text-[11px] gap-1"><Calendar className="h-3 w-3" /> Agenda</TabsTrigger>
            <TabsTrigger value="prontuarios" className="text-[11px] gap-1"><ClipboardList className="h-3 w-3" /> Prontuários</TabsTrigger>
            <TabsTrigger value="prescricoes" className="text-[11px] gap-1"><Pill className="h-3 w-3" /> Prescrições</TabsTrigger>
            <TabsTrigger value="atestados" className="text-[11px] gap-1"><FileText className="h-3 w-3" /> Atestados</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 px-4 pb-4">
            <TabsContent value="agenda" className="mt-3 space-y-2">
              {agendamentosQuery.isError && <ErrorState compact title="Não foi possível carregar a agenda deste médico" error={agendamentosQuery.error} onRetry={() => { void agendamentosQuery.refetch(); }} />}
              {agendamentosQuery.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Carregando agendamentos…</p>}
              {agendamentosHoje.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-primary mb-2">📅 Hoje — {format(parseDateOnly(today)!, "dd 'de' MMMM", { locale: ptBR })}</p>
                  {agendamentosHoje.map((ag: any) => (
                    <motion.div key={ag.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-3 p-2.5 rounded-lg border bg-card mb-1.5 hover:shadow-sm transition-shadow">
                      <div className="text-center min-w-[48px]"><p className="text-sm font-bold text-foreground">{ag.hora_inicio?.slice(0, 5)}</p></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{(ag as any).pacientes?.nome || 'Paciente'}</p>
                        <p className="text-[11px] text-muted-foreground">{ag.tipo || 'Consulta'}</p>
                      </div>
                      <Badge className={`text-[10px] ${statusColor(ag.status)}`}>{ag.status}</Badge>
                    </motion.div>
                  ))}
                </div>
              )}
              {agendamentosFuturos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Próximos agendamentos</p>
                  {agendamentosFuturos.slice(0, 15).map((ag: any) => (
                    <div key={ag.id} className="flex items-center gap-3 p-2 rounded-lg border bg-card/50 mb-1.5">
                      <div className="text-center min-w-[60px]">
                        <p className="text-[11px] text-muted-foreground">{format(parseISO(ag.data), "dd/MM", { locale: ptBR })}</p>
                        <p className="text-xs font-semibold">{ag.hora_inicio?.slice(0, 5)}</p>
                      </div>
                      <div className="flex-1 min-w-0"><p className="text-sm truncate">{(ag as any).pacientes?.nome || 'Paciente'}</p></div>
                      <Badge variant="outline" className="text-[10px]">{ag.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
              {!agendamentosQuery.isLoading && !agendamentosQuery.isError && agendamentos.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhum agendamento encontrado</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="prontuarios" className="mt-3 space-y-2">
              {prontuariosQuery.isError && <ErrorState compact title="Não foi possível carregar os prontuários deste médico" error={prontuariosQuery.error} onRetry={() => { void prontuariosQuery.refetch(); }} />}
              {prontuariosQuery.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Carregando prontuários…</p>}
              {prontuarios.map((p: any) => (
                <div key={p.id} className="p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{(p as any).pacientes?.nome || 'Paciente'}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{format(parseISO(p.data), "dd/MM/yyyy", { locale: ptBR })}</p>
                    </div>
                  </div>
                  {p.queixa_principal && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2"><span className="font-medium">QP:</span> {p.queixa_principal}</p>}
                  {p.diagnostico_principal && <Badge variant="secondary" className="text-[10px] mt-1.5">{p.diagnostico_principal}</Badge>}
                </div>
              ))}
              {!prontuariosQuery.isLoading && !prontuariosQuery.isError && prontuarios.length === 0 && <div className="text-center py-8 text-muted-foreground"><ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" /><p className="text-sm">Nenhum prontuário registrado</p></div>}
            </TabsContent>

            <TabsContent value="prescricoes" className="mt-3 space-y-2">
              {prescricoesQuery.isError && <ErrorState compact title="Não foi possível carregar as prescrições deste médico" error={prescricoesQuery.error} onRetry={() => { void prescricoesQuery.refetch(); }} />}
              {prescricoesQuery.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Carregando prescrições…</p>}
              {prescricoes.map((rx: any) => (
                <div key={rx.id} className="p-3 rounded-lg border bg-card">
                  <div className="flex justify-between items-start">
                    <div><p className="text-sm font-medium">{rx.medicamento}</p><p className="text-[11px] text-muted-foreground">{(rx as any).pacientes?.nome}</p></div>
                    <p className="text-[11px] text-muted-foreground">{rx.data_emissao ? format(parseISO(rx.data_emissao), 'dd/MM/yy') : '-'}</p>
                  </div>
                  {rx.dosagem && <p className="text-xs text-muted-foreground mt-1">{rx.dosagem}</p>}
                </div>
              ))}
              {!prescricoesQuery.isLoading && !prescricoesQuery.isError && prescricoes.length === 0 && <div className="text-center py-8 text-muted-foreground"><Pill className="h-8 w-8 mx-auto mb-2 opacity-40" /><p className="text-sm">Nenhuma prescrição emitida</p></div>}
            </TabsContent>

            <TabsContent value="atestados" className="mt-3 space-y-2">
              {atestadosQuery.isError && <ErrorState compact title="Não foi possível carregar os atestados deste médico" error={atestadosQuery.error} onRetry={() => { void atestadosQuery.refetch(); }} />}
              {atestadosQuery.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Carregando atestados…</p>}
              {atestados.map((at: any) => (
                <div key={at.id} className="p-3 rounded-lg border bg-card">
                  <div className="flex justify-between items-start">
                    <div><p className="text-sm font-medium capitalize">{at.tipo || 'Atestado'}</p><p className="text-[11px] text-muted-foreground">{(at as any).pacientes?.nome}</p></div>
                    <Badge variant="secondary" className="text-[10px]">{at.dias || '-'} dia(s)</Badge>
                  </div>
                  {at.motivo && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{at.motivo}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{at.data_emissao ? format(parseISO(at.data_emissao), 'dd/MM/yyyy') : '-'}</p>
                </div>
              ))}
              {!atestadosQuery.isLoading && !atestadosQuery.isError && atestados.length === 0 && <div className="text-center py-8 text-muted-foreground"><FileText className="h-8 w-8 mx-auto mb-2 opacity-40" /><p className="text-sm">Nenhum atestado emitido</p></div>}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ───
export default function Medicos() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEspecialidade, setFilterEspecialidade] = useState('todas');
  const [filterStatus, setFilterStatus] = useState<'todos' | 'ativo' | 'inativo'>('todos');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewingMedico, setViewingMedico] = useState<any | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingCarimbo, setUploadingCarimbo] = useState(false);
  const saveLock = useRef(false);

  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const medicosQuery = useMedicos();
  const medicos = medicosQuery.data ?? [];
  const { isLoading } = medicosQuery;

  const especialidades = useMemo(() => {
    const set = new Set(medicos.map((m: any) => m.especialidade).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [medicos]);

  const filteredMedicos = useMemo(() =>
    medicos.filter((m: any) => {
      const term = normalizarTexto(searchTerm.trim());
      const matchSearch = !term || normalizarTexto(`${m.nome || ''} ${m.crm || ''} ${m.especialidade || ''} ${m.email || ''}`).includes(term);
      const matchEsp = filterEspecialidade === 'todas' || m.especialidade === filterEspecialidade;
      const matchStatus = filterStatus === 'todos' || (filterStatus === 'ativo' ? m.ativo : !m.ativo);
      return matchSearch && matchEsp && matchStatus;
    }),
    [medicos, searchTerm, filterEspecialidade, filterStatus]
  );

  const totalAtivos = medicos.filter((m: any) => m.ativo).length;
  const totalInativos = medicos.filter((m: any) => !m.ativo).length;

  const handleOpenDialog = (medico?: any) => {
    if (medico) {
      setEditingId(medico.id);
      setEditingUpdatedAt(medico.updated_at ?? null);
      setFormData({
         nome: medico.nome || '', email: medico.email || '', crm: medico.crm, tipo_registro: medico.tipo_registro || 'CRM',
        crm_uf: medico.crm_uf || 'SP', cpf: medico.cpf || '', data_nascimento: medico.data_nascimento || '', rqe: medico.rqe || '',
        cns: medico.cns || '', especialidade: medico.especialidade || '',
        telefone: medico.telefone || '', intervalo_consulta: medico.intervalo_consulta ?? 30,
        ativo: medico.ativo, foto_url: medico.foto_url || '', carimbo_url: medico.carimbo_url || '',
      });
    } else {
      setEditingId(null);
      setEditingUpdatedAt(null);
      setFormData(initialFormData);
    }
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (id: string) => { setSelectedId(id); setIsDeleteOpen(true); };

  const handleUpload = async (file: File, bucket: string, field: 'foto_url' | 'carimbo_url') => {
    const setter = field === 'foto_url' ? setUploadingPhoto : setUploadingCarimbo;
    setter(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `medicos/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      // Guarda o caminho: o bucket é privado e o link assinado expira.
      setFormData(prev => ({ ...prev, [field]: path }));
      toast.success('Arquivo enviado!');
    } catch (err: any) {
      toast.error(err.message || 'Erro no upload');
    } finally { setter(false); }
  };

  const handleSave = async () => {
    if (saveLock.current) return;
    if (uploadingPhoto || uploadingCarimbo) {
      toast.info('Aguarde o envio da foto ou do carimbo antes de salvar o médico.');
      return;
    }
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Recarregue a página e tente novamente.'); return; }
     if (!formData.crm) { toast.error('O número do registro profissional é obrigatório.'); return; }
    if (!formData.nome.trim()) { toast.error('Nome é obrigatório.'); return; }
     if (formData.tipo_registro === 'CRM' && formData.crm && !/^\d{4,10}$/.test(formData.crm.replace(/\D/g, ''))) {
       toast.error('O CRM deve conter entre 4 e 10 dígitos.'); return;
    }
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      toast.error('E-mail inválido.'); return;
    }
    if (formData.cpf) {
      if (!validateCPF(formData.cpf)) {
        toast.error('CPF inválido.'); return;
      }
    }
    if (formData.telefone) {
      const telDigits = formData.telefone.replace(/\D/g, '');
      if (telDigits.length < 10 || telDigits.length > 11) {
        toast.error('Telefone deve ter 10 ou 11 dígitos.'); return;
      }
    }
    const registroNormalizado = formData.crm.trim().toUpperCase().replace(/\s+/g, '');
    const ufNormalizada = formData.crm_uf.trim().toUpperCase();
    const registroDuplicado = medicos.find((medico: any) =>
      medico.id !== editingId
      && String(medico.tipo_registro || 'CRM').toUpperCase() === formData.tipo_registro.toUpperCase()
      && String(medico.crm || '').trim().toUpperCase().replace(/\s+/g, '') === registroNormalizado
      && String(medico.crm_uf || '').trim().toUpperCase() === ufNormalizada
    );
    if (registroDuplicado) {
      toast.error('Já existe um profissional com esse registro nesta clínica.', {
        description: `${registroDuplicado.nome || registroDuplicado.crm} · ${formData.tipo_registro} ${formData.crm}/${ufNormalizada}`,
      });
      return;
    }
    if (medicosQuery.isError || medicosQuery.isLoading) {
      toast.error('Não foi possível conferir os registros profissionais da clínica.', {
        description: 'Atualize a lista de médicos antes de salvar para evitar cadastros duplicados.',
      });
      return;
    }
    saveLock.current = true;
    setIsSubmitting(true);
    try {
      const email = formData.email.trim().toLocaleLowerCase('pt-BR');
      const nome = formData.nome.trim();
      const payload = {
        nome: nome || null, email: email || null, crm: formData.crm.trim(), tipo_registro: formData.tipo_registro,
        crm_uf: formData.crm_uf || null, cpf: formData.cpf || null, data_nascimento: formData.data_nascimento || null, rqe: formData.rqe || null,
        cns: formData.cns || null, especialidade: formData.especialidade || null,
        telefone: formData.telefone || null, intervalo_consulta: formData.intervalo_consulta,
        ativo: formData.ativo, foto_url: formData.foto_url || null, carimbo_url: formData.carimbo_url || null,
        ...(!editingId ? { clinica_id: profile.clinica_id } : {}),
      };

      if (editingId) {
        let query = supabase.from('medicos').update(payload)
          .eq('id', editingId).eq('clinica_id', profile.clinica_id);
        query = editingUpdatedAt ? query.eq('updated_at', editingUpdatedAt) : query.is('updated_at', null);
        const { data, error } = await query.select('id').maybeSingle();
        if (error) throw error;
        if (!data) {
          await queryClient.invalidateQueries({ queryKey: ['medicos'] });
          throw new Error('Este cadastro foi alterado por outra pessoa ou removido. Atualize a lista e confira os dados antes de salvar novamente.');
        }
        toast.success('Médico atualizado com sucesso!');
      } else {
        const { data: newMedico, error } = await supabase.from('medicos').insert(payload).select().single();
        if (error) throw error;
        toast.success('Médico cadastrado com sucesso!');
        if (email && newMedico) {
          try {
            const { data: funcData, error: funcError } = await supabase.from('funcionarios')
              .insert({ nome, email, cargo: 'Médico', departamento: formData.especialidade || 'Clínico', ativo: formData.ativo, clinica_id: profile?.clinica_id || null, pending_roles: ['medico'] } as any)
              .select().single();
            if (funcError || !funcData) {
              toast.info('Médico cadastrado, mas o vínculo de acesso não foi criado. Revise a aba Funcionários antes de convidar.', {
                description: funcError?.message,
              });
            } else {
              if (!formData.ativo) {
                toast.info('Médico cadastrado como inativo. O convite não foi enviado.', {
                  description: 'Ative o profissional na equipe antes de liberar o acesso ao sistema.',
                });
              } else {
                // invite-employee é o caminho único de convite. O antigo
                // send-employee-invitation gravava em outra tabela, com outro
                // aceite, e travava quando a pessoa já tinha conta.
                const { data: inviteData, error: inviteError } = await supabase.functions.invoke('invite-employee', {
                  body: { email, nome, roles: ['medico'] },
                });
                if (inviteError) {
                  toast.info('Médico cadastrado, mas o convite não pôde ser enviado. O vínculo está disponível na aba Funcionários.', { description: inviteError.message });
                } else if (inviteData?.success === false || inviteData?.error) {
                  toast.info('Médico cadastrado, mas o convite não pôde ser enviado. O vínculo está disponível na aba Funcionários.', { description: inviteData?.error });
                } else if (inviteData?.emailStatus === 'sent') {
                  toast.success(`Convite enviado por e-mail para ${email}.`);
                } else {
                  toast.info('Médico cadastrado e convite criado, mas o e-mail não foi enviado.', {
                    description: 'Acesse a lista de convites para copiar o link e compartilhar.',
                  });
                }
              }
            }
          } catch (inviteFlowError: any) {
            toast.info('Médico cadastrado, mas o acesso não foi preparado. Revise a aba Funcionários para concluir o convite.', {
              description: inviteFlowError?.message,
            });
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: ['medicos'] });
      queryClient.invalidateQueries({ queryKey: ['funcionarios-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['convites-list'] });
      setIsDialogOpen(false);
    } catch (error: any) {
      if (error?.code === '23505' && error?.constraint === 'medicos_registro_clinica_unico') {
        toast.error('Já existe um profissional com esse registro nesta clínica.');
      } else {
        toast.error(error.message || 'Erro ao salvar médico');
      }
    } finally {
      saveLock.current = false;
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    setIsDeleting(true);
    try {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const { data, error } = await supabase.from('medicos').update({ ativo: false })
        .eq('id', selectedId).eq('clinica_id', profile.clinica_id).eq('ativo', true).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('O médico já foi inativado ou não pertence à clínica atual. Atualize a lista.');
      toast.success('Médico inativado. O histórico e os vínculos foram preservados.');
      queryClient.invalidateQueries({ queryKey: ['medicos'] });
    } catch (error: any) {
      toast.error(error.message || 'Erro ao excluir médico');
    } finally { setIsDeleting(false); setIsDeleteOpen(false); }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  if (medicosQuery.isError) {
    return <ErrorState title="Não foi possível carregar o corpo clínico" error={medicosQuery.error} onRetry={() => void medicosQuery.refetch()} />;
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground flex items-center gap-2">
              <Stethoscope className="h-8 w-8 text-primary" /> Corpo Clínico
            </h1>
            <p className="text-muted-foreground mt-1">Gerencie médicos, credenciais e produtividade</p>
          </div>
          <Button onClick={() => handleOpenDialog()} className="gap-2" size="lg">
            <Plus className="h-4 w-4" /> Novo Médico
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: medicos.length, icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'Ativos', value: totalAtivos, icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
            { label: 'Inativos', value: totalInativos, icon: X, color: 'text-muted-foreground', bg: 'bg-muted' },
            { label: 'Especialidades', value: especialidades.length, icon: Heart, color: 'text-rose-500', bg: 'bg-rose-500/10' },
          ].map(s => (
            <Card key={s.label} className="border-border/40">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, CRM, especialidade ou e-mail..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10" />
          </div>
          <Select value={filterEspecialidade} onValueChange={setFilterEspecialidade}>
            <SelectTrigger className="w-full sm:w-48">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Especialidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas especialidades</SelectItem>
              {especialidades.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="inativo">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results count */}
        {searchTerm || filterEspecialidade !== 'todas' || filterStatus !== 'todos' ? (
          <p className="text-sm text-muted-foreground">
            {filteredMedicos.length} médico(s) encontrado(s)
            {(searchTerm || filterEspecialidade !== 'todas' || filterStatus !== 'todos') && (
              <Button variant="link" size="sm" className="ml-2 text-xs h-auto p-0" onClick={() => { setSearchTerm(''); setFilterEspecialidade('todas'); setFilterStatus('todos'); }}>
                Limpar filtros
              </Button>
            )}
          </p>
        ) : null}

        {/* Doctor Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredMedicos.map((medico: any, i: number) => (
              <motion.div key={medico.id}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.03 }}
                layout>
                <Card className={`group hover:shadow-lg transition-all duration-300 cursor-pointer hover:border-primary/30 ${!medico.ativo ? 'opacity-60' : ''}`}
                  onClick={() => setViewingMedico(medico)}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-16 w-16 ring-2 ring-primary/10 group-hover:ring-primary/30 transition-all shadow-md">
                        {medico.foto_url && <StorageAvatarImage bucket="patient-photos" path={medico.foto_url} alt={medico.nome} />}
                        <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-bold text-lg">
                          {(medico.nome || medico.crm).slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground truncate text-base">{nomeMedico(medico.nome || medico.crm)}</h3>
                            <p className="text-sm text-muted-foreground">{medico.especialidade || 'Clínico Geral'}</p>
                          </div>
                          <Badge className={`text-[10px] shrink-0 ${medico.ativo ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground'}`}>
                            {medico.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          <Badge variant="outline" className="text-[10px] gap-1 font-mono">
                             <BadgeCheck className="h-2.5 w-2.5" /> {medico.tipo_registro || 'CRM'} {medico.crm}/{medico.crm_uf}
                          </Badge>
                          {medico.rqe && <Badge variant="outline" className="text-[10px] font-mono">RQE {medico.rqe}</Badge>}
                        </div>
                      </div>
                    </div>

                    {/* Info row */}
                    <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/40 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {medico.intervalo_consulta ?? 30}min</span>
                      {medico.telefone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {medico.telefone}</span>}
                      {medico.email && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1 truncate max-w-[120px]"><Mail className="h-3 w-3 shrink-0" /> {medico.email}</span>
                          </TooltipTrigger>
                          <TooltipContent>{medico.email}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between mt-3">
                      <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-primary hover:text-primary"
                        onClick={(e) => { e.stopPropagation(); setViewingMedico(medico); }}>
                        <Eye className="h-3.5 w-3.5" /> Ver Perfil
                      </Button>
                      <div className="flex gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button aria-label={`Editar médico ${medico.nome}`} size="icon" variant="ghost" className="h-8 w-8"
                              onClick={(e) => { e.stopPropagation(); handleOpenDialog(medico); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar</TooltipContent>
                        </Tooltip>
                        {medico.ativo && <Tooltip>
                          <TooltipTrigger asChild>
                            <Button aria-label={`Inativar médico ${medico.nome}`} size="icon" variant="ghost" className="h-8 w-8 hover:bg-destructive/10"
                              onClick={(e) => { e.stopPropagation(); handleDeleteClick(medico.id); }}>
                              <UserX className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Inativar</TooltipContent>
                        </Tooltip>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filteredMedicos.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="text-center py-16">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Stethoscope className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Nenhum médico encontrado</h3>
              <p className="text-muted-foreground text-sm mt-1 max-w-sm mx-auto">
                {searchTerm || filterEspecialidade !== 'todas' || filterStatus !== 'todos'
                  ? 'Tente ajustar ou limpar os filtros para ver outros profissionais.'
                  : 'Cadastre o primeiro médico para começar.'}
              </p>
              {!searchTerm && filterEspecialidade === 'todas' && filterStatus === 'todos' && (
                <Button onClick={() => handleOpenDialog()} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" /> Cadastrar Médico
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Profile Panel */}
        {viewingMedico && (
          <MedicoProfilePanel medico={viewingMedico} onClose={() => setViewingMedico(null)}
            onEdit={() => { handleOpenDialog(viewingMedico); setViewingMedico(null); }} />
        )}

        {/* ─── Form Dialog ─── */}
        <Dialog open={isDialogOpen} onOpenChange={open => {
          if (open || (!isSubmitting && !uploadingPhoto && !uploadingCarimbo)) setIsDialogOpen(open);
        }}>
          <DialogContent className="max-w-2xl max-h-[95vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-primary" />
                {editingId ? 'Editar Médico' : 'Novo Médico'}
              </DialogTitle>
            </DialogHeader>

            <fieldset disabled={isSubmitting} className="contents">
            <div className="flex-1 overflow-y-auto space-y-5 pr-2">
              {/* Foto + Status side by side */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 ring-2 ring-primary/10">
                    {formData.foto_url && <StorageAvatarImage bucket="patient-photos" path={formData.foto_url} />}
                    <AvatarFallback className="bg-primary/10 text-primary text-lg">{(formData.nome || '??').slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Foto de Perfil</Label>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1 text-xs" disabled={uploadingPhoto}
                        onClick={() => document.getElementById('foto-upload')?.click()}>
                        <Upload className="h-3 w-3" />{uploadingPhoto ? 'Enviando...' : 'Upload'}
                      </Button>
                      {formData.foto_url && <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => setFormData(p => ({ ...p, foto_url: '' }))}>Remover</Button>}
                    </div>
                    <input id="foto-upload" type="file" accept="image/*" className="hidden"
                      onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], 'patient-photos', 'foto_url')} />
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <Label className="text-sm">Ativo</Label>
                  <Switch checked={formData.ativo} onCheckedChange={checked => setFormData(p => ({ ...p, ativo: checked }))} />
                </div>
              </div>

              <Separator />

              {/* Dados Pessoais */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><User className="h-4 w-4" /> Dados Pessoais</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome Completo <span className="text-destructive">*</span></Label>
                    <Input value={formData.nome} onChange={e => setFormData(p => ({ ...p, nome: e.target.value }))} placeholder="João da Silva" 
                      className={!formData.nome && formData.crm ? 'border-destructive/50' : ''} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">CPF</Label>
                    <Input value={formData.cpf} 
                      onChange={e => setFormData(p => ({ ...p, cpf: formatCpf(e.target.value) }))} 
                      placeholder="000.000.000-00" maxLength={14} />
                    {formData.cpf && formData.cpf.replace(/\D/g, '').length > 0 && formData.cpf.replace(/\D/g, '').length < 11 && (
                      <p className="text-[10px] text-amber-500">CPF incompleto</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Data de nascimento (necessária para Memed)</Label>
                    <Input type="date" value={formData.data_nascimento} onChange={e => setFormData(p => ({ ...p, data_nascimento: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">E-mail</Label>
                    <Input type="email" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="medico@email.com"
                      className={formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) ? 'border-destructive/50' : ''} />
                    {!editingId && formData.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) && (
                      <p className={`text-[10px] flex items-center gap-1 ${formData.ativo ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                        <Mail className="h-3 w-3" />
                        {formData.ativo ? 'Convite de acesso será enviado automaticamente' : 'Médico inativo: convite de acesso não será enviado'}
                      </p>
                    )}
                    {formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) && (
                      <p className="text-[10px] text-destructive">E-mail inválido</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Telefone</Label>
                    <Input value={formData.telefone} 
                      onChange={e => setFormData(p => ({ ...p, telefone: formatPhone(e.target.value) }))} 
                      placeholder="(11) 99999-9999" maxLength={15} />
                  </div>
                </div>
              </div>

              <Separator />

               {/* Registro Profissional */}
               <div>
                 <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><BadgeCheck className="h-4 w-4" /> Registro Profissional</h4>
                 <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                   <div className="space-y-1.5">
                     <Label className="text-xs">Tipo <span className="text-destructive">*</span></Label>
                     <Select value={formData.tipo_registro} onValueChange={v => setFormData(p => ({ ...p, tipo_registro: v }))}>
                       <SelectTrigger><SelectValue /></SelectTrigger>
                       <SelectContent>{TIPOS_REGISTRO.map(tipo => <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>)}</SelectContent>
                     </Select>
                   </div>
                   <div className="space-y-1.5">
                     <Label className="text-xs">Número <span className="text-destructive">*</span></Label>
                     <Input value={formData.crm} 
                       onChange={e => setFormData(p => ({ ...p, crm: e.target.value.replace(/\D/g, '').slice(0, 10) }))} 
                       placeholder="123456"
                       className={!formData.crm && formData.nome ? 'border-destructive/50' : ''} />
                     {formData.tipo_registro === 'CRM' && formData.crm && (formData.crm.length < 4 || formData.crm.length > 10) && (
                       <p className="text-[10px] text-amber-500">4 a 10 dígitos</p>
                     )}
                   </div>
                   <div className="space-y-1.5">
                     <Label className="text-xs">UF <span className="text-destructive">*</span></Label>
                     <Select value={formData.crm_uf} onValueChange={v => setFormData(p => ({ ...p, crm_uf: v }))}>
                       <SelectTrigger><SelectValue /></SelectTrigger>
                       <SelectContent>{UFS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                     </Select>
                   </div>
                   <div className="space-y-1.5">
                    <Label className="text-xs">RQE</Label>
                    <Input value={formData.rqe} onChange={e => setFormData(p => ({ ...p, rqe: e.target.value }))} placeholder="12345" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">CNS</Label>
                    <Input value={formData.cns} onChange={e => setFormData(p => ({ ...p, cns: e.target.value }))} placeholder="Cartão Nacional" />
                  </div>
                </div>

                {/* Especialidade with suggestions */}
                <EspecialidadeCombobox 
                  value={formData.especialidade}
                  onChange={(v) => setFormData(p => ({ ...p, especialidade: v }))}
                  especialidadesExtras={especialidades}
                />
              </div>

              <Separator />

              {/* Agenda */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><Clock className="h-4 w-4" /> Configurações de Agenda</h4>
                <div className="space-y-1.5">
                  <Label className="text-xs">Intervalo Padrão de Consulta</Label>
                  <Select value={String(formData.intervalo_consulta)} onValueChange={v => setFormData(p => ({ ...p, intervalo_consulta: Number(v) }))}>
                    <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>{INTERVALOS.map(i => <SelectItem key={i} value={String(i)}>{i} minutos</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              {/* Horários de Disponibilidade */}
              {editingId && (
                <>
                  <Separator />
                  <MedicoAvailabilityManager medico_id={editingId} medico_nome={formData.nome} />
                </>
              )}

              <Separator />

              {/* Carimbo */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><FileText className="h-4 w-4" /> Carimbo / Assinatura Digital</h4>
                <div className="flex items-center gap-4">
                  {formData.carimbo_url ? (
                    <StorageImg bucket="patient-photos" path={formData.carimbo_url} alt="Carimbo" className="h-16 border rounded-lg p-1 bg-background" />
                  ) : (
                    <div className="h-16 w-32 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground"><Image className="h-5 w-5" /></div>
                  )}
                  <div className="space-y-1">
                    <Button variant="outline" size="sm" className="gap-1 text-xs" disabled={uploadingCarimbo}
                      onClick={() => document.getElementById('carimbo-upload')?.click()}>
                      <Upload className="h-3 w-3" />{uploadingCarimbo ? 'Enviando...' : 'Upload Carimbo'}
                    </Button>
                    {formData.carimbo_url && <Button variant="ghost" size="sm" className="text-xs text-destructive block" onClick={() => setFormData(p => ({ ...p, carimbo_url: '' }))}>Remover</Button>}
                    <p className="text-[10px] text-muted-foreground">Imagem do carimbo/assinatura para documentos</p>
                  </div>
                  <input id="carimbo-upload" type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], 'patient-photos', 'carimbo_url')} />
                </div>
              </div>
            </div>
            </fieldset>

            <DialogFooter className="flex-shrink-0 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting || uploadingPhoto || uploadingCarimbo}>Cancelar</Button>
              <LoadingButton onClick={handleSave} disabled={uploadingPhoto || uploadingCarimbo} isLoading={isSubmitting} loadingText="Salvando...">{editingId ? 'Salvar Alterações' : 'Cadastrar Médico'}</LoadingButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Inativar médico</AlertDialogTitle>
              <AlertDialogDescription>O médico deixará de aparecer como opção para novos atendimentos. O cadastro e o histórico de agenda, prontuários e prescrições serão preservados. Esta ação não revoga o acesso ao sistema; ajuste as permissões na aba Funcionários. Você poderá reativá-lo depois.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground" disabled={isDeleting}>
                {isDeleting ? 'Inativando...' : 'Inativar médico'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
