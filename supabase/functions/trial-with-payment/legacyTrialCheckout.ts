import { corsPadrao } from '../_shared/cors.ts'
import { legacyPublicCheckoutResponse } from '../_shared/legacyPublicCheckout.ts'

export function legacyTrialCheckoutResponse(req: Request): Response {
  const corsHeaders = corsPadrao(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metodo nao permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' },
    })
  }

  return legacyPublicCheckoutResponse(corsHeaders)
}
