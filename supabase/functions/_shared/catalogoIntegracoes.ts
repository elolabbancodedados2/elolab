/**
 * Integrações que a CLÍNICA conecta com a própria conta/credencial.
 *
 * Para liberar uma nova integração: acrescente uma entrada aqui (a tela de
 * Configurações → Integrações é montada a partir deste catálogo) e use
 * `credencialDaClinica(service, clinicaId, '<id>')` na função que fala com o
 * fornecedor.
 *
 * Campos `publico: true` ficam em `config` (visíveis na tela); os demais são
 * segredos e vão cifrados para `segredo_cifrado` como JSON.
 *
 * Integrações da PLATAFORMA (Brevo, IA, assinatura no Mercado Pago, chave de
 * parceiro da Memed) não entram aqui: usam variável de ambiente.
 */
export interface CampoIntegracao {
  id: string;
  rotulo: string;
  tipo: 'texto' | 'segredo' | 'selecao';
  publico?: boolean;
  obrigatorio?: boolean;
  opcoes?: Array<{ valor: string; rotulo: string }>;
  ajuda?: string;
}

export interface IntegracaoDisponivel {
  id: string;
  nome: string;
  descricao: string;
  /** 'clinica' = uma por clínica; 'profissional' = uma por médico (referencia_id). */
  escopo: 'clinica' | 'profissional';
  campos: CampoIntegracao[];
  documentacao?: string;
}

export const CATALOGO_INTEGRACOES: IntegracaoDisponivel[] = [
  // A primeira integração entra aqui assim que houver credencial de parceiro
  // (ex.: Memed — escopo 'profissional', token do prescritor gerado pelo
  // servidor a partir do cadastro do médico).
];

export function integracaoDoCatalogo(id: string) {
  return CATALOGO_INTEGRACOES.find((i) => i.id === id) ?? null;
}
