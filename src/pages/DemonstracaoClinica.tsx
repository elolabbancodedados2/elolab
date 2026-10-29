import { ArrowLeft, CalendarDays, FlaskConical, LockKeyhole, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const sampleAppointments = [
  { time: '09:00', person: 'Marina Costa', service: 'Consulta clínica', status: 'Confirmada' },
  { time: '10:30', person: 'Rafael Mendes', service: 'Retorno', status: 'Aguardando' },
  { time: '13:00', person: 'Camila Rocha', service: 'Avaliação inicial', status: 'Confirmada' },
];

/** Demonstração estática e isolada: sem sessão, consultas ou gravações no Supabase. */
export default function DemonstracaoClinica() {
  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8">
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-4"><Button asChild variant="outline" className="rounded-full gap-2"><Link to="/"><ArrowLeft className="h-4 w-4" />Voltar</Link></Button><Badge variant="outline" className="gap-2 rounded-full border-[#BFD8EE] bg-white px-3 py-1 text-[#1080CA]"><LockKeyhole className="h-3.5 w-3.5" />Ambiente demonstrativo isolado</Badge></header>
      <div><p className="text-sm font-semibold uppercase tracking-widest text-[#1080CA]">EloLab · demonstração</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Conheça a rotina da clínica</h1><p className="mt-2 max-w-2xl text-muted-foreground">Os nomes, horários e números abaixo são exemplos fictícios desta página. Nada é lido ou salvo na sua conta.</p></div>
      <section className="grid divide-y divide-border rounded-2xl border border-border bg-card shadow-xs sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label="Indicadores fictícios">
        {[['Consultas hoje', '18', CalendarDays], ['Equipe demonstrativa', '6', UsersRound], ['Exames em andamento', '4', FlaskConical]].map(([label, value, Icon]) => { const MetricIcon = Icon as typeof CalendarDays; return <div key={label as string} className="flex items-center gap-4 p-5"><span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><MetricIcon className="h-5 w-5" /></span><div><p className="text-[11px] text-muted-foreground">{label as string}</p><p className="text-2xl font-bold tabular-nums">{value as string}</p></div></div>; })}
      </section>
      <Card className="rounded-2xl border-border/60 shadow-xs"><CardHeader><CardTitle className="text-base">Agenda de exemplo</CardTitle></CardHeader><CardContent className="space-y-3">{sampleAppointments.map((row) => <div key={row.time} className="grid gap-2 rounded-xl border border-border/60 p-4 sm:grid-cols-[90px_1fr_1fr_auto] sm:items-center"><span className="font-semibold tabular-nums text-[#1080CA]">{row.time}</span><span>{row.person}</span><span className="text-sm text-muted-foreground">{row.service}</span><Badge variant="outline" className={`w-fit rounded-full ${row.status === 'Confirmada' ? 'border-success/40 bg-success/10 text-success' : 'border-warning/40 bg-warning/10 text-warning'}`}>{row.status}</Badge></div>)}</CardContent></Card>
      <Card className="rounded-2xl border-border bg-card"><CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center"><div><h2 className="font-semibold">Pronto para usar com os dados da sua clínica?</h2><p className="mt-1 text-sm text-muted-foreground">Crie sua conta e configure seu espaço real após contratar um plano.</p></div><Button asChild className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"><Link to="/planos">Ver planos</Link></Button></CardContent></Card>
    </div>
  </main>;
}
