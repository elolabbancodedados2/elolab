/**
 * A guia de exames não tem tabela própria: cada exame guarda em `descricao`
 * as linhas montadas no envio ("Indicação Clínica: …", "Validade: até …").
 * Estas funções leem esse texto de volta para reimprimir ou repetir a guia.
 */
export interface DadosGuiaGravada {
  indicacaoClinica?: string;
  hipoteseDiagnostica?: string;
  urgencia: 'Normal' | 'Urgente' | 'Emergência';
  justificativaUrgencia?: string;
  jejum?: string;
  /** yyyy-MM-dd, quando a validade foi registrada. */
  validade?: string;
}

function valorDaLinha(linhas: string[], rotulo: string): string | undefined {
  const prefixo = `${rotulo}:`;
  const linha = linhas.find(item => item.toLocaleLowerCase('pt-BR').startsWith(prefixo.toLocaleLowerCase('pt-BR')));
  const valor = linha?.slice(prefixo.length).trim();
  return valor || undefined;
}

export function lerDadosDaGuia(descricao?: string | null): DadosGuiaGravada {
  const linhas = (descricao ?? '').split('\n').map(linha => linha.trim()).filter(Boolean);
  const urgenciaTexto = (valorDaLinha(linhas, 'Urgência') ?? '').toLocaleLowerCase('pt-BR');
  const validadeTexto = valorDaLinha(linhas, 'Validade');
  const data = validadeTexto && /(\d{2})\/(\d{2})\/(\d{4})/.exec(validadeTexto);
  return {
    indicacaoClinica: valorDaLinha(linhas, 'Indicação Clínica'),
    hipoteseDiagnostica: valorDaLinha(linhas, 'Hipótese Diagnóstica'),
    urgencia: urgenciaTexto.startsWith('emerg') ? 'Emergência' : urgenciaTexto.startsWith('urg') ? 'Urgente' : 'Normal',
    justificativaUrgencia: valorDaLinha(linhas, 'Justificativa'),
    jejum: valorDaLinha(linhas, 'Jejum'),
    validade: data ? `${data[3]}-${data[2]}-${data[1]}` : undefined,
  };
}
