import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, GitMerge, Loader2, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ErrorState } from '@/components/ErrorState';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/formatters';
import { mensagemDeErro } from '@/lib/erros';
import {
  MERGE_FIELDS, describeDuplicateReasons, diffPatientFields, dismissPatientDuplicate,
  listPatientDuplicates, mergePatients, type DuplicatePair, type MergeField,
} from '@/lib/patientMerge';

const LIMIARES = [
  { valor: '100', rotulo: 'Somente CPF igual (100)' },
  { valor: '70', rotulo: 'Nome e nascimento ou mais (70)' },
  { valor: '40', rotulo: 'Inclui telefone compartilhado (40)' },
  { valor: '20', rotulo: 'Inclui mesmo nome (20)' },
];

const COLUNAS_FICHA: string = ['id', 'created_at', ...MERGE_FIELDS.map(f => f.campo)].join(',');

type Ficha = Record<string, unknown> & { id: string; nome: string; created_at?: string | null };

function valorLegivel(campo: MergeField, valor: unknown): string {
  if (valor === null || valor === undefined || String(valor).trim() === '') return '—';
  if (campo === 'convenio_id') return 'Convênio vinculado';
  if (campo === 'data_nascimento' || campo === 'validade_carteira') return formatDate(String(valor), 'short');
  return String(valor);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMesclado: () => void;
}

export function RevisaoDuplicidadesDialog({ open, onOpenChange, onMesclado }: Props) {
  const [limiar, setLimiar] = useState('70');
  const [par, setPar] = useState<DuplicatePair | null>(null);
  const [fichas, setFichas] = useState<[Ficha, Ficha] | null>(null);
  const [destinoIndex, setDestinoIndex] = useState<0 | 1>(0);
  const [usarOrigem, setUsarOrigem] = useState<Set<MergeField>>(new Set());
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const pares = useQuery({
    queryKey: ['duplicidades-pacientes', limiar],
    queryFn: () => listPatientDuplicates(Number(limiar)),
    enabled: open,
  });

  const voltar = () => { setPar(null); setFichas(null); setUsarOrigem(new Set()); setMotivo(''); };

  const abrirPar = async (item: DuplicatePair) => {
    setOcupado(true);
    try {
      const { data, error } = await supabase
        .from('pacientes')
        .select(COLUNAS_FICHA)
        .in('id', [item.paciente_a, item.paciente_b]);
      if (error) throw error;
      const a = (data as unknown as Ficha[] | null)?.find(p => p.id === item.paciente_a);
      const b = (data as unknown as Ficha[] | null)?.find(p => p.id === item.paciente_b);
      if (!a || !b) throw new Error('Um dos cadastros não está mais disponível.');
      // Mantém por padrão a ficha mais antiga, que costuma concentrar o histórico.
      setDestinoIndex(String(a.created_at ?? '') <= String(b.created_at ?? '') ? 0 : 1);
      setFichas([a, b]);
      setPar(item);
    } catch (error) {
      toast.error(mensagemDeErro(error));
    } finally {
      setOcupado(false);
    }
  };

  const descartar = async (item: DuplicatePair) => {
    setOcupado(true);
    try {
      await dismissPatientDuplicate(item.paciente_a, item.paciente_b);
      toast.success('Par marcado como pessoas diferentes.');
      voltar();
      await pares.refetch();
    } catch (error) {
      toast.error(mensagemDeErro(error));
    } finally {
      setOcupado(false);
    }
  };

  const destino = fichas?.[destinoIndex];
  const origem = fichas?.[destinoIndex === 0 ? 1 : 0];
  const diferencas = destino && origem ? diffPatientFields(destino, origem) : [];
  const motivoValido = motivo.trim().length >= 10 && motivo.trim().length <= 500;

  const mesclar = async () => {
    if (!destino || !origem || !motivoValido) return;
    setOcupado(true);
    try {
      const resultado = await mergePatients({
        origemId: origem.id,
        destinoId: destino.id,
        campos: diferencas.filter(d => usarOrigem.has(d.campo)).map(d => d.campo),
        motivo,
      });
      const preservados = Object.values(resultado.referencias_preservadas ?? {}).reduce((total, n) => total + n, 0);
      toast.success('Cadastros mesclados', {
        description: `${resultado.agendamentos_movidos ?? 0} compromisso(s) futuro(s) e ${resultado.lista_espera_movida ?? 0} pedido(s) de espera migrados. ${preservados} registro(s) históricos continuam na ficha inativada, com autoria preservada.`,
      });
      voltar();
      onMesclado();
      await pares.refetch();
    } catch (error) {
      toast.error(mensagemDeErro(error));
    } finally {
      setOcupado(false);
    }
  };

  const alternarCampo = (campo: MergeField, daOrigem: boolean) => {
    setUsarOrigem(atual => {
      const proximo = new Set(atual);
      if (daOrigem) proximo.add(campo); else proximo.delete(campo);
      return proximo;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) voltar(); onOpenChange(value); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-[#1080CA]" />
            Revisar cadastros duplicados
          </DialogTitle>
          <DialogDescription>
            Pares prováveis da sua clínica. Nada é mesclado sem revisão: escolha a ficha que fica, compare campo a campo e registre o motivo.
          </DialogDescription>
        </DialogHeader>

        {!par && (
          <div className="space-y-3">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <Label htmlFor="limiar-duplicidade" className="text-sm">Sensibilidade</Label>
              <Select value={limiar} onValueChange={setLimiar}>
                <SelectTrigger id="limiar-duplicidade" className="h-10 rounded-full sm:w-80"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIMIARES.map(l => <SelectItem key={l.valor} value={l.valor}>{l.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {pares.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Procurando duplicidades…</p>}
            {pares.error && <ErrorState compact error={pares.error} onRetry={() => { void pares.refetch(); }} />}
            {pares.data && pares.data.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum par acima deste limiar. Diminua a sensibilidade para revisar casos mais fracos.</p>
            )}
            <ul className="space-y-2" aria-label="Pares de cadastros parecidos">
              {pares.data?.map(item => (
                <li key={`${item.paciente_a}-${item.paciente_b}`} className="rounded-2xl border border-border/60 bg-card p-3 shadow-xs">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-0.5 text-sm">
                      <p className="truncate font-medium">{item.nome_a} <span className="text-muted-foreground">e</span> {item.nome_b}</p>
                      <p className="text-xs text-muted-foreground">
                        {describeDuplicateReasons(item.motivos)}
                        {item.nascimento_a ? ` · nasc. ${formatDate(item.nascimento_a, 'short')}` : ''}
                        {item.nascimento_b && item.nascimento_b !== item.nascimento_a ? ` / ${formatDate(item.nascimento_b, 'short')}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className="rounded-full border-[#BFD8EE] tabular-nums text-[#1080CA]">{item.pontuacao} pts</Badge>
                      <Button size="sm" variant="outline" className="h-9 rounded-full text-xs" disabled={ocupado} onClick={() => void abrirPar(item)}>
                        Revisar
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {par && destino && origem && (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Ficha que permanece ativa</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {fichas!.map((ficha, index) => (
                  <button
                    key={ficha.id}
                    type="button"
                    aria-pressed={destinoIndex === index}
                    onClick={() => { setDestinoIndex(index as 0 | 1); setUsarOrigem(new Set()); }}
                    className={`rounded-xl border p-3 text-left text-sm transition-colors ${destinoIndex === index ? 'border-[#1080CA] bg-[#F3F8FC] ring-1 ring-[#1080CA]/30' : 'border-border/60 hover:border-[#9CC7EC]'}`}
                  >
                    <span className="block font-medium">{ficha.nome}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Criada em {ficha.created_at ? formatDate(String(ficha.created_at), 'short') : '—'}
                      {destinoIndex === index ? ' · permanece' : ' · será inativada'}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <p className="text-sm font-medium">Campos diferentes</p>
              {diferencas.length === 0 && <p className="text-xs text-muted-foreground">O cadastro duplicado não traz dados diferentes. Só a ficha será unificada.</p>}
              {diferencas.map(d => (
                <fieldset key={d.campo} className="grid gap-2 rounded-xl border border-border/60 p-2 sm:grid-cols-[9rem_1fr_1fr] sm:items-center">
                  <legend className="sr-only">{d.rotulo}</legend>
                  <span className="text-xs font-medium">{d.rotulo}</span>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="radio" name={`campo-${d.campo}`} checked={!usarOrigem.has(d.campo)} onChange={() => alternarCampo(d.campo, false)} className="accent-[#1080CA]" />
                    <span>Manter: {valorLegivel(d.campo, d.destino)}</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="radio" name={`campo-${d.campo}`} checked={usarOrigem.has(d.campo)} onChange={() => alternarCampo(d.campo, true)} className="accent-[#1080CA]" />
                    <span>Usar do duplicado: {valorLegivel(d.campo, d.origem)}</span>
                  </label>
                </fieldset>
              ))}
            </div>

            <p className="rounded-lg border border-info/30 bg-info/5 px-3 py-2 text-[11px] text-muted-foreground">
              Compromissos futuros e pedidos ativos da lista de espera passam para a ficha que permanece. Prontuários, documentos, exames, financeiro e histórico continuam na ficha inativada, com autoria e assinaturas intactas; os links do portal dela são revogados. Nada é apagado.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="motivo-mesclagem">Motivo da mesclagem</Label>
              <Textarea id="motivo-mesclagem" value={motivo} maxLength={500} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: mesmo titular cadastrado duas vezes na recepção" />
              <p className="text-[11px] text-muted-foreground">Entre 10 e 500 caracteres. Fica na trilha de auditoria.</p>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" className="rounded-full" onClick={voltar} disabled={ocupado}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" className="rounded-full" onClick={() => void descartar(par)} disabled={ocupado}>
                  <UserX className="mr-1 h-4 w-4" /> São pessoas diferentes
                </Button>
                <Button className="rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110" onClick={() => void mesclar()} disabled={ocupado || !motivoValido}>
                  {ocupado ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <GitMerge className="mr-1 h-4 w-4" />}
                  Mesclar cadastros
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
