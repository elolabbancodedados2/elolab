import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, CalendarPlus, Search } from '@/components/icons/elolabIcons';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ErrorState } from '@/components/ErrorState';
import { useMedicos } from '@/hooks/useSupabaseData';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { buscarVagas, type VagaEncontrada } from '@/lib/buscaVaga';
import { minutosAgoraSaoPaulo } from '@/lib/proximaVagaLivre';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';
import { nomeMedico } from '@/lib/formatters';
import { especialidadeAtende, especialidadesCadastradas } from '@/lib/waitingListSlotCompatibility';

/** A próxima vaga de cada profissional, comparada lado a lado. */
export default function BuscarVagaPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const medicosQuery = useMedicos();
  const medicosAtivos = useMemo(() => (medicosQuery.data ?? []).filter((m: any) => m.ativo !== false), [medicosQuery.data]);
  const especialidades = useMemo(() => especialidadesCadastradas(medicosAtivos as any[]), [medicosAtivos]);
  const [especialidade, setEspecialidade] = useState('todas');
  const [periodo, setPeriodo] = useState('qualquer');
  const [duracao, setDuracao] = useState('padrao');
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [vagas, setVagas] = useState<VagaEncontrada[] | null>(null);
  const voltarPara = typeof location.state?.returnTo === 'string' && /^\/agenda(?:\?|$)/.test(location.state.returnTo)
    ? location.state.returnTo : '/agenda';

  const buscar = async () => {
    if (!profile?.clinica_id) return;
    setBuscando(true);
    setErro('');
    try {
      const candidatos = (medicosAtivos as any[]).filter(m => especialidade === 'todas' || especialidadeAtende(m.especialidade, especialidade));
      setVagas(await buscarVagas({
        clinicaId: profile.clinica_id,
        medicos: candidatos,
        hoje: todaySaoPauloDateOnly(),
        agoraMinutos: minutosAgoraSaoPaulo(),
        dias: 30,
        periodo: periodo === 'qualquer' ? null : periodo,
        duracaoMinutos: duracao === 'padrao' ? undefined : Number(duracao),
      }));
    } catch (error) {
      setErro(mensagemDeErro(error));
      setVagas(null);
    } finally {
      setBuscando(false);
    }
  };

  const agendar = (vaga: VagaEncontrada) => navigate(`/agenda/nova?data=${vaga.data}`, {
    state: {
      initial: { medico_id: vaga.medico_id, data: vaga.data, hora_inicio: vaga.hora_inicio, status: 'agendado', tipo: 'consulta' },
      returnTo: `/agenda?data=${vaga.data}&view=daily`,
    },
  });

  if (medicosQuery.isError) return <ErrorState title="Não foi possível carregar os profissionais" error={medicosQuery.error} onRetry={() => void medicosQuery.refetch()} />;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 pb-16">
      <Button variant="ghost" className="-ml-3 min-h-11 gap-2" onClick={() => navigate(voltarPara)}><ArrowLeft className="h-4 w-4" />Voltar à agenda</Button>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Buscar vaga</h1>
        <p className="text-sm text-muted-foreground">Compare a próxima vaga de cada profissional nos próximos 30 dias, dentro do expediente cadastrado.</p>
      </header>
      <form onSubmit={e => { e.preventDefault(); void buscar(); }} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="vaga-especialidade">Especialidade</Label>
          <Select value={especialidade} onValueChange={setEspecialidade}>
            <SelectTrigger id="vaga-especialidade"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {especialidades.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vaga-periodo">Período</Label>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger id="vaga-periodo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="qualquer">Qualquer horário</SelectItem>
              <SelectItem value="manha">Manhã</SelectItem>
              <SelectItem value="tarde">Tarde</SelectItem>
              <SelectItem value="noite">Noite</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vaga-duracao">Duração</Label>
          <Select value={duracao} onValueChange={setDuracao}>
            <SelectTrigger id="vaga-duracao"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="padrao">Padrão de cada profissional</SelectItem>
              <SelectItem value="15">15 min</SelectItem>
              <SelectItem value="30">30 min</SelectItem>
              <SelectItem value="45">45 min</SelectItem>
              <SelectItem value="60">60 min</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="min-h-11 gap-2" disabled={buscando || medicosQuery.isLoading}>
          <Search className="h-4 w-4" />{buscando ? 'Buscando…' : 'Buscar'}
        </Button>
      </form>
      {erro && <p role="alert" className="text-sm text-destructive">Não foi possível buscar as vagas. {erro}</p>}
      {vagas && (
        <section aria-labelledby="vagas-encontradas" className="rounded-xl border border-border bg-card px-4">
          <h2 id="vagas-encontradas" className="border-b border-border py-3 text-sm font-semibold">
            {vagas.length ? `${vagas.length} ${vagas.length === 1 ? 'profissional' : 'profissionais'} com vaga` : 'Nenhuma vaga encontrada'}
          </h2>
          {vagas.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Tente outro período, outra especialidade ou confira o expediente dos profissionais.</p>
          ) : (
            <ul className="divide-y divide-border">
              {vagas.map((vaga, i) => {
                const medico = (medicosAtivos as any[]).find(m => m.id === vaga.medico_id);
                return (
                  <li key={vaga.medico_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {medico ? nomeMedico(medico.nome || medico.crm) : 'Profissional'}
                        {i === 0 && <span className="ml-2 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background">Mais cedo</span>}
                      </p>
                      <p className="text-xs text-muted-foreground first-letter:uppercase">
                        {format(parseISO(vaga.data), "EEEE, d 'de' MMM", { locale: ptBR })} às <span className="font-semibold tabular-nums text-foreground">{vaga.hora_inicio}</span>
                        {medico?.especialidade ? ` · ${medico.especialidade}` : ''}
                      </p>
                    </div>
                    <Button size="sm" className="min-h-11 gap-1.5 rounded-full" onClick={() => agendar(vaga)} aria-label={`Agendar com ${medico ? nomeMedico(medico.nome || medico.crm) : 'profissional'} em ${vaga.data.split('-').reverse().join('/')} às ${vaga.hora_inicio}`}>
                      <CalendarPlus className="h-4 w-4" />Agendar
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
