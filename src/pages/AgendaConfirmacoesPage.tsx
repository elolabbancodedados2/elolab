import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';
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
  const medicosQuery = useMedicos();
  const medicoPorId = useMemo(() => new Map((medicosQuery.data ?? []).map((m: any) => [m.id, m])), [medicosQuery.data]);
  const { pendentes, confirmadas } = useMemo(() => separarConfirmacoes(agendaQuery.data ?? []), [agendaQuery.data]);
  const voltarPara = typeof location.state?.returnTo === 'string' && /^\/agenda(?:\?|$)/.test(location.state.returnTo)
    ? location.state.returnTo : `/agenda?data=${data}&view=daily`;
  const dataBr = isValidAgendaDate(data) ? format(parseISO(data), "EEEE, d 'de' MMMM", { locale: ptBR }) : '';

  const confirmar = async (a: any) => {
    if (!profile?.clinica_id || salvando) return;
    setSalvando(a.id);
    try {
      let update = supabase.from('agendamentos').update({ status: 'confirmado' })
        .eq('id', a.id).eq('clinica_id', profile.clinica_id).eq('status', 'agendado');
      update = a.updated_at ? update.eq('updated_at', a.updated_at) : update.is('updated_at', null);
      const { data: atualizado, error } = await (update.select('id').maybeSingle() as any);
      if (error) throw error;
      if (!atualizado) throw new Error('A consulta mudou desde que a lista foi carregada. A lista foi atualizada.');
      toast.success('Consulta confirmada');
    } catch (error) {
      toast.error('Não foi possível confirmar', { description: mensagemDeErro(error) });
    } finally {
      setSalvando(null);
      void queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
    }
  };

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
            <Button size="sm" className="min-h-11 gap-1.5 rounded-full" disabled={salvando !== null} onClick={() => void confirmar(a)}>
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
        <Input id="confirmacoes-data" type="date" value={data} min={todaySaoPauloDateOnly()} onChange={e => { if (isValidAgendaDate(e.target.value)) setData(e.target.value); }} />
      </div>
      <section aria-labelledby="confirmacoes-pendentes" className="rounded-xl border border-border bg-card px-4">
        <h2 id="confirmacoes-pendentes" className="border-b border-border py-3 text-sm font-semibold">A confirmar</h2>
        {agendaQuery.isLoading ? (
          <p role="status" className="py-6 text-sm text-muted-foreground">Carregando consultas…</p>
        ) : pendentes.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Todas as consultas deste dia estão confirmadas ou não há consultas marcadas.</p>
        ) : (
          <ul className="divide-y divide-border">{pendentes.map(a => linha(a, true))}</ul>
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
