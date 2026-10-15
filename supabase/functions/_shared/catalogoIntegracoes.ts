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
  /**
   * Integrações sem campo nenhum para o admin preencher: o status é só
   * informativo, gravado automaticamente pela função que fala com o
   * fornecedor (ex.: Memed, ao registrar o prescritor). A tela não oferece
   * "Conectar" nem "Desconectar" para elas.
   */
  somenteStatus?: boolean;
}

export const CATALOGO_INTEGRACOES: IntegracaoDisponivel[] = [
  {
    id: 'mercado_pago',
    nome: 'Mercado Pago',
    descricao: 'Conecte opcionalmente a conta da clínica para usar terminais Point e consultar vendas. A conta não é necessária para usar o financeiro do EloLab.',
    escopo: 'clinica',
    campos: [],
    documentacao: 'https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation',
  },
  {
    id: 'memed',
    nome: 'Memed (prescrição digital)',
    descricao: 'Registro automático do médico como prescritor na Memed. Conecta sozinho na primeira prescrição feita por ele; não precisa de nenhuma credencial aqui.',
    escopo: 'profissional',
    campos: [],
    somenteStatus: true,
  },
];

export function integracaoDoCatalogo(id: string) {
  return CATALOGO_INTEGRACOES.find((i) => i.id === id) ?? null;
}
