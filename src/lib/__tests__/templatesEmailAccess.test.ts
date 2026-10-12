import { describe, expect, it } from 'vitest';
import { podeGerenciarTemplatesEmail } from '@/lib/templatesEmailAccess';

describe('permissão de gestão de modelos de e-mail', () => {
  it('permite gestão para perfil administrador', () => {
    expect(podeGerenciarTemplatesEmail({ role: 'admin', roles: ['admin'] })).toBe(true);
  });

  it('não oferece gestão para perfil médico', () => {
    expect(podeGerenciarTemplatesEmail({ role: 'medico', roles: ['medico'] })).toBe(false);
  });

  it('aceita administrador quando ele consta na lista de papéis do perfil', () => {
    expect(podeGerenciarTemplatesEmail({ role: 'medico', roles: ['medico', 'admin'] })).toBe(true);
  });
});
