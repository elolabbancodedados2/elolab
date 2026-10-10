# Etapa incremental — hero e estado de erro

## Escopo aprovado

- Trocar o mockup montado à mão no hero por uma imagem clínica já existente no repositório, sem números ou nomes de pacientes de demonstração.
- Refinar a hierarquia visual do estado de erro reutilizável do app sem alterar seu texto, chamadas de retry, dados ou integrações.

## Execução

1. Cobrir a imagem/ausência dos exemplos fictícios e a semântica/retry do estado de erro com testes de componente.
2. Atualizar somente `LandingPage.tsx` e `ErrorState.tsx` para a mudança visual; nenhuma alteração em APIs, autenticação, WhatsApp, Supabase, migrations ou cobrança.
3. Rodar testes focados e a suíte local, checagens de tipos/build/lint disponíveis; abrir as prévias localmente e registrar evidências.

## Limites

- Não publicar, deployar, usar serviços reais, aplicar migrations ou acessar contas de paciente.
- Imagem existente identificada como ilustração genérica de recepção; não representa cliente nem resultado do produto.
