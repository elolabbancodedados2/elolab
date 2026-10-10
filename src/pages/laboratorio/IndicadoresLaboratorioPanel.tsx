import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Clock3, Download, FlaskConical, RotateCcw, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ColetaIndicador = {
  id: string;
  status: string;
  created_at: string;
  data_coleta: string | null;
  recoleta_de_id: string | null;
  exames?: { preco_custo: number | null } | null;
  resultados_laboratorio?: Array<{ liberado: boolean | null; data_liberacao: string | null }>;
};
type LinhaDia = { chave: string; dia: string; amostras: number; liberadas: number; recoletas: number };

const db = supabase as any;
const NENHUMA_COLETA: ColetaIndicador[] = [];
const fmtNumero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function IndicadoresLaboratorioPanel() {
  const { profile } = useSupabaseAuth();
  const [periodo, setPeriodo] = useState('30');
  const [limiteAlerta, setLimiteAlerta] = useState('24');
  const inicio = useMemo(() => new Date(Date.now() - Number(periodo) * 86_400_000).toISOString(), [periodo]);

  const query = useQuery({
    queryKey: ['lab-indicadores', profile?.clinica_id, periodo],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await db.from('coletas_laboratorio')
        .select('id, status, created_at, data_coleta, recoleta_de_id, exames(preco_custo), resultados_laboratorio(liberado, data_liberacao)')
        .eq('clinica_id', profile!.clinica_id).gte('created_at', inicio)
        .order('created_at', { ascending: true }).limit(5000);
      if (error) throw error;
      return (data ?? []) as ColetaIndicador[];
    },
  });
  const coletas = query.data ?? NENHUMA_COLETA;
  const agora = Date.now();
  const pendentes = coletas.filter((item) => !['validado', 'liberado', 'cancelado', 'rejeitada'].includes(item.status));
  const alertas = pendentes.filter((item) => agora - new Date(item.created_at).getTime() >= Number(limiteAlerta) * 3_600_000);
  const recoletas = coletas.filter((item) => item.status === 'rejeitada' || !!item.recoleta_de_id).length;
  const concluidas = coletas.filter((item) => item.resultados_laboratorio?.some((resultado) => resultado.liberado && resultado.data_liberacao));
  const tempos = concluidas.flatMap((item) => {
    const liberadoEm = item.resultados_laboratorio?.map((resultado) => resultado.liberado && resultado.data_liberacao ? new Date(resultado.data_liberacao).getTime() : null).filter((valor): valor is number => valor != null);
    if (!liberadoEm?.length) return [];
    return [Math.max(0, (Math.max(...liberadoEm) - new Date(item.created_at).getTime()) / 3_600_000)];
  });
  const tempoMedio = tempos.length ? tempos.reduce((total, valor) => total + valor, 0) / tempos.length : null;
  const custoConhecido = coletas.reduce((total, item) => total + (Number(item.exames?.preco_custo) || 0), 0);
  const custoComRegistro = coletas.filter((item) => item.exames?.preco_custo != null).length;
  const dias = useMemo(() => {
    const lista: LinhaDia[] = [];
    const totalDias = Math.min(Number(periodo), 30);
    for (let offset = totalDias - 1; offset >= 0; offset--) {
      const dia = new Date(Date.now() - offset * 86_400_000);
      const chave = dia.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const rows = coletas.filter((item) => new Date(item.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) === chave);
      lista.push({
        chave,
        dia: dia.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }),
        amostras: rows.length,
        liberadas: rows.filter((item) => item.resultados_laboratorio?.some((resultado) => resultado.liberado)).length,
        recoletas: rows.filter((item) => item.status === 'rejeitada' || !!item.recoleta_de_id).length,
      });
    }
    return lista;
  }, [coletas, periodo]);

  const exportarResumo = () => {
    if (!dias.length) { toast.info('Não há dados para exportar neste período.'); return; }
    const csv = ['Data,Amostras recebidas,Laudos liberados,Recoletas', ...dias.map((item) => `${item.chave},${item.amostras},${item.liberadas},${item.recoletas}`)].join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `elolab-indicadores-lab-${periodo}d.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const maxBar = Math.max(1, ...dias.map((dia) => dia.amostras));

  return (
    <section className="space-y-5" aria-labelledby="lab-indicadores-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Desempenho operacional</p><h2 id="lab-indicadores-title" className="mt-1 text-2xl font-semibold tracking-tight">Indicadores laboratoriais</h2><p className="mt-1 text-sm text-muted-foreground">Leituras calculadas a partir das coletas e liberações registradas pela clínica.</p></div><div className="flex gap-2"><Select value={periodo} onValueChange={setPeriodo}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">7 dias</SelectItem><SelectItem value="30">30 dias</SelectItem><SelectItem value="90">90 dias</SelectItem></SelectContent></Select><Button variant="outline" className="gap-2" onClick={exportarResumo}><Download className="h-4 w-4" />Exportar CSV</Button></div></div>
      {query.isError ? <ErrorState title="Não foi possível calcular os indicadores" error={query.error} onRetry={() => void query.refetch()} /> : query.isLoading ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">Calculando a partir dos dados do laboratório…</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Card className="border-border/70 bg-gradient-to-br from-primary/[0.07] to-background"><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">Amostras no período</p><p className="mt-1 text-2xl font-semibold tabular-nums">{coletas.length}</p></div><FlaskConical className="h-5 w-5 text-primary" /></CardContent></Card>
            <Card className="border-border/70"><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">Tempo médio até liberação</p><p className="mt-1 text-2xl font-semibold tabular-nums">{tempoMedio == null ? '—' : `${fmtNumero.format(tempoMedio)} h`}</p><p className="text-xs text-muted-foreground">{tempos.length} amostra(s) liberada(s) no cálculo</p></div><Clock3 className="h-5 w-5 text-cyan-600" /></CardContent></Card>
            <Card className="border-border/70"><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">Aguardando há mais de</p><Select value={limiteAlerta} onValueChange={setLimiteAlerta}><SelectTrigger className="mt-1 h-auto w-auto border-0 p-0 text-2xl font-semibold shadow-none"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="12">12 horas</SelectItem><SelectItem value="24">24 horas</SelectItem><SelectItem value="48">48 horas</SelectItem></SelectContent></Select></div><AlertTriangle className="h-5 w-5 text-amber-600" /><p className="absolute sr-only">{alertas.length} amostra(s)</p></CardContent></Card>
            <Card className="border-border/70"><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">Recoletas / rejeições</p><p className="mt-1 text-2xl font-semibold tabular-nums">{recoletas}</p></div><RotateCcw className="h-5 w-5 text-destructive" /></CardContent></Card>
            <Card className="border-border/70"><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">Custo registrado</p><p className="mt-1 text-2xl font-semibold tabular-nums">{custoComRegistro ? fmtMoeda.format(custoConhecido) : '—'}</p><p className="text-xs text-muted-foreground">{custoComRegistro} exame(s) com custo preenchido</p></div><TrendingUp className="h-5 w-5 text-emerald-600" /></CardContent></Card>
          </div>
          {alertas.length > 0 && <div role="status" className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm"><AlertTriangle className="h-4 w-4 text-amber-600" /><span><strong>{alertas.length}</strong> amostra(s) em aberto ultrapassaram o limite de {limiteAlerta} horas selecionado.</span></div>}
          <Card className="border-border/70"><CardHeader className="border-b bg-muted/20"><CardTitle className="text-base">Volume diário de trabalho</CardTitle><CardDescription>Amostras recebidas, laudos liberados e amostras com recoleta.</CardDescription></CardHeader><CardContent className="space-y-2 p-5">{dias.length && dias.every((item) => item.amostras === 0) ? <div className="py-12 text-center"><Activity className="mx-auto h-7 w-7 text-muted-foreground/50" /><p className="mt-3 font-medium">Sem movimentação neste período</p><p className="mt-1 text-sm text-muted-foreground">Quando houver coletas registradas, o volume diário aparecerá aqui.</p></div> : <div className="space-y-2">{dias.map((item) => <div key={item.chave} className="grid grid-cols-[52px_1fr_110px] items-center gap-3 text-xs"><span className="tabular-nums text-muted-foreground">{item.dia}</span><div className="flex h-6 min-w-0 items-center gap-1"><span title={`${item.amostras} amostras`} className="h-3 rounded-sm bg-primary/80" style={{ width: `${Math.max(item.amostras ? 3 : 0, item.amostras / maxBar * 100)}%` }} /><span title={`${item.liberadas} liberações`} className="h-3 rounded-sm bg-cyan-500/80" style={{ width: `${Math.max(item.liberadas ? 2 : 0, item.liberadas / maxBar * 100)}%` }} /></div><span className="text-right tabular-nums text-muted-foreground">{item.amostras} · {item.liberadas} · {item.recoletas}</span></div>)}</div>}<div className="flex flex-wrap gap-4 border-t pt-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-primary/80" />Amostras</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-cyan-500/80" />Laudos</span><span>Última coluna: recoletas</span></div></CardContent></Card>
          <p className="text-xs text-muted-foreground">O prazo selecionado é um alerta operacional configurável nesta tela, não um SLA clínico definido. O custo soma apenas exames com preço de custo preenchido; coletas sem esse dado não entram na soma.</p>
        </>
      )}
    </section>
  );
}
