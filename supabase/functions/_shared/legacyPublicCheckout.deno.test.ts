import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { legacyPublicCheckoutResponse } from './legacyPublicCheckout.ts'

Deno.test('legacy public plan checkout is permanently retired', async () => {
  const response = legacyPublicCheckoutResponse({ 'Access-Control-Allow-Origin': 'https://elolab.com.br' })
  const body = await response.json()

  assertEquals(response.status, 410)
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), 'https://elolab.com.br')
  assertEquals(body.error, 'Este checkout foi desativado. Entre ou crie sua conta para continuar pelo checkout seguro.')
})
