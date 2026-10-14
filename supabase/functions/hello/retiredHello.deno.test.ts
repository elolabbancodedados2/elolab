import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { retiredHelloResponse } from './retiredHello.ts'

Deno.test('retired sample endpoint returns 404 without exposing runtime errors', async () => {
  const response = retiredHelloResponse(new Request('https://api.elolab.com.br/hello'))

  assertEquals(response.status, 404)
  assertEquals((await response.json()).error, 'Endpoint nao encontrado')
})
