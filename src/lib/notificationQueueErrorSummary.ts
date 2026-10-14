const FALHA_GENERICA = 'Falha no processamento do envio. Consulte o suporte da clínica.';

/** Converte erro de provedor em categoria segura; nunca devolve o texto original. */
export function resumirErroFilaNotificacao(erro: string | null | undefined): string {
  const normalizado = erro?.trim().toLocaleLowerCase('pt-BR') ?? '';
  if (!normalizado) return FALHA_GENERICA;

  if (/limite mensal/.test(normalizado)) return 'O limite mensal de envios da clínica foi atingido.';
  if (/^(brevo_api_key não configurada|evolution_api_url\/key não configurados)$/.test(normalizado)) {
    return 'A integração do canal está incompleta. Revise as configurações da clínica.';
  }
  if (/nenhuma sessão whatsapp conectada/.test(normalizado)) {
    return 'Nenhuma sessão do WhatsApp está conectada.';
  }
  if (/resultado do provedor incerto|aceitou o envio.*status local|confira o provedor/.test(normalizado)) {
    return 'O resultado do provedor é incerto. Confira antes de repetir o envio.';
  }
  if (/brevo\s+http\s+429/.test(normalizado)) {
    return 'O provedor de e-mail limitou os envios. Tente novamente mais tarde.';
  }
  if (/evolution(?:\s+http)?\s+429/.test(normalizado)) {
    return 'O provedor de WhatsApp limitou os envios. Tente novamente mais tarde.';
  }
  if (/brevo\s+http\s+\d{3}/.test(normalizado)) {
    return 'O provedor de e-mail recusou ou não confirmou o envio. Consulte o suporte.';
  }
  if (/evolution(?:\s+http)?\s+\d{3}/.test(normalizado)) {
    return 'O provedor de WhatsApp recusou o envio. Revise o canal e o destinatário.';
  }
  if (/sem destinatário válido|canal .* não suportado/.test(normalizado)) {
    return 'O canal ou destinatário não está válido para este envio.';
  }
  return FALHA_GENERICA;
}
