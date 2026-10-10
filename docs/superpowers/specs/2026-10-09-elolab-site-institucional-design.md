# EloLab site institucional — direção e critérios

## Objetivo

Elevar o site institucional do EloLab a uma apresentação premium e confiável para clínicas e laboratórios, mantendo a identidade de marca existente, informações verificáveis, fluxos de conversão reais e compatibilidade com a aplicação atual.

## Contexto observado

- `src/App.tsx` seleciona o modo institucional pelos hosts `elolab.com.br` e `www.elolab.com.br`; `/` renderiza `src/pages/LandingPage.tsx`.
- A landing reúne apresentação de módulos, benefícios, planos consultados via `usePlanos`, perguntas frequentes e links de conversão. Usa um conjunto grande de imagens em `src/assets`.
- `index.html` contém título, descrição, canonical, Open Graph, Twitter Card e JSON-LD `SoftwareApplication`.
- `public/robots.txt` é parte da configuração existente. Os cabeçalhos da aplicação são aplicados pelo Nginx em `docker/security-headers.conf`.
- O projeto descreve a marca com azul-teal/verde, Inter e Plus Jakarta Sans; ativos EloLab já existem no repositório.

## Direção de design

Usar linguagem institucional editorial apropriada a uma plataforma de gestão clínica: humana, serena, precisa e contemporânea. Preservar logotipo, paleta e tipografia existentes; compor imagens e capturas reais disponíveis com intenção, evitando imagens genéricas, depoimentos inventados, estatísticas sem fonte e mockups que sugiram funcionalidades ausentes. Dar prioridade a hierarquia tipográfica, ritmo de leitura, conteúdo concreto, demonstração honesta do produto e chamadas para ações já suportadas.

No mobile, rever a composição e ordem de conteúdo para leitura e ação com uma mão, em vez de apenas comprimir o desktop. Motion deve ser discreto, funcional, respeitar `prefers-reduced-motion` e não atrasar conteúdo.

## Escopo

- Avaliar e melhorar hero, navegação, apresentação de produto, planos/FAQ, CTAs e rodapé dentro das funções e textos verificáveis já existentes.
- Rever responsividade, contraste, foco, landmarks, semântica, links e estados interativos.
- Rever metadados, headings, canonical, dados estruturados, indexação, carregamento de fontes/imagens e peso de recursos, preservando configuração compatível com o app.
- Usar assets existentes; geração de imagens só se uma lacuna concreta justificar e a ferramenta real estiver disponível.

## Fora de escopo

- Inventar depoimentos, clientes, resultados, garantias, funcionalidades, preços ou condições.
- Alterar autenticação, checkout, contratos de API, dados, integrações ou o financeiro de pacientes.
- Deploy, alterações de DNS, publicação, mudança em produção ou aplicação de migrations.
- Substituir a marca ou incluir imagens de terceiros sem procedência/licença verificada.

## Critérios de aceite

1. O fluxo institucional existente permanece acessível nos hosts e links suportados; CTAs preservam destinos e comportamento atuais.
2. A página tem hierarquia editorial clara e identidade EloLab consistente, sem padrões repetitivos de template.
3. Composição é utilizável a 375 px, tablet e desktop, sem overflow horizontal nem controles inacessíveis.
4. Teclado, foco visível, nomes acessíveis, contraste suficiente e movimento reduzido foram verificados.
5. SEO técnico é coerente com o domínio e com o conteúdo real; nenhum schema ou metadado afirma fatos não comprovados.
6. Build e verificações pertinentes passam; preview local foi inspecionado e evidências/pendências ficam registradas.

## Restrições de trabalho

Trabalhar apenas localmente. Preservar alterações preexistentes, particularmente arquivos de WhatsApp, integração Supabase, migration, `docker/evolution/` e o plano não rastreado já presente em `docs/superpowers/plans/`. Não ler ou expor credenciais.
