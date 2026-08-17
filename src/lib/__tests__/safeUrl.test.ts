import { checkoutUrlSeguro, storageUrlSeguro } from '@/lib/safeUrl';

describe('safeUrl', () => {
  it('aceita somente checkout HTTPS do Mercado Pago', () => {
    expect(checkoutUrlSeguro('https://www.mercadopago.com.br/checkout/v1/redirect')).toContain('mercadopago.com.br');
    expect(checkoutUrlSeguro('https://evil.example/?next=mercadopago.com.br')).toBeNull();
    expect(checkoutUrlSeguro('javascript:alert(1)')).toBeNull();
    expect(checkoutUrlSeguro('http://mercadopago.com.br/inseguro')).toBeNull();
  });

  it('aceita somente o host configurado do Supabase Storage', () => {
    expect(storageUrlSeguro('https://gebygucrpipaufrlyqqj.supabase.co/storage/v1/object/sign/laudos/a.pdf')).toContain('/storage/');
    expect(storageUrlSeguro('https://outro.supabase.co/storage/v1/object/a.pdf')).toBeNull();
  });
});
