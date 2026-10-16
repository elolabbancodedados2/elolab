import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { GradientWaveText } from "./gradient-wave-text";

const WHATSAPP_URL = "https://wa.me/5511937687369";

const faqItems: Array<{ q: string; a: ReactNode }> = [
  {
    q: "Consigo usar o EloLab pelo celular?",
    a: "Sim. O EloLab funciona em celular, tablet e computador direto pelo navegador, sem baixar nada na loja de aplicativos. Você ainda pode instalá-lo na tela inicial e usar como um app comum.",
  },
  {
    q: "Como funciona o teste grátis?",
    a: "Escolha um plano e confira as condições exibidas no checkout. Quando houver teste gratuito, o checkout informa a duração, o valor e a data da primeira cobrança recorrente antes da confirmação. Cancele antes dessa data se não quiser seguir com a assinatura.",
  },
  {
    q: "Os dados dos meus pacientes ficam seguros?",
    a: (
      <>
        O sistema aplica separação de dados por clínica e permissões por perfil. Consulte a{" "}
        <Link to="/politica-privacidade" className="inline-flex min-h-10 items-center font-semibold text-elolab-blue underline underline-offset-4">Política de Privacidade</Link>{" "}
        para saber como os dados são tratados e confirme com a equipe os procedimentos de backup e recuperação vigentes.
      </>
    ),
  },
  {
    q: "Consigo trazer os dados do meu sistema atual?",
    a: "Você pode importar pacientes e agendamentos por planilha em Configurações. Para outros dados, fale com a equipe antes de contratar para confirmar formato, escopo, prazo e custo.",
  },
  {
    q: "O EloLab atende laboratórios também?",
    a: "Sim, nos planos que incluem exames. O fluxo reúne coletas, identificação das amostras por código único e histórico de movimentações, além da conferência e liberação de resultados em laudos PDF. A liberação pode gerar o lançamento financeiro do exame; os lotes TISS são transmitidos à operadora por um canal externo.",
  },
  {
    q: "Existe limite de usuários por clínica?",
    a: "Há limites de equipe definidos por plano e configuração. Confira os limites vigentes na proposta antes de contratar.",
  },
  {
    q: "Como funciona o suporte no dia a dia?",
    a: "Os canais de contato são WhatsApp e e-mail. Horários, treinamento e prazos de resposta devem ser confirmados na proposta comercial.",
  },
];

function FaqItem({ q, a, index }: { q: string; a: ReactNode; index: number }) {
  const [open, setOpen] = useState(false);
  const panelId = `faq-resposta-${index}`;
  return (
    <div className="border-b border-elolab-blue/10 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="group flex w-full items-center justify-between gap-4 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-elolab-blue"
      >
        <span className="font-inter text-base font-semibold text-elolab-navy">{q}</span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-elolab-blue transition-transform duration-300", open && "rotate-180")} aria-hidden="true" />
      </button>
      <div id={panelId} hidden={!open} className="pb-5">
        <p className="font-inter text-sm leading-relaxed text-elolab-navy/70">{a}</p>
      </div>
    </div>
  );
}

export default function FaqSection() {
  return (
    <section id="faq" className="relative scroll-mt-24 bg-background px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center">
          <GradientWaveText as="h2" align="center" inView once={false} repeat speed={0.75} className="font-inter text-3xl font-medium leading-[1.04] tracking-[-0.045em] text-elolab-navy sm:text-4xl">
            Perguntas frequentes
          </GradientWaveText>
          <p className="mt-3 font-inter text-sm text-elolab-navy/65 sm:text-base">Respostas diretas para decidir com tranquilidade.</p>
        </div>
        <div className="rounded-3xl border border-elolab-blue/10 bg-white/85 p-6 shadow-[0_24px_65px_rgba(10,34,55,0.08)] backdrop-blur md:p-8">
          {faqItems.map((item, index) => <FaqItem key={item.q} q={item.q} a={item.a} index={index} />)}
        </div>
        <p className="mt-8 text-center font-inter text-sm text-elolab-navy/65">
          Ficou com alguma dúvida?{" "}
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-bold text-elolab-blue hover:underline">
            Fale agora com um especialista no WhatsApp
          </a>
        </p>
      </div>
    </section>
  );
}
