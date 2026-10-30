import { describe, expect, it } from 'vitest';
import { getReceptionReturnPath } from '../receptionReturnPath';

describe('retorno das tarefas da recepção', () => {
  it('mantém a rota e a aba atuais da recepção', () => {
    expect(getReceptionReturnPath('/recepcao?tab=caixa', null)).toBe('/recepcao?tab=caixa');
    expect(getReceptionReturnPath('/recepcao', { returnTo: '/recepcao?tab=caixa' })).toBe('/recepcao');
  });

  it('recupera a aba de origem ao retornar de uma tarefa própria', () => {
    expect(getReceptionReturnPath('/recepcao/encaixe', { returnTo: '/recepcao?tab=caixa' })).toBe('/recepcao?tab=caixa');
  });

  it('recusa destinos externos ou parâmetros não permitidos', () => {
    expect(getReceptionReturnPath('/recepcao/pagamentos/1', { returnTo: 'https://example.com' })).toBe('/recepcao');
    expect(getReceptionReturnPath('/recepcao/encaixe', { returnTo: '/recepcao?tab=admin' })).toBe('/recepcao');
  });
});
