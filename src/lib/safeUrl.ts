const MERCADO_PAGO_DOMAINS = ['mercadopago.com', 'mercadopago.com.br'];

function hostnamePermitido(hostname: string, dominios: string[]) {
  const normalizado = hostname.toLowerCase();
  return dominios.some((dominio) => normalizado === dominio || normalizado.endsWith(`.${dominio}`));
}

export function checkoutUrlSeguro(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && hostnamePermitido(url.hostname, MERCADO_PAGO_DOMAINS)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function storageUrlSeguro(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const supabaseUrl = new URL(import.meta.env.VITE_SUPABASE_URL || 'https://gebygucrpipaufrlyqqj.supabase.co');
    return url.protocol === 'https:' && url.hostname === supabaseUrl.hostname ? url.href : null;
  } catch {
    return null;
  }
}

export function redirecionarParaCheckout(value: unknown) {
  const url = checkoutUrlSeguro(value);
  if (!url) throw new Error('O checkout retornou um endereço não confiável');
  window.location.assign(url);
}

export function abrirUrlSegura(value: unknown, validar: (value: unknown) => string | null) {
  const url = validar(value);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
