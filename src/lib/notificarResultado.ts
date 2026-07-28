import { supabase } from '@/integrations/supabase/client';

/**
 * Notifica o paciente de que um resultado de exame foi liberado, com fila de
 * reenvio quando o envio falha.
 *
 * O BUG QUE ISTO CORRIGE
 * As duas telas de liberação chamavam `supabase.functions.invoke(...)` dentro
 * de try/catch esperando que um erro virasse exceção. Só que `invoke` NÃO
 * lança: devolve `{ data, error }`. Então, quando a edge function falhava, o
 * catch nunca rodava, a variável `notificado` virava true, o laço parava e
 * nada era enfileirado para reenvio — enquanto a tela dizia
 * "paciente notificado!".
 *
 * Na prática: resultado liberado, paciente nunca avisado, e ninguém ficava
 * sabendo. Num laboratório isso é resultado parado esperando alguém ligar.
 */
export async function notificarResultadoLiberado(resultadoId: string): Promise<boolean> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const { error } = await supabase.functions.invoke('exam-result-notification', {
        body: { resultado_id: resultadoId },
      });
      if (!error) return true;
      // erro devolvido (não lançado) — tenta de novo e, na última, enfileira
    } catch {
      // falha de rede: mesmo tratamento
    }
  }

  // Não conseguiu notificar: registra na fila para reenvio posterior
  try {
    const { error } = await supabase.from('notification_queue').insert({
      tipo: 'email',
      status: 'pendente',
      dados_extras: { resultado_id: resultadoId, tipo: 'exam_result' },
      conteudo: `Resultado de exame disponível - ID: ${resultadoId}`,
      assunto: 'Seu resultado de exame está disponível',
    });
    if (error) throw error;
  } catch (e) {
    console.error('Falha ao enfileirar notificação do resultado', resultadoId, e);
  }

  return false;
}
