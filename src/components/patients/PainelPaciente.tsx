import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Edit, Eye, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PatientPhoto } from '@/components/clinical';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/formatters';
import { formatWithDatePreference } from '@/lib/datePreference';
import { saldoDevedor } from '@/lib/liberacaoAtendimento';
import { linkWhatsApp } from '@/lib/whatsapp';
import { parseDateOnly } from '@/lib/dateOnly';

// Painel lateral do protótipo aprovado em 30/10/2026: resumo do paciente sem sair da lista.
interface Props {
  paciente: any;
  idade: number;
  convenio: string;
  podeEditar: boolean;
  onView: (paciente: any) => void;
  onEdit: (paciente: any) => void;
}

const SITUACAO: Record<string, string> = {
  agendado: 'Agendada',
  confirmado: 'Confirmada',
  aguardando: 'Aguardando',
  em_atendimento: 'Em atendimento',
  finalizado: 'Realizada',
  concluido: 'Realizada',
  faltou: 'Faltou',
  cancelado: 'Cancelada',
};

function cpfMascarado(cpf: string | null | undefined) {
  const digitos = String(cpf ?? '').replace(/\D/g, '');
  return digitos.length === 11 ? `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**` : null;
}

export function PainelPaciente({ paciente, idade, convenio, podeEditar, onView, onEdit }: Props) {
  const navigate = useNavigate();
  const alergias: string[] = Array.isArray(paciente.alergias) ? paciente.alergias.filter(Boolean) : [];
  const cpf = cpfMascarado(paciente.cpf);
  const whatsapp = linkWhatsApp(paciente.telefone, `Olá, ${String(paciente.nome_social || paciente.nome || '').split(' ')[0]}! Aqui é da clínica.`);
  const linhas: Array<[string, string | null]> = [
    ['Convênio', convenio],
    ['Telefone', paciente.telefone || null],
    ['E-mail', paciente.email || null],
    ['CPF', cpf],
  ];

  // Mesma conta de saldo do extrato e da trava de pagamento; perfil sem acesso ao financeiro vê "—".
  const saldoQuery = useQuery({
    queryKey: ['painel-paciente-saldo', paciente.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lancamentos')
        .select('valor, valor_pago, desconto, acrescimo, status')
        .eq('paciente_id', paciente.id)
        .eq('tipo', 'receita');
      if (error) throw error;
      return (data ?? [])
        .filter(c => !['cancelado', 'estornado'].includes(String(c.status)))
        .reduce((total, c) => total + Math.max(0, saldoDevedor('x', [{ ...c, agendamento_id: 'x' } as any])), 0);
    },
  });

  const consultasQuery = useQuery({
    queryKey: ['painel-paciente-consultas', paciente.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agendamentos')
        .select('id, data, hora_inicio, tipo, status, medicos(nome)')
        .eq('paciente_id', paciente.id)
        .order('data', { ascending: false })
        .order('hora_inicio', { ascending: false })
        .limit(4);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const saldo = saldoQuery.data;

  return (
    <aside aria-label={`Resumo de ${paciente.nome}`} className="sticky top-0 self-start rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <PatientPhoto pacienteId={paciente.id} pacienteNome={paciente.nome} currentPhotoUrl={paciente.foto_url} size="md" editable={false} />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight">{paciente.nome}</h2>
          <p className="text-sm text-muted-foreground">
            {Number.isFinite(idade) && idade >= 0 ? `${idade} anos` : 'Idade não informada'}
            {paciente.ativo === false && <Badge variant="secondary" className="ml-2 text-[10px]">Inativo</Badge>}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-border p-3">
        {paciente.ativo !== false && (
          <Button size="sm" className="gap-1.5" onClick={() => navigate('/agenda/nova', { state: { initial: { paciente_id: paciente.id }, returnTo: '/agenda' } })}>
            <CalendarPlus aria-hidden="true" className="h-4 w-4" /> Agendar
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onView(paciente)}>
          <Eye aria-hidden="true" className="h-4 w-4" /> Abrir ficha
        </Button>
        {whatsapp && (
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Mensagem para ${paciente.nome} no WhatsApp`}>
              <MessageCircle aria-hidden="true" className="h-4 w-4" /> Mensagem
            </a>
          </Button>
        )}
        {podeEditar && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onEdit(paciente)}>
            <Edit aria-hidden="true" className="h-4 w-4" /> Editar
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-[88px_1fr] gap-y-1 border-b border-border p-4 text-sm">
        <dt className="py-1 text-muted-foreground">Alergias</dt>
        <dd className={alergias.length ? 'py-1 font-medium text-destructive' : 'py-1 text-muted-foreground'}>
          {alergias.length ? alergias.join(', ') : 'Nenhuma informada'}
        </dd>
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="contents">
            <dt className="py-1 text-muted-foreground">{rotulo}</dt>
            <dd className={valor ? 'min-w-0 truncate py-1 tabular-nums' : 'py-1 text-muted-foreground'}>{valor ?? 'Não informado'}</dd>
          </div>
        ))}
        <dt className="py-1 text-muted-foreground">Saldo</dt>
        <dd className={saldo && saldo > 0.009 ? 'py-1 font-medium tabular-nums text-destructive' : 'py-1 tabular-nums'}>
          {saldoQuery.isLoading ? '…' : saldoQuery.isError ? '—' : formatCurrency(saldo ?? 0)}
        </dd>
      </dl>
      <section aria-labelledby={`consultas-${paciente.id}`} className="p-4">
        <h3 id={`consultas-${paciente.id}`} className="mb-2 text-sm font-semibold">Últimas consultas</h3>
        {consultasQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : consultasQuery.isError ? (
          <p className="text-sm text-muted-foreground">Não foi possível carregar as consultas.</p>
        ) : !consultasQuery.data?.length ? (
          <p className="text-sm text-muted-foreground">Nenhuma consulta registrada.</p>
        ) : (
          <ol className="relative space-y-2 border-l border-border pl-4">
            {consultasQuery.data.map(consulta => {
              const dia = parseDateOnly(consulta.data);
              return (
                <li key={consulta.id} className="relative text-sm">
                  <span aria-hidden="true" className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border border-border bg-card" />
                  <span className="font-medium tabular-nums">{dia ? formatWithDatePreference(dia, 'dd/MM/yy') : consulta.data}</span>
                  <span className="text-muted-foreground"> · {consulta.tipo || 'Consulta'}{consulta.medicos?.nome ? ` · ${consulta.medicos.nome}` : ''}</span>
                  <span className={consulta.status === 'faltou' ? 'block text-xs text-destructive' : 'block text-xs text-muted-foreground'}>
                    {SITUACAO[consulta.status] ?? consulta.status}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </aside>
  );
}
