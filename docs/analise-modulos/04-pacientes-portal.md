# Módulo 4: Pacientes + Portal do Paciente + Agendamento público

Análise de 03/11/2026, feita sobre `origin/main`.

## Situação atual

- **Tamanho:** `Pacientes.tsx` tem 3118 linhas. `PortalPaciente.tsx` tem 2201. A função `patient-portal` tem 762 linhas e 21 ações; `public-booking` tem 337.
- **O que já existe no portal:** remarcar, cancelar e confirmar consulta; laudos com link assinado de 300 s; documentos; receitas; NPS; lista de espera.
- **Envio do acesso ao portal:** leva cerca de 7 passos (`PatientPortalLinkPage.tsx:117-146`).
- **Login:** pede para digitar um código de 64 caracteres hex (`PortalPaciente.tsx:133-157`).

## Escopo aprovado (03/11)

Toda migration fica só no repositório e **não é aplicada**. Use `20261103400000_...` em diante, idempotente, com `BEGIN/COMMIT`. Toda mudança de edge function é feita apenas no repositório. Testes SQL ficam em `supabase/verificacoes/portal-20261103.sql`, rodando em transação com ROLLBACK.

### Segurança

1. **Tokens por laudo.** Liberar um laudo não pode criar um token novo de 1 ano sem revogar os anteriores.
   - Opção preferida: o e-mail do laudo leva um link sem token, que manda para a página de acesso do portal.
   - Opção alternativa: o token do trigger vale 7 dias e revoga o token anterior que o trigger criou.
   - Pontos no código: `20260817200000_...:171` e `20261011010000_...:39-46`.
   - *Aceite:* um teste SQL libera 3 laudos e confere que fica no máximo 1 token ativo de trigger, com validade de até 7 dias.
2. **Token no fragmento.** O link gerado passa a usar `#token=` (`20261011010000_...:56`). A página lê o fragmento e continua aceitando `?token=` durante a transição (`PortalPaciente.tsx:352,1052-1060`).
3. **Perfil sem dados internos.** `get_profile` e `update_contact` deixam de devolver `observacoes`, e o CPF sai mascarado do servidor no formato `***.***.***-NN` (`patient-portal/index.ts:84,97,133,149`).
4. **Remover o token legado.** Retirar o fallback de token em texto puro (`patient-portal/index.ts:90-102`). *Aceite:* um teste unitário prova que um token legado recebe 401. **Antes de publicar, conferir em produção se ainda existem linhas legadas.** Esse passo fica com o Claude.
5. **Exportação CSV de pacientes.** Fica só para admin. Cada exportação grava `logAudit` com a quantidade de linhas. O CPF sai mascarado, a não ser que o admin marque "incluir CPF completo" (`Pacientes.tsx:855-872,1708`).
6. **Agendamento público (`public-booking/index.ts:254-305`).**
   - Conferir os pendentes antes de gravar o aceite.
   - Criar a ficha e o aceite dentro da mesma RPC atômica do pedido.
   - Se o CPF já existe com outro telefone, não gravar aceite na ficha existente: marcar o pedido como "confirmar identidade" para a recepção.
7. **Log de acesso ao portal.** Nova tabela `portal_acessos`, com RLS e leitura só pela clínica e por admin. Registra ação, IP, data/hora e o hash ou id do token. A função grava em cada ação do portal (`patient-portal/index.ts:123-127`).
8. **Segundo fator e validade.**
   - No primeiro acesso por link em um aparelho, o paciente confirma a data de nascimento. Depois de 5 erros, o token fica bloqueado por 15 minutos.
   - O aparelho fica lembrado por um cookie ou valor local, assinado.
   - Links novos valem 90 dias; os links existentes mantêm a validade atual.
   - Atualizar o texto do termo e da ajuda do portal.

### Experiência de uso

9. **Enviar acesso em 3 cliques.** A tela do link ganha os botões "Enviar por WhatsApp" (wa.me, com o telefone do cadastro e mensagem pronta) e "Enviar por e-mail". Também mostra se o link está ativo e quando foi o último acesso.
10. **Login compreensível.** Sai o "Digite seu código" e entra o texto "Abra o link que a clínica enviou pelo WhatsApp ou e-mail", com o botão "Pedir novo link", que abre o WhatsApp da clínica. O campo de código continua, mas recolhido em "Tenho um código".
11. **Possível duplicado na ficha.** Para admin, a ficha mostra a faixa "Possível duplicado de X", com o botão "Comparar e mesclar". Usa a RPC `buscar_possiveis_duplicidades_paciente`, que já existe (`Pacientes.tsx:1174`).
12. **Modo simples no celular.** O início do portal mostra 3 botões grandes: Próxima consulta, Exames e receitas, Falar com a clínica. Texto com pelo menos 16 px. No agendamento online, o dia não usa mais `text-[10px]` (`PortalPaciente.tsx:1479-1506`, `AgendamentoOnline.tsx:478`).
13. **Acento corrompido.** Corrigir a mensagem "?ndice de p?gina inv?lido" (`patient-portal/index.ts:70`).

### Função nova

14. **Check-in online.** No dia da consulta, o portal mostra os botões "Estou a caminho" e "Cheguei".
    - "Cheguei" coloca o paciente na Recepção como aguardando confirmação do balcão. Não gera cobrança nem faz o check-in definitivo.
    - O botão só aparece dentro de uma janela de 2h antes até 30min depois do horário.
    - É uma nova ação em `patient-portal`, refletida em `receptionWorkflow`.

## Fora deste lote

Pré-cadastro e questionário pré-consulta, foto da carteirinha, responsável com dependentes, pedidos LGPD de eliminação e portabilidade (exigem validação jurídica) e Pix (parado aguardando decisão).
