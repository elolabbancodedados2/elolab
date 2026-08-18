import { test, expect } from '@playwright/test';

/**
 * Varredura de TODOS os módulos do sistema.
 *
 * Os testes de navegação que existiam cobriam 5 rotas públicas e terminavam em
 * `expect(body).toBeTruthy()` — ou seja, passavam mesmo com a tela em branco.
 * Nenhum dos ~60 módulos autenticados era visitado, então um erro de render em
 * qualquer um deles chegava em produção sem ninguém notar.
 *
 * Aqui, para cada rota:
 *   1. a página não pode responder 5xx
 *   2. não pode estourar exceção não capturada (pageerror) — é isso que faz o
 *      módulo aparecer em branco ou cair na tela de erro
 *   3. rota protegida sem sessão precisa levar para /auth, não renderizar
 *
 * Sem sessão não dá para exercitar as regras de negócio de cada módulo; isso
 * fica nos testes unitários. O que esta suíte prova é que nenhum módulo quebra
 * ao carregar e que nenhum deles vaza tela para quem não está logado.
 */

/** Rotas que qualquer visitante pode ver. */
const ROTAS_PUBLICAS = [
  '/',
  '/auth',
  '/planos',
  '/politica-privacidade',
  '/politica-cookies',
  '/termos-uso',
];

/** Todos os módulos autenticados, por área do sistema. */
const MODULOS_PROTEGIDOS: Array<{ area: string; rotas: string[] }> = [
  {
    area: 'Atendimento',
    rotas: ['/dashboard', '/agenda', '/fila', '/recepcao', '/gestao-fluxo', '/chat'],
  },
  {
    area: 'Pacientes e clínica',
    rotas: [
      '/pacientes', '/retornos', '/convenios', '/prontuarios',
      '/documentos-clinicos', '/exames', '/vitais-graficos',
    ],
  },
  {
    area: 'Laboratório',
    rotas: ['/laboratorio', '/mapa-coleta', '/guias-externas', '/laudos-lab'],
  },
  {
    area: 'Financeiro',
    rotas: [
      '/financeiro', '/contas', '/fluxo-caixa', '/precos-servicos',
      '/relatorios', '/relatorios/salvos', '/cobranca-inadimplentes', '/pagamentos',
      '/faturamento-convenios',
    ],
  },
  {
    area: 'Operacional e administração',
    rotas: [
      '/equipe', '/estoque', '/todos-templates', '/tarefas', '/analytics',
      '/analise-preditiva', '/agente-ia', '/automacoes', '/configuracoes',
      '/configuracoes-avancadas', '/lgpd-pacientes', '/seguranca',
    ],
  },
];

/**
 * Erros de console que não indicam defeito do módulo: falha de rede contra o
 * Supabase é esperada aqui, já que a suíte roda sem sessão.
 */
function ehRuidoDeRede(texto: string): boolean {
  return (
    texto.includes('Failed to fetch') ||
    texto.includes('net::') ||
    texto.includes('401') ||
    texto.includes('403') ||
    texto.includes('Unauthorized') ||
    texto.includes('JWT')
  );
}

test.describe('Módulos — nenhum quebra ao carregar', () => {
  for (const rota of ROTAS_PUBLICAS) {
    test(`público ${rota} renderiza conteúdo`, async ({ page }) => {
      const excecoes: string[] = [];
      page.on('pageerror', (e) => excecoes.push(e.message));

      const resposta = await page.goto(rota);
      expect(resposta?.status(), `${rota} respondeu ${resposta?.status()}`).toBeLessThan(500);
      await page.waitForLoadState('networkidle');

      expect(excecoes, `${rota} estourou exceção: ${excecoes.join(' | ')}`).toHaveLength(0);

      // Tela em branco é falha: o teste antigo passava com body vazio.
      await expect.poll(async () => {
        const texto = (await page.textContent('body')) ?? '';
        return texto.trim().length;
      }, { message: `${rota} renderizou tela em branco`, timeout: 15_000 }).toBeGreaterThan(50);
    });
  }

  for (const { area, rotas } of MODULOS_PROTEGIDOS) {
    for (const rota of rotas) {
      test(`${area} — ${rota} exige login e não quebra`, async ({ page }) => {
        const excecoes: string[] = [];
        page.on('pageerror', (e) => excecoes.push(e.message));

        const resposta = await page.goto(rota);
        expect(resposta?.status(), `${rota} respondeu ${resposta?.status()}`).toBeLessThan(500);
        await page.waitForLoadState('networkidle');

        // A autenticação consulta o Supabase de forma assíncrona. Em CI, quatro
        // workers podem concluir `networkidle` antes de o provider terminar de
        // resolver a sessão; aguardar a URL evita confundir latência externa
        // com uma rota pública. Se o redirect realmente não ocorrer, o timeout
        // continua falhando o teste.
        await page.waitForURL(
          url => ['/auth', '/', '/login'].includes(url.pathname),
          { timeout: 15_000 },
        );

        expect(excecoes, `${rota} estourou exceção: ${excecoes.join(' | ')}`).toHaveLength(0);

        // Sem sessão o destino tem que ser a tela de login ou a landing —
        // nunca o módulo em si.
        const url = new URL(page.url());
        expect(
          ['/auth', '/', '/login'].includes(url.pathname),
          `${rota} não redirecionou para login (parou em ${url.pathname})`,
        ).toBe(true);
      });
    }
  }
});

test.describe('Recepção em tablet', () => {
  // A recepção costuma trabalhar em tablet; a tela não pode rolar na horizontal.
  const tamanhos = [
    { nome: 'tablet retrato', width: 768, height: 1024 },
    { nome: 'tablet paisagem', width: 1024, height: 768 },
    { nome: 'celular', width: 375, height: 667 },
  ];

  for (const { nome, width, height } of tamanhos) {
    test(`${nome} (${width}px) não rola na horizontal`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/auth');
      await page.waitForLoadState('networkidle');

      const larguraDoConteudo = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(
        larguraDoConteudo,
        `conteúdo tem ${larguraDoConteudo}px numa tela de ${width}px`,
      ).toBeLessThanOrEqual(width + 1);
    });
  }
});
