import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'

/**
 * Initialize notification processing scheduler
 * Runs process-notifications edge function every 2 minutes
 */
export function useNotificationScheduler() {
  useEffect(() => {
    // Run immediately on startup
    const processNotifications = async () => {
      try {
        const response = await supabase.functions.invoke('process-notifications', {
          method: 'POST',
        })

        if (response.error) {
          console.error('Notification processing error:', response.error)
        } else {
          console.log('Notifications processed:', response.data)
        }
      } catch (e) {
        console.error('Error calling notification processor:', e)
      }
    }

    // Call immediately
    processNotifications()

    // Then set up interval to run every 2 minutes
    const interval = setInterval(processNotifications, 2 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])
}

/**
 * Manual trigger for notification processing
 * Useful for testing or manual intervention
 */
export async function triggerNotificationProcessing() {
  try {
    const response = await supabase.functions.invoke('process-notifications', {
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
