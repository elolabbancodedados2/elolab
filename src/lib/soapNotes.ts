/**
 * SOAP Notes Structure for Clinical Documentation
 * Subjetivo, Objetivo, Avaliação, Plano
 * Padrão clínico reconhecido internacionalmente
 */

export interface SOAPNote {
  subjetivo: {
    queixa_principal: string;
    historia_doenca_atual: string;
    historia_pessoal: string;
    medicacoes_atuais: string;
    alergias: string;
  };
  objetivo: {
    pressao_arterial?: string;
    frequencia_cardiaca?: number;
    temperatura?: number;
    frequencia_respiratoria?: number;
    peso?: number;
    exame_fisico: string;
  };
  avaliacao: {
    diagnosticos_principais: string[]; // CID-10 codes
    diagnosticos_diferenciais: string[];
    resumo_avaliacao: string;
  };
  plano: {
    investigacoes: string; // Exames pedidos
    tratamento: string; // Prescrições
    orientacoes: string;
    follow_up: string;
    encaminhamentos: string;
  };
  notas_adicionais?: string;
}

/**
 * Validar SOAP note completo
 */
export function validateSOAPNote(note: SOAPNote): {
  isValid: boolean;
  missingFields: string[];
} {
  const required = [
    'subjetivo.queixa_principal',
    'subjetivo.historia_doenca_atual',
    'objetivo.exame_fisico',
    'avaliacao.diagnosticos_principais',
    'avaliacao.resumo_avaliacao',
    'plano.tratamento',
    'plano.follow_up',
  ];

  const missingFields: string[] = [];

  for (const field of required) {
    const [section, key] = field.split('.');
    const value = (note as any)[section]?.[key];

    if (!value || (typeof value === 'string' && value.trim().length === 0)) {
      missingFields.push(field);
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Converter SOAP para texto formatado
 */
export function formatSOAPNote(note: SOAPNote): string {
  return `
═══════════════════════════════════════════════════════════
                        PRONTUÁRIO CLÍNICO
═══════════════════════════════════════════════════════════

SUBJETIVO (S):
─────────────────────────────────────────────────────────
Queixa Principal:
${note.subjetivo.queixa_principal}

História da Doença Atual:
${note.subjetivo.historia_doenca_atual}

Antecedentes Pessoais:
${note.subjetivo.historia_pessoal || 'Negados'}

Medicações Atuais:
${note.subjetivo.medicacoes_atuais || 'Nenhuma'}

Alergias:
${note.subjetivo.alergias || 'Negadas'}

OBJETIVO (O):
─────────────────────────────────────────────────────────
Sinais Vitais:
  • Pressão Arterial: ${note.objetivo.pressao_arterial || 'N/A'}
  • Frequência Cardíaca: ${note.objetivo.frequencia_cardiaca || 'N/A'} bpm
  • Temperatura: ${note.objetivo.temperatura || 'N/A'} °C
  • Frequência Respiratória: ${note.objetivo.frequencia_respiratoria || 'N/A'} rpm
  • Peso: ${note.objetivo.peso || 'N/A'} kg

Exame Físico:
${note.objetivo.exame_fisico}

AVALIAÇÃO (A):
─────────────────────────────────────────────────────────
Diagnósticos Principais:
${note.avaliacao.diagnosticos_principais.map(d => `  • ${d}`).join('\n')}

Diagnósticos Diferenciais:
${note.avaliacao.diagnosticos_diferenciais.map(d => `  • ${d}`).join('\n')}

Resumo da Avaliação:
${note.avaliacao.resumo_avaliacao}

PLANO (P):
─────────────────────────────────────────────────────────
Investigações (Exames):
${note.plano.investigacoes}

Tratamento (Prescrições):
${note.plano.tratamento}

Orientações ao Paciente:
${note.plano.orientacoes}

Acompanhamento:
${note.plano.follow_up}

Encaminhamentos:
${note.plano.encaminhamentos || 'Nenhum'}

${note.notas_adicionais ? `NOTAS ADICIONAIS:\n${note.notas_adicionais}` : ''}

═══════════════════════════════════════════════════════════
Documento gerado digitalmente - ${new Date().toLocaleString('pt-BR')}
═══════════════════════════════════════════════════════════
  `;
}

/**
 * Exportar SOAP como JSON para arquivo
 */
export function exportSOAPAsJSON(note: SOAPNote, filename: string = 'soap_note.json') {
  const dataStr = JSON.stringify(note, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
