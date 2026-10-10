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
  return <main className="min-h-screen bg-gradient-to-br from-sky-50 via-background to-cyan-50 px-4 py-8 text-foreground sm:px-8">
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-4"><Button asChild variant="ghost"><Link to="/"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link></Button><Badge variant="secondary" className="gap-2"><LockKeyhole className="h-3.5 w-3.5" />Ambiente demonstrativo isolado</Badge></header>
      <div><p className="text-sm font-semibold uppercase tracking-widest text-primary">EloLab · demonstração</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Conheça a rotina da clínica</h1><p className="mt-2 max-w-2xl text-muted-foreground">Os nomes, horários e números abaixo são exemplos fictícios desta página. Nada é lido ou salvo na sua conta.</p></div>
      <section className="grid gap-4 sm:grid-cols-3" aria-label="Indicadores fictícios">
        {[['Consultas hoje', '18', CalendarDays], ['Equipe demonstrativa', '6', UsersRound], ['Exames em andamento', '4', FlaskConical]].map(([label, value, Icon]) => { const MetricIcon = Icon as typeof CalendarDays; return <Card key={label as string}><CardContent className="flex items-center gap-4 p-5"><span className="rounded-xl bg-primary/10 p-3 text-primary"><MetricIcon className="h-5 w-5" /></span><div><p className="text-sm text-muted-foreground">{label as string}</p><p className="text-2xl font-bold">{value as string}</p></div></CardContent></Card>; })}
      </section>
      <Card><CardHeader><CardTitle>Agenda de exemplo</CardTitle></CardHeader><CardContent className="space-y-3">{sampleAppointments.map((row) => <div key={row.time} className="grid gap-2 rounded-lg border p-4 sm:grid-cols-[90px_1fr_1fr_auto] sm:items-center"><span className="font-semibold text-primary">{row.time}</span><span>{row.person}</span><span className="text-sm text-muted-foreground">{row.service}</span><Badge variant="outline">{row.status}</Badge></div>)}</CardContent></Card>
      <Card className="border-primary/20 bg-primary/[0.03]"><CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center"><div><h2 className="font-semibold">Pronto para usar com os dados da sua clínica?</h2><p className="mt-1 text-sm text-muted-foreground">Crie sua conta e configure seu espaço real após contratar um plano.</p></div><Button asChild><Link to="/planos">Ver planos</Link></Button></CardContent></Card>
    </div>
  </main>;
}
