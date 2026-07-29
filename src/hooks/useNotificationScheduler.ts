import { supabase } from '@/integrations/supabase/client'

/**
 * A fila de notificações é processada exclusivamente pelo agendador (cron) no
 * servidor. A edge function `process-notification-queue` recusa chamadas do
 * navegador com 403, então o antigo agendador no cliente só gerava erros a
 * cada 2 minutos no console. Mantido como no-op para não quebrar imports.
 */
export function useNotificationScheduler() {
  // no-op: processamento roda no cron do servidor
}

/**
 * Manual trigger for notification processing
 * Useful for testing or manual intervention
 */
export async function triggerNotificationProcessing() {
  try {
    const response = await supabase.functions.invoke('process-notification-queue', {
      method: 'POST',
    })

    if (response.error) {
      throw new Error(response.error.message)
    }

    return response.data
  } catch (e) {
    console.error('Error processing notifications:', e)
    throw e
  }
}
