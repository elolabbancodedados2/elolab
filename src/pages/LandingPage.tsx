import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, Users, FileText, Shield, BarChart3, Stethoscope,
  MessageSquare, ArrowRight, Check,
  Zap, Lock, FlaskConical, Receipt, Menu, X, Phone, Mail,
  Clock, Activity, Pill, ClipboardList, Building2, MonitorPlay,
  BellRing, FileBarChart, Warehouse, CreditCard, UserCheck,
  Microscope, HeartPulse, QrCode, Globe, SmartphoneNfc,
  Crown, ChevronDown, Headphones
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlanos } from '@/hooks/useSubscriptionPlan';
import { GlowingEffect } from '@/components/ui/glowing-effect';
import elolabLogo from '@/assets/elolab-logo-v2.png';
import clinicHero from '@/assets/hero-institutional.webp';
import landingEfficiency from '@/assets/landing-efficiency.webp';
import landingNoshow from '@/assets/landing-noshow.webp';
import landingOnline from '@/assets/landing-online.webp';
import landingEhr from '@/assets/landing-ehr.webp';
import landingFinancial from '@/assets/landing-financial.webp';
import landingSupport from '@/assets/landing-support.webp';
import stripClinica from '@/assets/strip-clinica.webp';
import stripLab from '@/assets/strip-laboratorio.webp';
import stripComunica from '@/assets/strip-comunicacao.webp';
import stripFinanc from '@/assets/strip-financeiro.webp';
import modClinica1 from '@/assets/mod-clinica1.webp';
import modClinica2 from '@/assets/mod-clinica2.webp';
import modClinica3 from '@/assets/mod-clinica3.webp';
import modClinica4 from '@/assets/mod-clinica4.webp';
import modClinica5 from '@/assets/mod-clinica5.webp';
import modClinica6 from '@/assets/mod-clinica6.webp';
import modLab1 from '@/assets/mod-lab1.webp';
import modLab2 from '@/assets/mod-lab2.webp';
import modLab3 from '@/assets/mod-lab3.webp';
import modLab4 from '@/assets/mod-lab4.webp';
import modLab5 from '@/assets/mod-lab5.webp';
import modLab6 from '@/assets/mod-lab6.webp';
import modComunica1 from '@/assets/mod-comunica1.webp';
import modComunica2 from '@/assets/mod-comunica2.webp';
import modComunica3 from '@/assets/mod-comunica3.webp';
import modComunica4 from '@/assets/mod-comunica4.webp';
import modComunica5 from '@/assets/mod-comunica5.webp';
import modComunica6 from '@/assets/mod-comunica6.webp';
import modFinanc1 from '@/assets/mod-financ1.webp';
import modFinanc2 from '@/assets/mod-financ2.webp';
import modFinanc3 from '@/assets/mod-financ3.webp';
import modFinanc4 from '@/assets/mod-financ4.webp';
import modFinanc5 from '@/assets/mod-financ5.webp';
import modFinanc6 from '@/assets/mod-financ6.webp';

/* ─── Colors ─── */
const C = {
  coral: 'hsl(12,76%,61%)',
  grad: 'linear-gradient(135deg, hsl(12,76%,61%), hsl(30,80%,55%))',
  dark: 'hsl(20,25%,18%)',
  text: 'hsl(20,15%,30%)',
  textL: 'hsl(20,10%,50%)',
};

/* ─── Grouped modules ─── */
const moduleGroups = [
  {
    title: 'Gestão Clínica',
    subtitle: 'Organize a rotina de atendimento em um único sistema.',
    strip: stripClinica,
    stripText: 'Gestão Clínica Inteligente',
    modules: [
      { icon: Calendar, title: 'Agenda', desc: 'Organize horários, encaixes, confirmações e disponibilidade da equipe.', img: modClinica1 },
      // Não prometa ICP-Brasil: o sistema não assina com certificado. O que ele
      // faz — e que já é diferencial — é fechar o prontuário para edição com
      // trilha de auditoria, como a CFM 1.821/07 exige.
      { icon: FileText, title: 'Prontuário Eletrônico', desc: 'Registre consultas, identifique o profissional responsável e mantenha o histórico clínico organizado.', img: modClinica2 },
      { icon: Stethoscope, title: 'Documentos clínicos', desc: 'Prepare receitas, atestados e encaminhamentos usando os dados do atendimento.', img: modClinica3 },
      { icon: HeartPulse, title: 'Triagem', desc: 'Registre sinais vitais e classificação de risco integrada à fila de atendimento.', img: modClinica4 },
      { icon: Pill, title: 'Prescrições', desc: 'Prepare prescrições a partir do prontuário e organize os documentos clínicos do paciente.', img: modClinica5 },
      { icon: ClipboardList, title: 'Encaminhamentos', desc: 'Registre e acompanhe encaminhamentos no histórico do paciente.', img: modClinica6 },
    ],
  },
  {
    title: 'Laboratório e Diagnóstico',
    subtitle: 'Acompanhe pedidos, coleta e resultados em um só fluxo.',
    strip: stripLab,
    stripText: 'Laboratório Integrado',
    modules: [
      { icon: FlaskConical, title: 'Laboratório', desc: 'Organize coletas, amostras e resultados ao longo do fluxo do laboratório.', img: modLab1 },
      { icon: Microscope, title: 'Exames & Laudos', desc: 'Registre exames e acompanhe a elaboração e liberação de laudos.', img: modLab2 },
      { icon: Activity, title: 'Sinais Vitais', desc: 'Consulte os sinais vitais do paciente em gráficos por período.', img: modLab3 },
      { icon: Warehouse, title: 'Estoque', desc: 'Acompanhe lotes, saldos e alertas de estoque mínimo.', img: modLab4 },
      { icon: QrCode, title: 'Identificação de amostras', desc: 'Organize a identificação e o acompanhamento das amostras ao longo do fluxo do laboratório.', img: modLab5 },
      { icon: Building2, title: 'Salas e Leitos', desc: 'Consulte a ocupação e a disponibilidade de salas da clínica.', img: modLab6 },
    ],
  },
  {
    title: 'Comunicação e Pacientes',
    subtitle: 'Reúna canais de atendimento e informações dos pacientes.',
    strip: stripComunica,
    stripText: 'Comunicação e Atendimento',
    modules: [
      { icon: MessageSquare, title: 'WhatsApp IA', desc: 'Agente de IA para apoiar o atendimento pelo WhatsApp, sujeito à configuração da integração.', img: modComunica1 },
      { icon: Users, title: 'Gestão de Pacientes', desc: 'Histórico completo à mão, lista de espera ativa e convênios sem dor de cabeça.', img: modComunica2 },
      { icon: Globe, title: 'Portal do Paciente', desc: 'Disponibilize informações e documentos pelo portal do paciente.', img: modComunica3 },
      { icon: MonitorPlay, title: 'Painel TV', desc: 'Chamada em tela na recepção: mais organização e uma imagem muito mais profissional.', img: modComunica4 },
      { icon: BellRing, title: 'Automações', desc: 'Configure rotinas e alertas para apoiar as tarefas da equipe.', img: modComunica5 },
      { icon: SmartphoneNfc, title: 'PWA Mobile', desc: 'Sua clínica no bolso: funciona em qualquer celular, sem baixar nada na loja.', img: modComunica6 },
    ],
  },
  {
    title: 'Financeiro e Gestão',
    subtitle: 'Acompanhe recebimentos, pagamentos e atividades da equipe.',
    strip: stripFinanc,
    stripText: 'Financeiro e Administração',
    modules: [
      { icon: Receipt, title: 'Financeiro', desc: 'Organize caixa, contas a pagar e receber e registros financeiros.', img: modFinanc1 },
      { icon: CreditCard, title: 'Pagamentos Online', desc: 'Acompanhe os pagamentos da clínica e os respectivos registros financeiros.', img: modFinanc2 },
      { icon: FileBarChart, title: 'Relatórios & Analytics', desc: 'Consulte indicadores e exporte relatórios disponíveis no sistema.', img: modFinanc3 },
      { icon: BarChart3, title: 'Dashboard', desc: 'Acompanhe indicadores de atendimento e financeiros da clínica.', img: modFinanc4 },
      { icon: UserCheck, title: 'Gestão de Equipe', desc: 'Convide profissionais e configure perfis de acesso.', img: modFinanc5 },
      { icon: Shield, title: 'Privacidade e auditoria', desc: 'Use controles de acesso e recursos de registro para apoiar os processos de privacidade da clínica.', img: modFinanc6 },
    ],
  },
];

const featureSections = [
  {
    title: 'Organize a operação', highlight: 'da clínica em um só lugar',
    desc: 'O EloLab reúne agenda, atendimento e gestão para ajudar sua equipe a acompanhar a rotina da clínica.',
    desc2: 'Use os fluxos e recursos disponíveis para organizar tarefas recorrentes da equipe.',
    cta: 'Quero simplificar minha clínica', img: landingEfficiency, alt: 'Gestão eficiente', rev: false,
  },
  {
    title: 'Organize as confirmações', highlight: 'e acompanhe a agenda',
    desc: 'Acompanhe os agendamentos e as confirmações em um só fluxo, com ferramentas de comunicação integradas à rotina da clínica.',
    desc2: 'A equipe consegue identificar os horários que precisam de atenção e atualizar a agenda com mais clareza.',
    cta: 'Conhecer o fluxo da agenda', img: landingNoshow, alt: 'Acompanhamento da agenda', rev: true,
  },
  {
    title: 'Ofereça mais opções de', highlight: 'agendamento aos pacientes',
    desc: 'Disponibilize o fluxo de agendamento online da clínica para que pacientes consultem horários pelo celular.',
    desc2: 'A disponibilidade depende da configuração da clínica e dos horários publicados.',
    cta: 'Conhecer o agendamento online', img: landingOnline, alt: 'Agendamento online', rev: false,
  },
  {
    title: 'Prontuário organizado,', highlight: 'no padrão da sua equipe',
    desc: 'Monte seus modelos de anamnese e registre a consulta em minutos, com histórico, anexos, receitas, atestados e CID-10 sempre à mão.',
    desc2: 'Registre autoria e mantenha o histórico das alterações. A assinatura eletrônica do prontuário não equivale a certificado ICP-Brasil nem à integração Memed.',
    cta: 'Conhecer o prontuário', img: landingEhr, alt: 'Prontuário eletrônico', rev: true,
  },
  {
    title: 'Tenha clareza total do', highlight: 'dinheiro da sua clínica',
    desc: 'Consulte lançamentos, valores a receber e pagamentos cadastrados pela equipe.',
    desc2: 'Os registros ajudam a acompanhar movimentações e organizar a rotina financeira.',
    cta: 'Quero controlar meu caixa', img: landingFinancial, alt: 'Controle financeiro', rev: false,
  },
  {
    title: 'Avalie o produto com', highlight: 'a sua equipe',
    desc: 'Veja os fluxos principais e confirme se agenda, prontuário, financeiro e operação atendem ao dia a dia da sua clínica.',
    cta: 'Ver planos e iniciar teste', img: landingSupport, alt: 'Equipe avaliando o produto', rev: true,
    checks: ['Consulte os planos e limites vigentes.', 'Confirme os canais e horários de suporte antes de contratar.', 'Converse com a equipe sobre formato e custo de migração.'],
  },
];

const planPresentation = [
  { slug: 'elolab-max' as const },
  { slug: 'elolab-ultra' as const },
];

const featureLabels: Record<string, string> = {
  dashboard: 'Dashboard', agenda: 'Agenda', pacientes: 'Gestão de pacientes',
  prontuarios: 'Prontuário eletrônico', prescricoes: 'Prescrições', atestados: 'Atestados',
  exames: 'Exames', triagem: 'Triagem', fila: 'Fila de atendimento', salas: 'Salas',
  estoque: 'Estoque', financeiro: 'Financeiro', relatorios: 'Relatórios',
  convenios: 'Convênios', funcionarios: 'Gestão de equipe', automacoes: 'Automações',
  analytics: 'Analytics', templates: 'Modelos clínicos', encaminhamentos: 'Encaminhamentos',
  lista_espera: 'Lista de espera', painel_tv: 'Painel de chamadas', pagamentos: 'Pagamentos',
  agente_ia: 'Agente de IA no WhatsApp', chatbot_whatsapp: 'Atendimento automatizado no WhatsApp',
};
const premiumFeatures = new Set(['agente_ia', 'chatbot_whatsapp']);

type PublicPlan = {
  slug: string;
  name: string;
  price: number;
  popular: boolean;
  frequency: string;
  trialDays: number;
  features: string[];
};

const faqItems = [
  {
    q: 'Consigo usar o EloLab pelo celular?',
    a: 'Sim. O EloLab funciona em celular, tablet e computador direto pelo navegador, sem baixar nada na loja de aplicativos. Você ainda pode instalá-lo na tela inicial e usar como um app comum.',
  },
  {
    q: 'Como funciona o teste grátis?',
    a: 'Escolha um plano, crie sua conta e cadastre um cartão no checkout seguro do Mercado Pago. O teste dura 3 dias. Antes de confirmar, mostramos o valor e a data da primeira cobrança recorrente; cancele antes do fim do teste para não pagar a primeira mensalidade.',
  },
  {
    q: 'Os dados dos meus pacientes ficam seguros?',
    a: 'O sistema aplica separação de dados por clínica e permissões por perfil. Consulte a Política de Privacidade para saber como os dados são tratados e confirme com a equipe os procedimentos de backup e recuperação vigentes.',
  },
  {
    q: 'Consigo trazer os dados do meu sistema atual?',
    a: 'A migração depende do formato, volume e qualidade dos dados. Fale com a equipe antes de contratar para confirmar escopo, prazo e eventual custo.',
  },
  {
    q: 'O EloLab atende laboratórios também?',
    a: 'Sim. Há um módulo completo de laboratório: organização das coletas, laudos digitais padronizados, mapa de coleta, rastreabilidade de amostras por código de barras e faturamento integrado.',
  },
  {
    q: 'Existe limite de usuários por clínica?',
    a: 'Há limites de equipe definidos por plano e configuração. Confira os limites vigentes na proposta antes de contratar.',
  },
  {
    q: 'Como funciona o suporte no dia a dia?',
    a: 'Os canais de contato são WhatsApp e e-mail. Horários, treinamento e prazos de resposta devem ser confirmados na proposta comercial.',
  },
];

/* ─── FAQ Item Component ─── */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[hsl(20,20%,90%)] last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span className="text-base font-bold pr-4" style={{ color: C.dark }}>{q}</span>
        <ChevronDown
          className={`w-5 h-5 shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          style={{ color: C.coral }}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? 'max-h-60 pb-5 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <p className="text-sm leading-relaxed" style={{ color: C.text }}>{a}</p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { data: catalogPlans, isLoading: plansLoading, isError: plansError } = usePlanos();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState<'trial' | 'buy'>('trial');
  const [selectedPlan, setSelectedPlan] = useState<PublicPlan | null>(null);

  const plans = useMemo<PublicPlan[]>(() => {
    if (!catalogPlans) return [];
    return planPresentation.flatMap((presentation) => {
      const source = catalogPlans.find((plan) => plan.slug === presentation.slug && plan.ativo);
      if (!source) return [];
      const keys = Array.isArray(source.features) ? source.features : [];
      const ordinary = keys.filter((key) => !premiumFeatures.has(key)).slice(0, 7);
      const premium = keys.filter((key) => premiumFeatures.has(key));
      const visible = [...ordinary, ...premium];
      const features = visible.map((key) => featureLabels[key] || key);
      const remaining = keys.length - visible.length;
      if (remaining > 0) features.push(`E mais ${remaining} recursos do plano`);
      return [{
        slug: source.slug,
        name: source.nome,
        price: Number(source.valor),
        popular: source.destaque,
        frequency: source.frequencia,
        trialDays: source.trial_dias || 3,
        features,
      }];
    });
  }, [catalogPlans]);

  const openCheckout = (plan: PublicPlan, mode: 'trial' | 'buy') => {
    setSelectedPlan(plan);
    setCheckoutMode(mode);
    setCheckoutOpen(true);
  };

  const handleCheckout = () => {
    if (!selectedPlan) return;
    const params = new URLSearchParams({ cadastro: '1', plano: selectedPlan.slug, modo: checkoutMode });
    const next = `/auth?${params.toString()}`;
    const host = window.location.hostname;
    setCheckoutOpen(false);
    if (host === 'elolab.com.br' || host === 'www.elolab.com.br') {
      window.location.assign(`https://app.elolab.com.br${next}`);
    } else {
      navigate(next);
    }
  };

  const [mobileMenu, setMobileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  const scrollTo = (id: string) => {
    setMobileMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const goToAuth = () => {
    const host = window.location.hostname;
    if (host === 'elolab.com.br' || host === 'www.elolab.com.br') {
      window.location.href = 'https://app.elolab.com.br/auth';
    } else {
      navigate('/auth');
    }
  };

  const navLinks = [
    { id: 'inicio', l: 'INÍCIO' },
    { id: 'recursos', l: 'RECURSOS' },
    { id: 'planos', l: 'PREÇOS' },
    { id: 'faq', l: 'FAQ' },
    { id: 'contato', l: 'CONTATO' },
  ];

  return (
    <>
      {/* Fixed gradient bg */}
      <div className="fixed inset-0 -z-10" style={{
        background: 'linear-gradient(160deg, hsl(35,70%,95%) 0%, hsl(20,80%,93%) 25%, hsl(12,60%,90%) 50%, hsl(30,50%,92%) 75%, hsl(160,30%,93%) 100%)',
      }} />

      <div className="min-h-screen overflow-x-hidden font-sans">

        {/* ══ NAVBAR ══ */}
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'bg-white/95 backdrop-blur-md shadow-lg' : 'bg-white'
        }`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-[72px]">
            <img src={elolabLogo} alt="EloLab" className="h-12 md:h-14 w-auto" />
            <div className="hidden lg:flex items-center gap-7">
              {navLinks.map(n => (
                <button
                  key={n.id}
                  onClick={() => scrollTo(n.id)}
                  className="text-[13px] font-bold tracking-wide hover:text-[hsl(12,76%,61%)] transition-colors relative pb-1 group"
                  style={{ color: C.dark }}
                >
                  {n.l}
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 rounded-full transition-all duration-300 group-hover:w-full"
                    style={{ background: C.coral }} />
                </button>
              ))}
            </div>
            <div className="hidden md:flex items-center gap-3">
              <a
                href="https://wa.me/5511937687369"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white transition-all hover:scale-105 hover:shadow-lg"
                style={{ background: '#25D366' }}
              >
                <Phone className="w-4 h-4" /> CHAMAR
              </a>
              <Button
                onClick={goToAuth}
                className="px-6 py-2.5 rounded-lg text-sm font-bold text-white border-0 transition-all hover:scale-105 hover:shadow-lg"
                style={{ background: C.dark }}
              >
                ENTRAR
              </Button>
            </div>
            <button
              className="lg:hidden p-2"
              style={{ color: C.dark }}
              onClick={() => setMobileMenu(!mobileMenu)}
              aria-label={mobileMenu ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
              aria-expanded={mobileMenu}
              aria-controls="navegacao-mobile"
            >
              {mobileMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
          {mobileMenu && (
            <div
              id="navegacao-mobile"
              role="region"
              aria-label="Navegação móvel"
              className="lg:hidden bg-white border-t border-gray-100 px-6 pb-6 space-y-1 animate-fade-in shadow-lg"
            >
              {navLinks.map(n => (
                <button key={n.id} onClick={() => scrollTo(n.id)} className="block w-full text-left py-3 text-sm font-bold tracking-wide" style={{ color: C.dark }}>{n.l}</button>
              ))}
              <div className="pt-3 flex flex-col gap-2">
                <a href="https://wa.me/5511937687369" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold text-white" style={{ background: '#25D366' }}>
                  <Phone className="w-4 h-4" /> CHAMAR
                </a>
                <Button onClick={goToAuth} className="w-full rounded-lg font-bold text-white border-0 py-3" style={{ background: C.dark }}>ENTRAR</Button>
              </div>
            </div>
          )}
        </nav>

        {/* ══ HERO ══ */}
        <section className="relative pt-[72px] overflow-hidden" id="inicio">
          {/* Blue curved background */}
          <div className="absolute inset-0 z-0" style={{
            background: 'linear-gradient(135deg, hsl(210,70%,35%) 0%, hsl(215,75%,30%) 50%, hsl(220,65%,25%) 100%)',
            clipPath: 'ellipse(85% 100% at 30% 0%)',
          }} />
          {/* Subtle pattern overlay */}
          <div className="absolute inset-0 z-[1] opacity-[0.03]" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }} />

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 lg:py-36">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
              {/* Left: Text */}
              <div className="animate-fade-in min-w-0">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-6">
                  <Zap className="w-3.5 h-3.5 text-yellow-300" />
                  <span className="text-xs font-semibold text-white/90">Conheça os fluxos do EloLab para clínicas</span>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-light leading-[1.15] tracking-tight text-white">
                  Organize a rotina da clínica<br />
                  <span className="font-extrabold">em um só lugar</span>
                </h1>
                <p className="mt-5 text-base md:text-lg text-white/70 max-w-lg leading-relaxed">
                  Agenda, prontuário, financeiro, laboratório e recursos de IA no WhatsApp, conforme as integrações habilitadas para a clínica.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={() => scrollTo('planos')}
                    className="rounded-lg px-8 py-3.5 text-sm font-bold border-2 border-white bg-white hover:bg-white/90 transition-all hover:scale-105 hover:shadow-xl"
                    style={{ color: 'hsl(215,75%,30%)' }}
                  >
                  {plans.length ? `Testar grátis por ${plans[0].trialDays} dias` : 'Consultar planos'} <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <Button
                    onClick={() => scrollTo('modulos')}
                    variant="ghost"
                    className="rounded-lg px-8 py-3.5 text-sm font-bold text-white border-2 border-white/30 hover:bg-white/10 transition-all"
                  >
                    Ver o que está incluso
                  </Button>
                </div>
                <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-white/60">
                  <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> LGPD</span>
                  <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {plans.length ? `${plans[0].trialDays} dias grátis` : 'Teste gratuito'}</span>
                  <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Acesso por perfil</span>
                  <span className="flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Renovação automática</span>
                </div>
              </div>

              {/* Imagem ilustrativa da clínica */}
              <div className="relative mx-auto w-full max-w-xl animate-fade-in lg:justify-self-end" style={{ animationDelay: '0.3s' }}>
                <div className="absolute -inset-3 rounded-[2rem] border border-white/15" aria-hidden="true" />
                <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-white/10 p-2 shadow-2xl shadow-black/20 backdrop-blur-sm">
                  <img
                    src={clinicHero}
                    alt="Recep&#231;&#227;o de uma cl&#237;nica"
                    className="aspect-[4/3] w-full rounded-[1.35rem] object-cover object-center sm:aspect-[16/10] lg:aspect-[4/3]"
                    loading="eager"
                  />
                </div>
                <div className="absolute -bottom-4 left-5 right-5 rounded-2xl border border-white/70 bg-white/95 px-4 py-3 shadow-xl shadow-black/10 backdrop-blur sm:left-8 sm:right-auto sm:min-w-64">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: C.coral }}>EloLab para cl&#237;nicas</p>
                  <p className="mt-1 text-sm font-medium" style={{ color: C.dark }}>Agenda, equipe e opera&#231;&#227;o conectadas</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══ PRODUTO EM UM SÓ LUGAR ══ */}
        <section className="py-16 md:py-20 relative">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: Calendar, title: 'Agenda e atendimento', text: 'Agendamentos, fila e fluxo de recepção.' },
                { icon: FileText, title: 'Prontuário e documentos', text: 'Registros clínicos e documentos do paciente.' },
                { icon: Receipt, title: 'Gestão financeira', text: 'Caixa, contas e relatórios da clínica.' },
                { icon: Users, title: 'Equipe e operação', text: 'Papéis, tarefas e processos do dia a dia.' },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl bg-white/75 border border-[hsl(20,30%,90%)] p-5">
                  <Icon className="w-6 h-6 mb-3" style={{ color: C.coral }} />
                  <h3 className="font-bold" style={{ color: C.dark }}>{title}</h3>
                  <p className="text-sm mt-1" style={{ color: C.textL }}>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ FEATURE SECTIONS ══ */}
        <div id="recursos">
          {featureSections.map((f, i) => (
            <section key={i} className="py-16 md:py-24">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                  <div className={`flex justify-center ${f.rev ? 'lg:order-2' : 'lg:order-1'}`}>
                    <div className="relative group">
                      <img src={f.img} alt={f.alt} className="w-full max-w-[440px] rounded-3xl shadow-lg transition-transform duration-500 group-hover:scale-[1.02]" loading="lazy" />
                      {/* Decorative glow behind image */}
                      <div className="absolute -inset-4 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10"
                        style={{ background: 'radial-gradient(circle, hsl(12,76%,61%,0.08), transparent 70%)' }} />
                    </div>
                  </div>
                  <div className={f.rev ? 'lg:order-1' : 'lg:order-2'}>
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold leading-tight" style={{ color: C.dark }}>
                      {f.title}{' '}
                      <span className="bg-clip-text text-transparent" style={{ backgroundImage: C.grad }}>{f.highlight}</span>
                    </h2>
                    <p className="mt-5 leading-relaxed text-base md:text-lg" style={{ color: C.text }}>{f.desc}</p>
                    {f.desc2 && <p className="mt-3 leading-relaxed text-base md:text-lg" style={{ color: C.text }}>{f.desc2}</p>}
                    {f.checks && (
                      <ul className="mt-6 space-y-3">
                        {f.checks.map((c, j) => (
                          <li key={j} className="flex items-center gap-3 text-sm font-medium" style={{ color: C.dark }}>
                            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: C.grad }}>
                              <Check className="w-3.5 h-3.5 text-white" />
                            </div>
                            {c}
                          </li>
                        ))}
                      </ul>
                    )}
                    <Button onClick={() => scrollTo('planos')} className="mt-8 rounded-full px-8 py-3 text-sm font-bold text-white border-0 transition-all hover:scale-105 hover:shadow-lg"
                      style={{ background: C.grad }}>
                      {f.cta} <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* ══ GROUPED MODULES ══ */}
        <section id="modulos">
          <div className="text-center py-16 md:py-20">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ color: C.dark }}>
              Tudo o que sua clínica precisa,{' '}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: C.grad }}>em um só lugar</span>
            </h2>
            <p className="mt-3 text-lg" style={{ color: C.textL }}>
              Recursos organizados por área, com planos e limites apresentados abaixo
            </p>
          </div>

          {moduleGroups.map((group, gi) => (
            <React.Fragment key={gi}>
              <div className="relative h-[180px] md:h-[220px] overflow-hidden">
                <img src={group.strip} alt={group.stripText} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, hsl(20,25%,18%,0.75), hsl(12,76%,61%,0.45))' }} />
                <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 text-center">
                  <h3 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight drop-shadow-lg">
                    {group.stripText}
                  </h3>
                  <p className="mt-2 text-sm md:text-base text-white/80 max-w-xl">{group.subtitle}</p>
                </div>
              </div>

              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {group.modules.map((m, mi) => (
                    <div key={mi} className="relative group rounded-2xl bg-white/70 border border-[hsl(20,30%,90%)] hover:shadow-xl transition-all duration-300 overflow-hidden hover:-translate-y-1">
                      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
                      <div className="h-36 overflow-hidden">
                        <img src={m.img} alt={m.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                      </div>
                      <div className="p-5">
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: 'hsl(12,76%,61%,0.1)' }}>
                            <m.icon className="w-4 h-4" style={{ color: C.coral }} />
                          </div>
                          <h3 className="text-sm font-bold" style={{ color: C.dark }}>{m.title}</h3>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: C.textL }}>{m.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </React.Fragment>
          ))}
        </section>

        {/* ══ PRICING ══ */}
        <section id="planos" className="py-20 md:py-28">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ color: C.dark }}>
                Escolha o plano para{' '}
                <span className="bg-clip-text text-transparent" style={{ backgroundImage: C.grad }}>a sua operação</span>
              </h2>
              <p className="mt-3 text-lg" style={{ color: C.textL }}>
                {plans.length > 0 ? 'Teste grátis por 3 dias com cartão. Cancele antes da primeira cobrança automática.' : 'Consulte os planos e as condições do teste gratuito.'}
              </p>
            </div>
            {plansLoading ? (
              <p className="text-center text-sm" style={{ color: C.textL }}>Carregando valores atuais…</p>
            ) : plansError || plans.length === 0 ? (
              <div className="max-w-xl mx-auto text-center rounded-2xl bg-white/80 border border-[hsl(20,30%,90%)] p-6">
                <p style={{ color: C.text }}>Não foi possível carregar os planos agora. Fale com a equipe para receber os valores vigentes.</p>
                <a className="inline-block mt-3 font-semibold" style={{ color: C.coral }} href="https://wa.me/5511937687369" target="_blank" rel="noopener noreferrer">Consultar planos pelo WhatsApp</a>
              </div>
            ) : <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {plans.map((plan) => (
                <div
                  key={plan.slug}
                  className={`relative rounded-3xl p-8 border-2 transition-all duration-300 hover:-translate-y-1 ${
                    plan.popular
                      ? 'border-[hsl(12,76%,61%)] shadow-xl scale-[1.02]'
                      : 'border-[hsl(20,30%,90%)] bg-white/70 hover:shadow-lg'
                  }`}
                  style={plan.popular ? {
                    background: 'linear-gradient(160deg, hsl(40,60%,97%), hsl(38,80%,95%), hsl(30,70%,96%))',
                    animation: 'pulseGlow 3s ease-in-out infinite',
                  } : undefined}
                >
                  <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1.5 rounded-full text-xs font-bold text-white flex items-center gap-1.5"
                      style={{ background: C.grad }}>
                      <Crown className="w-3.5 h-3.5" /> Mais Popular
                    </div>
                  )}
                  <h3 className="text-xl font-extrabold" style={{ color: C.dark }}>{plan.name}</h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold" style={{ color: plan.popular ? C.coral : C.dark }}>
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plan.price)}
                    </span>
                    <span className="text-sm font-medium" style={{ color: C.textL }}>
                      /{plan.frequency === 'mensal' ? 'mês' : plan.frequency}
                    </span>
                  </div>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-center gap-2.5 text-sm" style={{ color: C.text }}>
                        <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: plan.popular ? C.grad : 'hsl(12,76%,61%,0.12)' }}>
                          <Check className="w-3 h-3" style={{ color: plan.popular ? '#fff' : C.coral }} />
                        </div>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8 space-y-3">
                    <Button
                      onClick={() => openCheckout(plan, 'trial')}
                      className="w-full rounded-full py-3 font-bold text-white border-0 transition-all hover:scale-[1.02] hover:shadow-lg"
                      style={{ background: C.grad, boxShadow: plan.popular ? '0 8px 24px -4px hsl(12,76%,61%,0.4)' : undefined }}
                    >
                      <Clock className="w-4 h-4 mr-2" /> Testar {plan.trialDays} dias grátis
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => openCheckout(plan, 'buy')}
                      className="w-full rounded-full py-3 font-bold border-2 transition-all hover:scale-[1.02]"
                      style={{ borderColor: C.coral, color: C.coral }}
                    >
                      <CreditCard className="w-4 h-4 mr-2" /> Assinar agora
                    </Button>
                  </div>
                </div>
              ))}
            </div>}
          </div>
        </section>

        {/* ══ CHECKOUT MODAL ══ */}
        {checkoutOpen && selectedPlan && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setCheckoutOpen(false)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setCheckoutOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" style={{ color: C.textL }} />
              </button>

              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-3"
                  style={{ background: 'hsl(12,76%,61%,0.12)' }}>
                  {checkoutMode === 'trial' ? (
                    <Clock className="w-6 h-6" style={{ color: C.coral }} />
                  ) : (
                    <CreditCard className="w-6 h-6" style={{ color: C.coral }} />
                  )}
                </div>
                <h3 className="text-xl font-extrabold" style={{ color: C.dark }}>
                  {checkoutMode === 'trial' ? `Comece seus ${selectedPlan.trialDays} dias grátis` : 'Finalize sua assinatura'}
                </h3>
                <p className="text-sm mt-1" style={{ color: C.textL }}>
                  {selectedPlan.name} — {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedPlan.price)}/{selectedPlan.frequency === 'mensal' ? 'mês' : selectedPlan.frequency}
                  {checkoutMode === 'trial' && ` (${selectedPlan.trialDays} dias grátis)`}
                </p>
              </div>

              <div className="rounded-2xl border p-4 text-sm leading-relaxed" style={{ color: C.text }}>
                Primeiro você cria sua conta e confirma o e-mail. Para o teste, cadastre o cartão no checkout do EloLab; para assinar, escolha a forma de pagamento disponível.
              </div>

              <Button
                onClick={handleCheckout}
                className="w-full mt-6 rounded-full py-3 font-bold text-white border-0 transition-all hover:scale-[1.02]"
                style={{ background: C.grad }}
              >
                {checkoutMode === 'trial' ? (
                  <>Liberar meu acesso grátis <ArrowRight className="w-4 h-4 ml-2" /></>
                ) : (
                  <>Criar conta e continuar <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </Button>

              <p className="text-center text-xs mt-4" style={{ color: C.textL }}>
                {checkoutMode === 'trial'
                  ? 'Sem código de convite. O cartão fica salvo para renovar a assinatura quando o período grátis terminar.'
                  : 'O pagamento será feito na sua conta após a criação e confirmação do acesso.'}
              </p>
            </div>
          </div>
        )}

        {/* ══ VISÃO DO PRODUTO ══ */}
        <section id="produto-na-pratica" className="py-20 md:py-28">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ color: C.dark }}>
                Uma visão clara da rotina da clínica
              </h2>
              <p className="mt-3 text-lg" style={{ color: C.textL }}>
                Explore os fluxos do produto e confirme se eles atendem às necessidades da sua equipe.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {[
                { icon: Calendar, title: 'Organize o atendimento', text: 'Acompanhe agenda, recepção e fila de atendimento.' },
                { icon: FileText, title: 'Registre o cuidado', text: 'Mantenha prontuários e documentos clínicos ligados à rotina do paciente.' },
                { icon: Receipt, title: 'Acompanhe a operação', text: 'Consulte contas, caixa e relatórios da clínica.' },
              ].map(({ icon: Icon, title, text }) => (
                <article key={title} className="rounded-2xl bg-white/80 border border-[hsl(20,30%,90%)] p-6">
                  <Icon className="w-7 h-7 mb-4" style={{ color: C.coral }} />
                  <h3 className="font-bold text-lg" style={{ color: C.dark }}>{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: C.textL }}>{text}</p>
                </article>
              ))}
            </div>
            <div className="text-center mt-8">
              <Button onClick={() => scrollTo('planos')} className="rounded-full px-8 py-3 font-bold text-white border-0" style={{ background: C.grad }}>
                Ver planos e iniciar teste <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </section>
        {/* ══ FAQ ══ */}
        <section id="faq" className="py-20 md:py-28">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ color: C.dark }}>
                Perguntas{' '}
                <span className="bg-clip-text text-transparent" style={{ backgroundImage: C.grad }}>Frequentes</span>
              </h2>
              <p className="mt-3 text-lg" style={{ color: C.textL }}>
                Respostas diretas para decidir com tranquilidade
              </p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-[hsl(20,30%,90%)] p-6 md:p-8 shadow-sm">
              {faqItems.map((item, i) => (
                <FaqItem key={i} q={item.q} a={item.a} />
              ))}
            </div>
            <div className="text-center mt-8">
              <p className="text-sm" style={{ color: C.textL }}>
                Ficou com alguma dúvida?{' '}
                <a href="https://wa.me/5511937687369" target="_blank" rel="noopener noreferrer"
                  className="font-bold hover:underline" style={{ color: C.coral }}>
                  Fale agora com um especialista no WhatsApp
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* ══ FINAL CTA ══ */}
        <section className="py-20 md:py-28">
          <div className="max-w-4xl mx-auto px-4">
            <div className="relative rounded-3xl overflow-hidden p-8 sm:p-12 md:p-16 text-center"
              style={{ background: 'linear-gradient(135deg, hsl(210,70%,35%), hsl(215,75%,30%), hsl(220,65%,25%))' }}>
              {/* Pattern overlay */}
              <div className="absolute inset-0 opacity-[0.04]" style={{
                backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                backgroundSize: '24px 24px',
              }} />
              <div className="relative z-10">
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
                  Conheça os fluxos do EloLab para a sua clínica
                </h2>
                <p className="mt-4 text-lg text-white/70 max-w-xl mx-auto">
                  Consulte os planos e inicie o teste com renovação automática configurada no EloLab.
                </p>
                <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                  <Button size="lg" onClick={() => scrollTo('planos')}
                    className="rounded-full px-10 text-base font-bold border-2 border-white bg-white hover:bg-white/90 transition-all hover:scale-105 hover:shadow-xl"
                    style={{ color: 'hsl(215,75%,30%)' }}>
                    Ver planos e iniciar teste <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <Button asChild size="lg" variant="ghost"
                    className="rounded-full px-10 text-base font-bold text-white border-2 border-white/30 hover:bg-white/10 transition-all w-full">
                    <a href="https://wa.me/5511937687369" target="_blank" rel="noopener noreferrer">
                      <Headphones className="w-4 h-4 mr-2" /> Falar com um especialista
                    </a>
                  </Button>
                </div>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-white/50">
                  <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Controle de acesso</span>
                  <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Recursos de privacidade</span>
                  <span className="flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Renovação automática</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══ FOOTER ══ */}
        <footer style={{ background: C.dark }} className="py-12" id="contato">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
              <div>
                <img src={elolabLogo} alt="EloLab" className="h-12 w-auto brightness-0 invert mb-4" />
                <p className="text-sm text-white/50 leading-relaxed">A plataforma completa que organiza, automatiza e faz crescer clínicas médicas e laboratórios.</p>
                <div className="mt-4 flex gap-3">
                  <a href="https://wa.me/5511937687369" target="_blank" rel="noopener noreferrer"
                    aria-label="Falar com o EloLab pelo WhatsApp"
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors">
                    <Phone className="w-4 h-4 text-white/70" />
                  </a>
                  <a href="mailto:suporte@elolab.com.br"
                    aria-label="Enviar e-mail para o suporte do EloLab"
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors">
                    <Mail className="w-4 h-4 text-white/70" />
                  </a>
                </div>
              </div>
              <div>
                <h4 className="font-bold text-sm text-white mb-4">Produto</h4>
                <ul className="space-y-2 text-sm text-white/50">
                  <li><button onClick={() => scrollTo('recursos')} className="hover:text-white transition-colors">Recursos</button></li>
                  <li><button onClick={() => scrollTo('modulos')} className="hover:text-white transition-colors">Módulos</button></li>
                  <li><button onClick={() => scrollTo('planos')} className="hover:text-white transition-colors">Preços</button></li>
                  <li><button onClick={() => scrollTo('produto-na-pratica')} className="hover:text-white transition-colors">Conheça os fluxos</button></li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-sm text-white mb-4">Legal</h4>
                <ul className="space-y-2 text-sm text-white/50">
                  <li><a href="/politica-privacidade" className="hover:text-white transition-colors">Política de Privacidade</a></li>
                  <li><a href="/politica-cookies" className="hover:text-white transition-colors">Política de Cookies</a></li>
                  <li><a href="/termos-uso" className="hover:text-white transition-colors">Termos de Uso</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-sm text-white mb-4">Contato</h4>
                <ul className="space-y-2 text-sm text-white/50">
                  <li className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> suporte@elolab.com.br</li>
                  <li className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> (11) 93768-7369</li>
                </ul>
              </div>
            </div>
            <div className="mt-10 pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-xs text-white/30">© {new Date().getFullYear()} EloLab. Todos os direitos reservados.</p>
              <p className="text-xs text-white/30">Gestão clínica e laboratorial</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
