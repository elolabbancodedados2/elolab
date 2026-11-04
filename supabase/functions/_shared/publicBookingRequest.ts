export function cadastroPedidoOnline(body: Record<string, unknown>, ip: string) {
  if (body.aceite_lgpd !== true) throw new Error('É preciso aceitar o uso dos dados para o agendamento.');
  return {
    nome: String(body.nome || '').trim().replace(/\s+/g, ' ').slice(0, 120),
    cpf: String(body.cpf || '').replace(/\D/g, ''),
    telefone: String(body.telefone || '').trim().slice(0, 30),
    email: String(body.email || '').trim().toLowerCase().slice(0, 160),
    data_nascimento: String(body.data_nascimento || '') || null,
    aceite_lgpd: true,
    versao_termo: 'agendamento-online-2026-11-02',
    ip_aceite: ip && ip !== 'unknown' ? ip : null,
  };
}
