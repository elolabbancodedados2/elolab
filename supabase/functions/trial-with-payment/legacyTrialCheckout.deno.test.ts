import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { legacyTrialCheckoutResponse } from './legacyTrialCheckout.ts'

Deno.test('retired trial checkout returns 410 without processing a request', async () => {
  const response = legacyTrialCheckoutResponse(new Request('https://api.elolab.com.br/trial-with-payment', {
    method: 'POST',
    headers: { origin: 'https://app.elolab.com.br' },
    body: JSON.stringify({ plano: 'elolab-ultra' }),
  }))

  assertEquals(response.status, 410)
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), 'https://app.elolab.com.br')
  assertEquals((await response.json()).error, 'Este checkout foi desativado. Entre ou crie sua conta para continuar pelo checkout seguro.')
})
