import { describe, expect, it, vi } from 'vitest';

const audit = vi.hoisted(() => ({ limparAuditoriaPendente: vi.fn() }));
vi.mock('@/lib/auditTrail', () => audit);

import { limparDadosLocaisDoUsuario } from '../limparDadosLocais';

describe('limpeza local ao sair', () => {
  it('remove caixa, abas e relógio de sessão, preservando preferências', async () => {
    localStorage.setItem('caixa_estado_u1', '{"aberto":true}');
    localStorage.setItem('caixa_estado_clinica_c1', '{"aberto":true}');
    localStorage.setItem('elolab_abas_v1_p1', '[{"path":"/pacientes/p1"}]');
    localStorage.setItem('elolab:sessao:ultima-atividade', '123');
    localStorage.setItem('elolab_sidebar_collapsed', 'true');
    sessionStorage.setItem('caixa_estado_u1', 'x');

    await limparDadosLocaisDoUsuario();

    expect(localStorage.getItem('caixa_estado_u1')).toBeNull();
    expect(localStorage.getItem('caixa_estado_clinica_c1')).toBeNull();
    expect(localStorage.getItem('elolab_abas_v1_p1')).toBeNull();
    expect(localStorage.getItem('elolab:sessao:ultima-atividade')).toBeNull();
    expect(sessionStorage.getItem('caixa_estado_u1')).toBeNull();
    expect(localStorage.getItem('elolab_sidebar_collapsed')).toBe('true');
    expect(audit.limparAuditoriaPendente).toHaveBeenCalled();
  });
});
