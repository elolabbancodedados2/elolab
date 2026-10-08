# Instruções para agentes (Codex, Claude Code)

- Trabalho em andamento: checkout Mercado Pago dos planos. Leia [`docs/MERCADOPAGO_CHECKOUT_HANDOFF.md`](docs/MERCADOPAGO_CHECKOUT_HANDOFF.md) antes de mexer em cobrança de planos.
- Credenciais ficam em `supabase/functions/.env.local` (fora do git) e nos secrets do Supabase. Nunca grave, imprima ou commite valores.
- Mercado Pago: valide decisões na documentação oficial (`https://www.mercadopago.com.br/developers/pt/docs/<página>.md` retorna markdown) e teste só com credenciais de usuário de teste (`npm run test:mp-sandbox`).
- Não faça deploy, não aplique migration e não altere produção sem pedido explícito do responsável.
- Não altere o módulo financeiro de pacientes (`pagamentos_mercadopago`, `lancamentos`) ao trabalhar na cobrança dos planos.
- O Git converte quebras de linha (`core.autocrlf=true`): arquivos podem estar em CRLF no disco; normalize antes de substituir texto por script.
