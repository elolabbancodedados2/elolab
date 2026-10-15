import { corsPadrao } from '../_shared/cors.ts'

export function retiredHelloResponse(req: Request): Response {
  return new Response(JSON.stringify({ error: 'Endpoint nao encontrado' }), {
    status: 404,
    headers: { ...corsPadrao(req), 'Content-Type': 'application/json' },
  })
}
