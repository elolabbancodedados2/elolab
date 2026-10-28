import { ArrowUp, ArrowUpRight, Mail } from "lucide-react";
import Logo from "./Logo";

const linkClass = "inline-flex min-h-10 items-center gap-2 rounded-sm text-sm text-background/80 transition-colors hover:text-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

export default function Footer() {
  const appUrl = /^(www\.)?elolab\.com\.br$/.test(window.location.hostname)
    ? "https://app.elolab.com.br"
    : "";

  return (
    <footer className="relative bg-foreground px-5 font-inter text-background sm:px-8 lg:px-10">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-card/10" />
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-x-10 gap-y-9 py-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.2fr] lg:py-16">
          <div>
            <a href="#top" aria-label="EloLab — voltar ao início" className="inline-flex min-h-10 items-center rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
              <Logo className="[&>span]:text-background" />
            </a>
            <p className="mt-5 max-w-[270px] text-sm leading-relaxed text-background/80">
              Toda a clínica. Em um só fluxo.
              <br />
              Tecnologia para conectar sua equipe e simplificar o cuidado.
            </p>
          </div>

          <nav aria-label="Produto no rodapé">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-background">Conheça a EloLab</h2>
            <ul>
              <li><a className={linkClass} href="#about">Sobre a EloLab</a></li>
              <li><a className={linkClass} href="#recursos">Recursos</a></li>
              <li><a className={linkClass} href="#elo-ia">Assistente Elo</a></li>
              <li><a className={linkClass} href="#planos">Planos e preços</a></li>
            </ul>
          </nav>

          <nav aria-label="Acesso no rodapé">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-background">Sua conta</h2>
            <ul>
              <li><a className={linkClass} href={`${appUrl}/auth`}>Entrar no app <ArrowUpRight size={14} aria-hidden="true" /></a></li>
              <li><a className={linkClass} href={`${appUrl}/auth?cadastro=1`}>Criar conta</a></li>
              <li><a className={linkClass} href="/demonstracao">Conhecer o sistema</a></li>
            </ul>
          </nav>

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-background">Vamos conversar</h2>
            <a className={`${linkClass} break-all`} href="mailto:contato@elolab.com.br">
              <Mail size={16} className="shrink-0 text-background" aria-hidden="true" />
              contato@elolab.com.br
            </a>
            <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-background/80">Conheça a EloLab e encontre o próximo passo para sua clínica.</p>
            <a className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-background/40 px-5 text-sm font-medium text-background transition-colors hover:bg-background/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" href="mailto:contato@elolab.com.br?subject=Agendar%20demonstra%C3%A7%C3%A3o%20EloLab">
              Agendar demonstração <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-background/15 py-6 text-xs sm:gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-background/70">© {new Date().getFullYear()} EloLab. Todos os direitos reservados.</p>
          <nav aria-label="Informações legais" className="flex flex-wrap gap-x-5 gap-y-1">
            <a className={`${linkClass} text-xs`} href="/politica-privacidade">Política de privacidade</a>
            <a className={`${linkClass} text-xs`} href="/termos-uso">Termos de uso</a>
            <a className={`${linkClass} text-xs`} href="/politica-cookies">Cookies</a>
          </nav>
          <a href="#top" className={`${linkClass} self-start text-xs lg:self-auto`}>Voltar ao topo <ArrowUp size={14} aria-hidden="true" /></a>
        </div>
      </div>
    </footer>
  );
}
