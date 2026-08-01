import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Wrench, Loader2 } from 'lucide-react';
import { mensagemDeErro } from '@/lib/erros';

interface Estado {
  manutencao: boolean;
  titulo: string;
  mensagem: string;
  previsao_retorno: string | null;
  atualizado_em: string | null;
}

/** ISO -> valor aceito por <input type="datetime-local">, no fuso local. */
function paraCampoLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function InterruptorManutencao() {
  const queryClient = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [previsao, setPrevisao] = useState('');

  const { data: estado, isLoading } = useQuery({
    queryKey: ['plataforma-estado'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('plataforma_estado')
        .select('manutencao, titulo, mensagem, previsao_retorno, atualizado_em')
        .maybeSingle();
      if (error) throw error;
      return data as Estado;
    },
  });

  useEffect(() => {
    if (!estado) return;
    setTitulo(estado.titulo);
    setMensagem(estado.mensagem);
    setPrevisao(paraCampoLocal(estado.previsao_retorno));
  }, [estado]);

  const gravar = async (campos: Record<string, unknown>, aviso: string) => {
    setSalvando(true);
    try {
      // A linha é única; o `neq` de id impossível seria mais frágil que filtrar
      // pela própria chave.
      const { error } = await (supabase as any)
        .from('plataforma_estado').update(campos).eq('id', true);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['plataforma-estado'] });
      toast.success(aviso);
    } catch (e) {
      toast.error('Não consegui salvar.', { description: mensagemDeErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  const ligado = estado?.manutencao === true;

  return (
    <Card className={ligado ? 'border-destructive' : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4" />
          Modo manutenção
          {ligado && <Badge variant="destructive" className="text-xs">LIGADO</Badge>}
        </CardTitle>
        <CardDescription>
          Mostra uma tela cheia para todo mundo e impede o uso do sistema. Você continua com acesso
          normal — é você quem precisa entrar para conferir e desligar depois.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="manutencao" className="text-sm font-medium">
                  {ligado ? 'Sistema bloqueado para os usuários' : 'Sistema liberado'}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {ligado
                    ? 'Ninguém consegue usar o sistema neste momento.'
                    : 'Ligar aqui interrompe o atendimento de todas as clínicas.'}
                </p>
              </div>
              <Switch
                id="manutencao"
                checked={ligado}
                disabled={salvando}
                onCheckedChange={(v) =>
                  gravar(
                    { manutencao: v },
                    v ? 'Manutenção ligada. Os usuários já estão vendo o aviso.'
                      : 'Manutenção desligada. O sistema voltou para todos.',
                  )
                }
              />
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="titulo" className="text-xs">Título do aviso</Label>
                <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mensagem" className="text-xs">Mensagem</Label>
                <Textarea
                  id="mensagem" rows={3} value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="previsao" className="text-xs">
                  Previsão de retorno <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="previsao" type="datetime-local" value={previsao}
                  onChange={(e) => setPrevisao(e.target.value)}
                />
              </div>

              <Button
                variant="outline" size="sm" disabled={salvando}
                onClick={() =>
                  gravar(
                    {
                      titulo, mensagem,
                      previsao_retorno: previsao ? new Date(previsao).toISOString() : null,
                    },
                    'Texto do aviso salvo.',
                  )
                }
              >
                {salvando ? 'Salvando...' : 'Salvar texto'}
              </Button>
            </div>

            {estado?.atualizado_em && (
              <p className="text-xs text-muted-foreground">
                Última alteração: {new Date(estado.atualizado_em).toLocaleString('pt-BR')}
              </p>
            )}

            <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
              <strong>Se esta tela não abrir</strong> e for preciso desligar às pressas, rode no SQL
              Editor do Supabase:{' '}
              <code className="font-mono">update public.plataforma_estado set manutencao = false;</code>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
