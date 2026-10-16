import {
  BellRing,
  Bot,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  FileText,
  ListChecks,
  Signature,
  UsersRound,
  Video,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { GradientWaveText } from "./gradient-wave-text";
import { LogosCarousel } from "./logos-carousel";

const CAPABILITIES: { label: string; Icon: LucideIcon }[] = [
  { label: "Agenda e agendamento online", Icon: CalendarDays },
  { label: "Fila e triagem", Icon: ListChecks },
  { label: "Prontuário eletrônico", Icon: FileText },
  { label: "Prescrições e exames", Icon: ClipboardList },
  { label: "Teleconsulta", Icon: Video },
  { label: "Assistente Elo com IA", Icon: Bot },
  { label: "Lembretes e confirmações", Icon: BellRing },
  { label: "Financeiro e repasses", Icon: Wallet },
  { label: "Relatórios e indicadores", Icon: ChartNoAxesCombined },
  { label: "Gestão de equipe", Icon: UsersRound },
  { label: "Assinatura digital", Icon: Signature },
];

export default function AppCapabilitiesSection() {
  return (
    <section
      id="recursos"
      aria-labelledby="app-capabilities-title"
      className="app-capabilities"
    >
      <div className="app-capabilities__intro">
        <p className="app-capabilities__eyebrow">Funções do aplicativo EloLab</p>
        <GradientWaveText
          id="app-capabilities-title"
          as="h2"
          inView
          once={false}
          repeat
          speed={0.7}
          className="app-capabilities__title"
        >
          Da agenda ao financeiro, tudo conectado.
        </GradientWaveText>
        <p className="app-capabilities__description">
          Agendamento, atendimento e gestão clínica em um só fluxo.
        </p>
      </div>

      <LogosCarousel count={2} className="app-capabilities__group">
        {CAPABILITIES.map(({ label, Icon }) => (
          <span className="app-capability" key={label}>
            <span className="app-capability__icon">
              <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
            </span>
            {label}
          </span>
        ))}
      </LogosCarousel>
    </section>
  );
}
