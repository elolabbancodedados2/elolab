# Agente de QA do EloLab

O agente usa Playwright para avaliar o frontend do ponto de vista de quem usa o EloLab. Ele verifica se a publicação corresponde ao build local, captura páginas em celular, tablet e desktop, registra problemas de leitura e acessibilidade, e percorre jornadas públicas e áreas da clínica.

## Ordem de execução

1. Gere a versão que será publicada: `npm run build`.
2. Publique exatamente o conteúdo de `dist/` produzido nesse build.
3. Confirme que `https://app.elolab.com.br/version.json` apresenta o mesmo `build_id` de `dist/version.json`.
4. Configure as contas exclusivas de QA no ambiente local e rode `npm run test:qa`.

O runner interrompe a bateria se a versão publicada e a versão local não forem iguais. As contas e senhas são lidas só do ambiente; não entram no Git nem nos relatórios. O agente exige uma clínica vazia e exclusiva para QA para não abrir dados reais de pacientes.

## Configuração local

No PowerShell, defina as variáveis na sessão atual. Use cinco contas de teste da mesma clínica: uma administradora e uma para cada perfil. Não salve senhas em arquivo do projeto.

```powershell
$env:QA_BASE_URL = 'https://app.elolab.com.br'
$env:QA_ALLOW_REMOTE = '1'
$env:QA_ALLOW_PRODUCTION = '1'
$env:QA_DEDICATED_CLINIC = '1'
$env:E2E_ADMIN_EMAIL = '...'
$env:E2E_ADMIN_SENHA = '...'
$env:E2E_MEDICO_EMAIL = '...'
$env:E2E_MEDICO_SENHA = '...'
$env:E2E_RECEPCAO_EMAIL = '...'
$env:E2E_RECEPCAO_SENHA = '...'
$env:E2E_ENFERMAGEM_EMAIL = '...'
$env:E2E_ENFERMAGEM_SENHA = '...'
$env:E2E_FINANCEIRO_EMAIL = '...'
$env:E2E_FINANCEIRO_SENHA = '...'
npm run test:qa
```

Para homologação, troque `QA_BASE_URL` e remova `QA_ALLOW_PRODUCTION`. O valor `QA_ALLOW_REMOTE=1` continua necessário.

## O que a bateria faz

- Confere build publicado, landing, login, arquivos e cabeçalhos.
- Faz uma revisão visual da landing, login, redefinição de senha e planos em celular (375px), tablet (768px) e desktop (1440px).
- Guarda capturas e um JSON por tela com overflow, botões sem nome, campos sem rótulo, textos muito pequenos e alvos de toque reduzidos. Os apontamentos heurísticos orientam a revisão visual; não substituem a inspeção humana.
- Testa validação vazia do login e confirma que ela não envia uma chamada de autenticação.
- Verifica que cadastro de cliente não pede código de convite e que os campos aparecem com rótulos claros.
- Verifica os cinco perfis em rotas permitidas e bloqueadas.
- Entra pelo formulário de login da clínica de QA e navega pelos módulos principais.
- Abre as rotas protegidas sem sessão para confirmar que não mostram telas privadas.

O agente não cria, edita ou apaga pacientes, consultas, cobranças, mensagens ou contas. Também não envia e-mails de recuperação. Operações de CRUD precisam de uma etapa própria, com dados sintéticos identificáveis e limpeza limitada à clínica de QA.

Playwright salva relatório HTML, traces, capturas visuais e achados em `playwright-report/` e `test-results/`. Revise esses arquivos antes de compartilhá-los. O smoke de produção só é ativado pelo runner após confirmar o mesmo `build_id`; a suíte E2E normal de PR fica no servidor local.
