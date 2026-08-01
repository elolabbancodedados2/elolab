/**
 * DESATIVADA — substituída pela admin-contas.
 *
 * Trocava a senha de QUALQUER conta do sistema mediante uma senha compartilhada
 * (`ADMIN_TOOL_SECRET`) enviada no corpo do pedido. Quem soubesse o segredo
 * assumia qualquer conta — inclusive a do dono da plataforma — e de lá lia
 * prontuário de paciente. Um segredo assim vaza pelo caminho comum: histórico
 * de terminal, log de erro, backup de .env, mensagem antiga.
 *
 * Agravantes:
 *   - não sabia QUEM estava pedindo, só que a senha batia;
 *   - não deixava registro nenhum da troca;
 *   - `email_confirm: true` de brinde, confirmando um e-mail que talvez nunca
 *     tenha sido verificado;
 *   - nada no app a chamava — só existia para uso manual.
 *
 * A substituta autoriza por identidade (o JWT da sessão, conferido contra
 * platform_admins), registra toda tentativa em admin_acoes e recusa agir sobre
 * a própria conta ou sobre outro dono da plataforma.
 *
 * Mantida como stub em vez de apagada para que o slug continue visível em
 * revisão: apagar o arquivo não tira a função do ar, e este endpoint segue
 * publicado. Enquanto ele responder 410, o segredo antigo não vale mais nada.
 */
Deno.serve(() =>
  new Response(
    JSON.stringify({
      error: 'Função desativada. Use o Painel Admin — as ferramentas de conta ficam em admin-contas.',
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  ),
);
