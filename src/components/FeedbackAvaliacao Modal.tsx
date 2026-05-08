import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FeedbackAvaliacaoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filaId: string;
  pacienteId: string;
  pacienteNome: string;
  medicoId: string;
  medicoNome: string;
}

export function FeedbackAvaliacaoModal({
  open,
  onOpenChange,
  filaId,
  pacienteId,
  pacienteNome,
  medicoId,
  medicoNome,
}: FeedbackAvaliacaoModalProps) {
  const [notaGeral, setNotaGeral] = useState(0);
  const [notaAtendimento, setNotaAtendimento] = useState(0);
  const [notaHigiene, setNotaHigiene] = useState(0);
  const [notaTempoEspera, setNotaTempoEspera] = useState(0);
  const [recomendaria, setRecomendaria] = useState<boolean | null>(null);
  const [comentarios, setComentarios] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (notaGeral === 0) {
      toast.error('Por favor, avalie a consulta');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('avaliacoes_atendimento').insert({
        fila_id: filaId,
        paciente_id: pacienteId,
        medico_id: medicoId,
        nota_geral: notaGeral,
        nota_atendimento: notaAtendimento || null,
        nota_higiene: notaHigiene || null,
        nota_tempo_espera: notaTempoEspera || null,
        recomendaria: recomendaria,
        comentarios: comentarios.trim() || null,
      });

      if (error) throw error;

      toast.success('Obrigado pela avaliação! 🙏');
      onOpenChange(false);

      // Reset form
      setNotaGeral(0);
      setNotaAtendimento(0);
      setNotaHigiene(0);
      setNotaTempoEspera(0);
      setRecomendaria(null);
      setComentarios('');
    } catch (e: any) {
      toast.error('Erro ao enviar avaliação: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const RatingStars = ({
    value,
    onChange,
    label,
  }: {
    value: number;
    onChange: (v: number) => void;
    label: string;
  }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => onChange(star)}
            className="transition-transform hover:scale-110"
            type="button"
          >
            <Star
              className={cn(
                'h-6 w-6 transition-colors',
                star <= value
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-muted-foreground/30'
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );

  const getSatisfactionColor = (nota: number): string => {
    if (nota === 0) return 'text-muted-foreground';
    if (nota <= 2) return 'text-destructive';
    if (nota === 3) return 'text-warning';
    return 'text-success';
  };

  const getSatisfactionText = (nota: number): string => {
    if (nota === 0) return '';
    if (nota <= 2) return '😞 Insatisfeito';
    if (nota === 3) return '😐 Neutro';
    if (nota === 4) return '😊 Satisfeito';
    return '😍 Muito Satisfeito';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Como foi sua consulta?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Header info */}
          <div className="p-3 rounded-lg bg-muted/50 text-center space-y-1">
            <p className="text-sm font-medium">{pacienteNome}</p>
            <p className="text-xs text-muted-foreground">Com {medicoNome}</p>
          </div>

          {/* Nota geral */}
          <div className="space-y-2 p-3 rounded-lg border-2 border-primary/20 bg-primary/5">
            <RatingStars
              value={notaGeral}
              onChange={setNotaGeral}
              label="Avaliação geral da consulta"
            />
            {notaGeral > 0 && (
              <p className={cn('text-sm font-medium', getSatisfactionColor(notaGeral))}>
                {getSatisfactionText(notaGeral)}
              </p>
            )}
          </div>

          {/* Detalhes opcionais */}
          {notaGeral > 0 && (
            <div className="space-y-3">
              <RatingStars
                value={notaAtendimento}
                onChange={setNotaAtendimento}
                label="Qualidade do atendimento"
              />
              <RatingStars
                value={notaHigiene}
                onChange={setNotaHigiene}
                label="Higiene do consultório"
              />
              <RatingStars
                value={notaTempoEspera}
                onChange={setNotaTempoEspera}
                label="Tempo de espera"
              />

              {/* Recomendaria */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">
                  Você recomendaria este médico?
                </Label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={recomendaria === true ? 'default' : 'outline'}
                    onClick={() => setRecomendaria(true)}
                    className="flex-1"
                  >
                    👍 Sim
                  </Button>
                  <Button
                    size="sm"
                    variant={recomendaria === false ? 'destructive' : 'outline'}
                    onClick={() => setRecomendaria(false)}
                    className="flex-1"
                  >
                    👎 Não
                  </Button>
                </div>
              </div>

              {/* Comentários */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Deixe um comentário (opcional)
                </Label>
                <Textarea
                  placeholder="Sua opinião nos ajuda a melhorar..."
                  value={comentarios}
                  onChange={(e) => setComentarios(e.target.value)}
                  className="h-20 resize-none text-sm"
                />
              </div>

              {/* Alert if low rating */}
              {notaGeral <= 2 && (
                <Card className="border-destructive/20 bg-destructive/5">
                  <CardContent className="pt-3 pb-3">
                    <p className="text-xs text-destructive">
                      Desculpe por sua experiência. Enviaremos seu feedback à clínica para melhorrias.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Pular
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || notaGeral === 0}
            className="gap-2"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              '✓'
            )}
            Enviar Avaliação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
