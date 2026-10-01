import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Copy, ExternalLink, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useMedicos } from '@/hooks/useSupabaseData';
import { lerConfigsClinica, salvarConfigClinica } from '@/lib/configClinica';

interface ConfigAgendamentoOnline {
  ativo: boolean;
  mensagem: string;
  dias_antecedencia: number;
  /** Vazio = todos os médicos com disponibilidade cadastrada. */
  medicos: string[];
}

const PADRAO: ConfigAgendamentoOnline = { ativo: false, mensagem: '', dias_antecedencia: 30, medicos: [] };

export function AgendamentoOnlineConfig() {
  const { user, profile } = useSupabaseAuth();
  const clinicaId = profile?.clinica_id;
  const queryClient = useQueryClient();
  const { data: medicos = [], isLoading: carregandoMedicos } = useMedicos();
  const [cfg, setCfg] = useState<ConfigAgendamentoOnline>(PADRAO);
  const [diasAntecedenciaInput, setDiasAntecedenciaInput] = useState(String(PADRAO.dias_antecedencia));
  const [salvando, setSalvando] = useState(false);

  const { data: salvo, isLoading } = useQuery({
    queryKey: ['config-agendamento-online', clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => (await lerConfigsClinica(clinicaId!, ['agendamento_online'])).agendamento_online ?? null,
  });
  useEffect(() => {
    const proxima = { ...PADRAO, ...salvo };
    setCfg(proxima);
    setDiasAntecedenciaInput(String(proxima.dias_antecedencia));
  }, [salvo]);

  const link = clinicaId ? `${window.location.origin}/agendar/${clinicaId}` : '';

  const salvar = async () => {
    if (!clinicaId || !user) return;
    setSalvando(true);
    try {
      await salvarConfigClinica({ clinicaId, userId: user.id, chave: 'agendamento_online', valor: cfg });
      queryClient.invalidateQueries({ queryKey: ['config-agendamento-online'] });
      toast.success(cfg.ativo ? 'Agendamento online ativado' : 'Configuração salva');
    } catch (e: any) {
      toast.error('Não foi possível salvar', { description: e?.message });
    } finally {
      setSalvando(false);
    }
  };

  const alternarMedico = (id: string, marcado: boolean) =>
    setCfg((c) => ({ ...c, medicos: marcado ? [...c.medicos, id] : c.medicos.filter((m) => m !== id) }));
  const todosMedicos = medicos as any[];
  const medicosInativosSalvos = cfg.medicos.filter((id) => !todosMedicos.some((m) => m.id === id && m.ativo));
  const idsSemCadastro = medicosInativosSalvos.filter((id) => !todosMedicos.some((m) => m.id === id));

  const copiarLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Área de transferência indisponível');
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado');
    } catch {
      toast.error('Não foi possível copiar o link', { description: 'Selecione e copie o endereço manualmente.' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><CalendarCheck className="h-4 w-4 text-primary" />Agendamento online</CardTitle>
        <CardDescription>
          Um link para o paciente marcar consulta sozinho (site, Instagram, WhatsApp). Os pedidos entram na agenda como
          "agendado" para a recepção confirmar. Só aparecem horários livres da disponibilidade de cada médico.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <p className="font-medium">Receber agendamentos pelo link</p>
                <p className="text-xs text-muted-foreground">Desligado, o link mostra que a clínica não está recebendo agendamentos online.</p>
              </div>
              <Switch checked={cfg.ativo} onCheckedChange={(v) => setCfg((c) => ({ ...c, ativo: v }))} aria-label="Ativar agendamento online" />
            </div>

            <div className="space-y-1.5">
              <Label>Link da clínica</Label>
              <div className="flex gap-2">
                <Input readOnly value={link} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" aria-label="Copiar link"
                  onClick={copiarLink}><Copy className="h-4 w-4" /></Button>
                <Button type="button" variant="outline" size="icon" aria-label="Abrir link" asChild>
                  <a href={link} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ag-dias">Agendar com até quantos dias de antecedência</Label>
                <Input id="ag-dias" type="number" min={1} max={180} value={diasAntecedenciaInput}
                  onChange={(e) => setDiasAntecedenciaInput(e.target.value)}
                  onBlur={() => {
                    const dias = Math.min(180, Math.max(1, Number(diasAntecedenciaInput) || 1));
                    setCfg((c) => ({ ...c, dias_antecedencia: dias }));
                    setDiasAntecedenciaInput(String(dias));
                  }} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ag-msg">Mensagem no topo da página (opcional)</Label>
                <Textarea id="ag-msg" rows={2} maxLength={300} value={cfg.mensagem}
                  placeholder="Ex.: Atendemos convênios Unimed e particular. Chegue 15 minutos antes."
                  onChange={(e) => setCfg((c) => ({ ...c, mensagem: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Profissionais no link</Label>
              {carregandoMedicos ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
                <>
                  <p className="text-xs text-muted-foreground">Nenhum marcado = todos os médicos ativos com disponibilidade cadastrada.</p>
                  {medicosInativosSalvos.length > 0 && (
                    <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-800 dark:text-amber-200">
                      Há profissional(is) selecionado(s) que estão inativo(s) ou sem cadastro. Eles não aparecem no link público.
                      Remover a última seleção faz o link incluir todos os médicos ativos.
                    </p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {todosMedicos.filter((m) => m.ativo || cfg.medicos.includes(m.id)).map((m) => (
                      <label key={m.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                        <Checkbox checked={cfg.medicos.includes(m.id)} onCheckedChange={(v) => alternarMedico(m.id, v === true)} />
                        <span className="truncate">{m.nome}{m.especialidade ? ` · ${m.especialidade}` : ''}{!m.ativo ? ' (inativo)' : ''}</span>
                      </label>
                    ))}
                    {idsSemCadastro.map((id) => (
                      <label key={id} className="flex items-center gap-2 rounded-md border border-amber-500/30 p-2 text-sm">
                        <Checkbox checked onCheckedChange={(v) => alternarMedico(id, v === true)} />
                        <span className="truncate">Profissional sem cadastro ({id.slice(0, 8)})</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            <Button onClick={salvar} disabled={salvando} className="gap-2">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
