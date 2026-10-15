export function legacyPublicCheckoutResponse(headers: HeadersInit): Response {
  return new Response(JSON.stringify({
    error: 'Este checkout foi desativado. Entre ou crie sua conta para continuar pelo checkout seguro.',
  }), {
    status: 410,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
