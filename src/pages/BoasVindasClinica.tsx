import { motion } from 'framer-motion';
import { ArrowRight, CalendarCheck, CheckCircle2, Sparkles, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import logo from '@/assets/elolab-logo-identidade.png';

export default function BoasVindasClinica() {
  const { profile } = useSupabaseAuth();
  return <main className="mx-auto flex min-h-[72vh] max-w-4xl items-center justify-center px-4 py-12">
    <Card className="w-full overflow-hidden border-primary/15 shadow-xl shadow-primary/5">
      <CardContent className="p-6 text-center sm:p-12">
        <motion.img src={logo} alt="EloLab" className="mx-auto mb-8 h-16 w-auto object-contain"
          initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.65, ease: 'easeOut' }} />
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.45 }}>
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="h-7 w-7" /></div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Sua clínica começa aqui</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Bem-vindo{profile?.nome ? `, ${profile.nome.split(' ')[0]}` : ''}.</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">Seu espaço EloLab está pronto. Vamos configurar os detalhes essenciais para sua equipe começar a atender com confiança.</p>
        </motion.div>
        <div className="mx-auto mt-8 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
          {[['Serviços', 'Organize o que sua clínica oferece', CheckCircle2], ['Horários', 'Defina quando sua equipe atende', CalendarCheck], ['Equipe', 'Convide quem trabalha com você', UsersRound]].map(([title, detail, Icon]) => {
            const StepIcon = Icon as typeof CheckCircle2;
            return <div key={title as string} className="rounded-xl border bg-background/70 p-4"><StepIcon className="mb-3 h-5 w-5 text-primary" /><p className="font-semibold">{title as string}</p><p className="mt-1 text-xs text-muted-foreground">{detail as string}</p></div>;
          })}
        </div>
        <Button asChild size="lg" className="mt-8 h-12 px-7">
          <Link to="/onboarding">Configurar minha clínica <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </Button>
        <div className="mt-4 flex flex-wrap justify-center gap-2"><Button asChild variant="link"><Link to="/dashboard">Ir direto ao dashboard</Link></Button><Button asChild variant="link"><Link to="/demonstracao">Ver demonstração fictícia</Link></Button></div>
      </CardContent>
    </Card>
  </main>;
}
