import { Link } from 'react-router-dom';

/**
 * Links para as páginas legais, dentro do app.
 *
 * Elas existiam e tinham rota, mas só eram alcançáveis pela landing page e pelo
 * aviso de cookies. Quem já estava logado — a clínica inteira, todo dia — não
 * tinha caminho nenhum para a política de privacidade.
 *
 * A LGPD trata o aviso de privacidade como informação que precisa estar
 * disponível ao titular, não escondida atrás de um logout. E quando um paciente
 * pergunta "como vocês tratam meus dados?", a recepcionista precisa achar isso
 * sem sair do sistema.
 */
const PAGINAS = [
  { para: '/politica-privacidade', texto: 'Política de Privacidade' },
  { para: '/termos-uso', texto: 'Termos de Uso' },
  { para: '/politica-cookies', texto: 'Política de Cookies' },
];

export function RodapeLegal() {
  return (
    <footer className="mt-10 border-t pt-5 pb-2">
      <nav
        aria-label="Links legais"
        className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
      >
        {PAGINAS.map((p) => (
          <Link
            key={p.para}
            to={p.para}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {p.texto}
          </Link>
        ))}
      </nav>
      <p className="mt-3 text-center text-xs text-muted-foreground/70">
        EloLab — dados de saúde tratados conforme a Lei 13.709/2018 (LGPD)
      </p>
    </footer>
  );
}
