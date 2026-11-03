import { Checkbox } from '@/components/ui/checkbox';
import { estadoLembrete, confirmarSelecionadas, type ConsultaConfirmacao } from '@/lib/agendaConfirmacoes';
import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, MessageCircle, Phone } from '@/components/icons/elolabIcons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/ErrorState';
import { useAgendamentosPeriodo, useMedicos } from '@/hooks/useSupabaseData';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { isValidAgendaDate } from '@/lib/agendaDate';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';
import { nomeMedico } from '@/lib/formatters';
import { linkWhatsApp } from '@/lib/whatsapp';
import { cn } from '@/lib/utils';
import { eAgendamentoOnline } from '@/components/agenda/agendaStatus';

/** Consultas que ainda precisam de contato: marcadas e não confirmadas. */
export function separarConfirmacoes(agendamentos: any[]) {
  const ordenados = [...agendamentos].sort((a, b) => String(a.hora_inicio).localeCompare(String(b.hora_inicio)));
  return {
    pendentes: ordenados.filter(a => a.status === 'agendado'),
    confirmadas: ordenados.filter(a => a.status === 'confirmado'),
  };
}

export default function AgendaConfirmacoesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const amanha = format(addDays(parseISO(todaySaoPauloDateOnly()), 1), 'yyyy-MM-dd');
  const [data, setData] = useState(amanha);
  const [salvando, setSalvando] = useState<string | null>(null);
  const agendaQuery = useAgendamentosPeriodo(data, data, { resumoPaciente: true, enabled: isValidAgendaDate(data) });
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [semResposta, setSemResposta] = useState(false);
  const [falhas, setFalhas] = useState<{ id: string; nome: string; motivo: string }[]>([]);
  const salvandoRef = useRef(false);
  const ids = (agendaQuery.data ?? []).map(a => a.id);
  const lembretesQuery = useQuery({
    queryKey: ['agenda-confirmacoes', profile?.clinica_id, data, ids],
    enabled: Boolean(profile?.clinica_id && ids.length),
    queryFn: async () => {
      const notificacoes = await supabase.from('notification_queue')
        .select('status, enviado_em, dados_extras').eq('clinica_id', profile!.clinica_id!)
        .in('dados_extras->>agendamento_id', ids);
      if (notificacoes.error) throw notificacoes.error;
      const respostas = await supabase.from('whatsapp_agent_actions')
        .select('tipo_acao, sucesso, created_at, dados_entrada, dados_saida').eq('clinica_id', profile!.clinica_id!)
        .in('dados_entrada->>agendamento_id', ids).eq('sucesso', true);
      if (respostas.error) throw respostas.error;
      return { notificacoes: notificacoes.data ?? [], respostas: respostas.data ?? [] };
    },
  });
  const estado = (id: string) => estadoLembrete(id, lembretesQuery.data?.notificacoes ?? [], lembretesQuery.data?.respostas ?? []);
  const medicosQuery = useMedicos();
  const medicoPorId = useMemo(() => new Map((medicosQuery.data ?? []).map((m: any) => [m.id, m])), [medicosQuery.data]);
  const { pendentes, confirmadas } = useMemo(() => separarConfirmacoes(agendaQuery.data ?? []), [agendaQuery.data]);
  const voltarPara = typeof location.state?.returnTo === 'string' && /^\/agenda(?:\?|$)/.test(location.state.returnTo)
    ? location.state.returnTo : `/agenda?data=${data}&view=daily`;
  const dataBr = isValidAgendaDate(data) ? format(parseISO(data), "EEEE, d 'de' MMMM", { locale: ptBR }) : '';

  const confirmar = async (consultas: ConsultaConfirmacao[]) => {
    if (!profile?.clinica_id || salvandoRef.current || consultas.length === 0) return;
    salvandoRef.current = true;
    setSalvando(consultas.length === 1 ? consultas[0].id : 'lote');
    try {
      const resultado = await confirmarSelecionadas(consultas, profile.clinica_id);
      setFalhas(resultado.falhas);
      setSelecionadas(atual => atual.filter(id => !resultado.confirmadas.includes(id)));
      if (resultado.confirmadas.length) toast.success(`${resultado.confirmadas.length} consulta(s) confirmada(s)`);
      if (resultado.falhas.length) toast.error('Algumas consultas não foram confirmadas. Confira a lista de falhas.');
    } finally {
      salvandoRef.current = false;
      setSalvando(null);
      void queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
    }
  };
  const pendentesVisiveis = semResposta ? pendentes.filter(a => estado(a.id).semResposta) : pendentes;
  const selecionadasVisiveis = pendentesVisiveis.filter(a => selecionadas.includes(a.id));

  if (agendaQuery.isError) return <ErrorState title="Não foi possível carregar as consultas" error={agendaQuery.error} onRetry={() => void agendaQuery.refetch()} />;

  const linha = (a: any, pendente: boolean) => {
    const nome = a.pacientes?.nome_social || a.pacientes?.nome || 'Paciente';
    const hora = String(a.hora_inicio).slice(0, 5);
    const medico = medicoPorId.get(a.medico_id) as any;
    const whatsapp = linkWhatsApp(a.pacientes?.telefone, `Olá, ${nome.split(' ')[0]}! Podemos confirmar sua consulta ${data === amanha ? 'de amanhã' : `de ${data.split('-').reverse().join('/')}`} às ${hora}${medico ? ` com ${nomeMedico(medico.nome || medico.crm)}` : ''}? Responda SIM para confirmar.`);
    const telefone = String(a.pacientes?.telefone || '').replace(/\D/g, '');
    return (
      <li key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {pendente && <Checkbox aria-label={`Selecionar ${nome}`} checked={selecionadas.includes(a.id)} disabled={salvando !== null}
            onCheckedChange={checked => setSelecionadas(atual => checked ? [...atual, a.id] : atual.filter(id => id !== a.id))} />}
          <p className="text-xs text-muted-foreground">{lembretesQuery.isError ? 'Lembrete indisponível' : lembretesQuery.isLoading ? 'Carregando lembrete…' : estado(a.id).respondeu ? 'Respondeu' : estado(a.id).enviado ? 'Enviado · sem resposta' : 'Não enviado'}</p>
          <p className="font-medium text-foreground">
            <span className="mr-2 tabular-nums">{hora}</span>{nome}
            {eAgendamentoOnline(a) && <span className="ml-2 rounded border border-border bg-muted px-1 text-[10px] font-semibold uppercase">Online</span>}
          </p>
          <p className="text-xs text-muted-foreground">{medico ? nomeMedico(medico.nome || medico.crm) : 'Profissional não informado'}{a.pacientes?.telefone ? ` · ${a.pacientes.telefone}` : ' · sem telefone'}</p>
        </div>
        {pendente && (
          <div className="flex flex-wrap gap-1.5">
            {whatsapp && (
              <Button asChild variant="outline" size="sm" className="min-h-11 gap-1.5 rounded-full">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Pedir confirmação a ${nome} pelo WhatsApp`}><MessageCircle className="h-4 w-4" />WhatsApp</a>
              </Button>
            )}
            {telefone.length >= 10 && (
              <Button asChild variant="outline" size="sm" className="min-h-11 gap-1.5 rounded-full">
                <a href={`tel:${telefone}`} aria-label={`Ligar para ${nome}`}><Phone className="h-4 w-4" />Ligar</a>
              </Button>
            )}
            <Button size="sm" className="min-h-11 gap-1.5 rounded-full" disabled={salvando !== null} onClick={() => void confirmar([a])}>
              <CheckCircle2 className="h-4 w-4" />{salvando === a.id ? 'Confirmando…' : 'Confirmar'}
            </Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 pb-16">
      <Button variant="ghost" className="-ml-3 min-h-11 gap-2" onClick={() => navigate(voltarPara)}><ArrowLeft className="h-4 w-4" />Voltar à agenda</Button>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Confirmação de consultas</h1>
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {dataBr} · {pendentes.length} a confirmar · {confirmadas.length} confirmada{confirmadas.length === 1 ? '' : 's'}
        </p>
      </header>
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="confirmacoes-data">Data</Label>
        <Input id="confirmacoes-data" type="date" value={data} min={todaySaoPauloDateOnly()} onChange={e => { if (isValidAgendaDate(e.target.value)) { setData(e.target.value); setSelecionadas([]); setFalhas([]); } }} />
      </div>
      {lembretesQuery.isError && <ErrorState compact title="Não foi possível carregar os lembretes" error={lembretesQuery.error} onRetry={() => void lembretesQuery.refetch()} />}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={semResposta} disabled={!lembretesQuery.isSuccess} onCheckedChange={checked => { setSemResposta(checked === true); setSelecionadas([]); }} />Sem resposta</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox aria-label="Selecionar todas as consultas visíveis" disabled={salvando !== null || !pendentesVisiveis.length}
          checked={pendentesVisiveis.length > 0 && selecionadasVisiveis.length === pendentesVisiveis.length}
          onCheckedChange={checked => setSelecionadas(checked ? pendentesVisiveis.map(a => a.id) : [])} />Selecionar todas</label>
        <Button disabled={salvando !== null || !selecionadasVisiveis.length} onClick={() => void confirmar(selecionadasVisiveis)}>Confirmar selecionadas ({selecionadasVisiveis.length})</Button>
      </div>
      {falhas.length > 0 && <div role="alert" className="rounded-lg border border-destructive p-3"><p className="font-medium">Não confirmadas</p><ul>{falhas.map(falha => <li key={falha.id}>{falha.nome}: {falha.motivo}</li>)}</ul></div>}
      <section aria-labelledby="confirmacoes-pendentes" className="rounded-xl border border-border bg-card px-4">
        <h2 id="confirmacoes-pendentes" className="border-b border-border py-3 text-sm font-semibold">A confirmar</h2>
        {agendaQuery.isLoading ? (
          <p role="status" className="py-6 text-sm text-muted-foreground">Carregando consultas…</p>
        ) : pendentesVisiveis.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">{semResposta ? 'Nenhum lembrete sem resposta neste dia.' : 'Todas as consultas deste dia estão confirmadas ou não há consultas marcadas.'}</p>
        ) : (
          <ul className="divide-y divide-border">{pendentesVisiveis.map(a => linha(a, true))}</ul>
        )}
      </section>
      {confirmadas.length > 0 && (
        <section aria-labelledby="confirmacoes-feitas" className={cn('rounded-xl border border-border bg-card px-4')}>
          <h2 id="confirmacoes-feitas" className="border-b border-border py-3 text-sm font-semibold">Confirmadas</h2>
          <ul className="divide-y divide-border">{confirmadas.map(a => linha(a, false))}</ul>
        </section>
      )}
    </main>
  );
}
