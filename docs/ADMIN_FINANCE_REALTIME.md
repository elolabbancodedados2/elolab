# Painel financeiro da plataforma

## Produção em 12/10/2026

- Foi aplicada a migration `20261010196000_historico_de_faturas_da_plataforma`, ausente no banco de produção. A tabela de faturas recorrentes foi criada e a RPC do histórico passou a responder; não havia faturas do Mercado Pago para importar.
- A migration `20261012100000_admin_finance_realtime` habilita os eventos Realtime para clínicas, assinaturas, pedidos, faturas, eventos, webhooks e cadastros pendentes. As páginas de clínicas, cobranças e histórico financeiro invalidam suas consultas ao receber eventos e mantêm polling de 30 segundos como contingência.
- InovaLab e Monte Sinai foram mantidas no Ultra como pré-pagas, com acesso até 01/11/2026 no horário de São Paulo, com base na confirmação de recebimento do responsável. Não foram criadas assinaturas recorrentes nem cobranças do Mercado Pago. Essa atualização de acesso não registra comprovante, método, data ou valor em um livro-caixa manual.
- Cinco clínicas ativas sem conta proprietária foram arquivadas de forma reversível. Os dados clínicos e financeiros permanecem preservados; uma sexta clínica órfã já estava arquivada.
- `payment-reminder` identifica o dia civil em `America/Sao_Paulo` e enfileira um lembrete para assinaturas pré-pagas no próprio dia, deduplicado por assinatura e data. O cron executa diariamente às 08:00 UTC; o processador de notificações roda a cada cinco minutos. A rota foi validada sem disparar e-mail.

## Limites atuais

- As credenciais Mercado Pago instaladas continuam em sandbox. O painel não consegue confirmar recebimentos externos nem contabilizar valores que não vieram pelo gateway.
- A tela “Histórico financeiro” acompanha alterações de assinatura e MRR; ela não representa recebimentos. A tabela `platform_subscription_invoices` é somente o histórico de faturas recorrentes do Mercado Pago.
- Pix e boleto são pagamentos únicos; cartão, no fluxo atual, cria uma assinatura recorrente. Clientes pré-pagos não precisam cadastrar um meio agora e podem escolher Pix ou boleto no checkout; cartão só pode ser escolhido com autorização de recorrência.
- A validação do lembrete cobriu o fuso, a janela de data e a rota da função. Nenhum e-mail real foi enviado como teste.
