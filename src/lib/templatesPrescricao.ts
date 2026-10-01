/**
 * Modelos de prescrição guardam `medicamentos` como JSON. O formato gravado
 * pela tela de Templates é uma lista de linhas de texto, mas registros antigos
 * (ou importados) podem trazer objetos { medicamento/nome, dosagem, posologia,
 * duracao }. Estas funções aceitam os dois.
 */
export function medicamentosParaLinhas(medicamentos: unknown): string[] {
  if (!Array.isArray(medicamentos)) return [];
  return medicamentos
    .map((m) => {
      if (typeof m === 'string') return m.trim();
      if (m && typeof m === 'object') {
        const o = m as Record<string, unknown>;
        const nome = String(o.medicamento ?? o.nome ?? '').trim();
        const resto = [o.dosagem, o.posologia, o.duracao].filter((v) => typeof v === 'string' && v.trim()).join(' — ');
        return [nome, resto].filter(Boolean).join(' — ');
      }
      return '';
    })
    .filter(Boolean);
}

export function textoParaMedicamentos(texto: string): string[] {
  return texto.split('\n').map((l) => l.trim()).filter(Boolean);
}

/** Texto pronto para a receita: medicamentos numerados + observações gerais. */
export function textoDoModelo(modelo: { medicamentos: unknown; observacoes_gerais?: string | null }): string {
  const linhas = medicamentosParaLinhas(modelo.medicamentos).map((l, i) => (/^\d+\)/.test(l) ? l : `${i + 1}) ${l}`));
  const obs = modelo.observacoes_gerais?.trim();
  return [linhas.join('\n'), obs ? `\nObservações: ${obs}` : ''].filter(Boolean).join('\n');
}
