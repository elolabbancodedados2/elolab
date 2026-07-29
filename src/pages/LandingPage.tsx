import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, Users, FileText, Shield, BarChart3, Stethoscope,
  MessageSquare, Star, ArrowRight, Check,
  Zap, Lock, FlaskConical, Receipt, Menu, X, Phone, Mail,
  Clock, Activity, Pill, ClipboardList, Building2, MonitorPlay,
  BellRing, FileBarChart, Warehouse, CreditCard, UserCheck,
  Microscope, HeartPulse, QrCode, Globe, SmartphoneNfc,
  Crown, Loader2, ChevronDown, TrendingUp, Award, Headphones
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GlowingEffect } from '@/components/ui/glowing-effect';
import elolabLogo from '@/assets/elolab-logo.png';
import landingHero from '@/assets/landing-hero.webp';
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

/* ─── Animated Counter Hook ─── */
function useCountUp(end: number, duration = 2000, startOnView = true) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!startOnView) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const startTime = Date.now();
          const tick = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration, startOnView]);

  return { count, ref };
}

/* ─── Grouped modules ─── */
const moduleGroups = [
  {
    title: 'Gestão Clínica',
    subtitle: 'Ferramentas essenciais para o atendimento médico do dia a dia',
    strip: stripClinica,
    stripText: 'Gestão Clínica Inteligente',
    modules: [
      { icon: Calendar, title: 'Agenda Inteligente', desc: 'Agendamento com confirmação automática, bloqueios, retornos e painel TV.', img: modClinica1 },
      { icon: FileText, title: 'Prontuário Eletrônico', desc: 'PEP com assinatura digital ICP-Brasil, timeline, CID-10 e exportação HL7 FHIR.', img: modClinica2 },
      { icon: Stethoscope, title: 'Módulo Clínico', desc: 'Prescrições, atestados, encaminhamentos e verificador de interações.', img: modClinica3 },
      { icon: HeartPulse, title: 'Triagem Manchester', desc: 'Classificação de risco integrada à fila de atendimento com priorização.', img: modClinica4 },
      { icon: Pill, title: 'Prescrições Digitais', desc: 'Prescrição com QR Code, baixa automática de estoque e dispensação.', img: modClinica5 },
      { icon: ClipboardList, title: 'Encaminhamentos', desc: 'Ciclo completo de encaminhamento com contra-referência e rastreio.', img: modClinica6 },
    ],
  },
  {
    title: 'Laboratório e Diagnóstico',
    subtitle: 'Do pedido ao laudo, com rastreabilidade completa',
    strip: stripLab,
    stripText: 'Laboratório Integrado',
    modules: [
      { icon: FlaskConical, title: 'Laboratório', desc: 'Worklist de coletas, laudos digitais, mapa de coleta e rastreabilidade.', img: modLab1 },
      { icon: Microscope, title: 'Exames & Laudos', desc: 'Do pedido ao laudo com faturamento automático ao liberar resultados.', img: modLab2 },
      { icon: Activity, title: 'Sinais Vitais', desc: 'Gráficos de sinais vitais com histórico e alertas de variação.', img: modLab3 },
      { icon: Warehouse, title: 'Estoque', desc: 'Controle de medicamentos, insumos, lotes, validade e ponto de pedido.', img: modLab4 },
      { icon: QrCode, title: 'Etiquetas & QR Code', desc: 'Impressão de etiquetas para pacientes e QR Code em prescrições.', img: modLab5 },
      { icon: Building2, title: 'Salas e Leitos', desc: 'Gestão de salas de atendimento, ocupação e disponibilidade em tempo real.', img: modLab6 },
    ],
  },
  {
    title: 'Comunicação e Pacientes',
    subtitle: 'Engaje pacientes e automatize a comunicação da clínica',
    strip: stripComunica,
    stripText: 'Comunicação e Atendimento',
    modules: [
      { icon: MessageSquare, title: 'WhatsApp IA', desc: 'Agente inteligente para agendamentos automáticos, lembretes e atendimento 24h.', img: modComunica1 },
      { icon: Users, title: 'Gestão de Pacientes', desc: 'Cadastro completo, lista de espera, convênios e portal do paciente.', img: modComunica2 },
      { icon: Globe, title: 'Portal do Paciente', desc: 'Acesso seguro para pacientes visualizarem exames e agendamentos.', img: modComunica3 },
      { icon: MonitorPlay, title: 'Painel TV', desc: 'Tela de chamada para recepção com fila de pacientes em tempo real.', img: modComunica4 },
      { icon: BellRing, title: 'Automações', desc: '16 fluxos automáticos: lembretes, cobranças, aniversários e alertas.', img: modComunica5 },
      { icon: SmartphoneNfc, title: 'PWA Mobile', desc: 'Funciona em qualquer dispositivo sem baixar app. Instale como PWA.', img: modComunica6 },
    ],
  },
  {
    title: 'Financeiro e Gestão',
    subtitle: 'Controle total das finanças, equipe e segurança da clínica',
    strip: stripFinanc,
    stripText: 'Financeiro e Administração',
    modules: [
      { icon: Receipt, title: 'Financeiro Completo', desc: 'Fluxo de caixa, contas a pagar/receber, faturamento TISS e relatórios.', img: modFinanc1 },
      { icon: CreditCard, title: 'Pagamentos Online', desc: 'Assinaturas via Mercado Pago com trial, bloqueio por inadimplência.', img: modFinanc2 },
      { icon: FileBarChart, title: 'Relatórios & Analytics', desc: 'Dashboards em tempo real, exportação Excel/PDF e métricas de desempenho.', img: modFinanc3 },
      { icon: BarChart3, title: 'Dashboard Analítico', desc: 'KPIs, sparklines, ocupação, fluxo de caixa e atalhos rápidos.', img: modFinanc4 },
      { icon: UserCheck, title: 'Gestão de Equipe', desc: 'Funcionários, convites por e-mail, cargos e permissões por papel.', img: modFinanc5 },
      { icon: Shield, title: 'LGPD & Segurança', desc: 'Consentimentos digitais, audit trail, backup automático e RLS completo.', img: modFinanc6 },
    ],
  },
];

const featureSections = [
  {
    title: 'Aumente a eficiência', highlight: 'da sua clínica',
    desc: 'Potencialize seus resultados com um sistema que organiza e facilita os processos operacionais e de gestão da sua clínica.',
    desc2: 'Conte com recursos de automação e integração especialmente pensados para transformar o dia-a-dia do seu negócio.',
    cta: 'Quero descomplicar minha clínica', img: landingEfficiency, alt: 'Gestão eficiente', rev: false,
  },
  {
    title: 'Reduza as faltas dos', highlight: 'pacientes às consultas',
    desc: 'Com a confirmação automática via WhatsApp, o sistema envia mensagens e destaca na agenda as confirmações recebidas.',
    desc2: 'Ganhe produtividade permitindo que sua equipe foque em contatar apenas quem não confirmou.',
    cta: 'Quero reduzir faltas', img: landingNoshow, alt: 'Redução de faltas', rev: true,
  },
  {
    title: 'Aumente suas receitas com o', highlight: 'Agendamento Online',
    desc: 'Disponibilize o agendamento online integrado ao site da sua clínica e potencialize a marcação de consultas.',
    desc2: 'Diversifique seus canais de agendamento e capte mais pacientes.',
    cta: 'Quero agendamento online', img: landingOnline, alt: 'Agendamento online', rev: false,
  },
  {
    title: 'Prontuário eletrônico', highlight: 'personalizável',
    desc: 'Modelos de anamnese, histórico, anexos, prescrições, atestados, CID-10, assinatura digital e conformidade LGPD.',
    desc2: 'Exportação HL7 FHIR R4 e bloqueio de edição com trilha de auditoria conforme CFM.',
    cta: 'Quero prontuário eletrônico', img: landingEhr, alt: 'Prontuário eletrônico', rev: true,
  },
  {
    title: 'Controle financeiro', highlight: 'seguro e eficiente',
    desc: 'Dashboards diários, fluxo de caixa em tempo real, faturamento TISS para convênios e contas a pagar/receber.',
    desc2: 'Rastreie qualquer lançamento ou alteração para evitar fraudes e garantir a saúde financeira da clínica.',
    cta: 'Quero financeiro seguro', img: landingFinancial, alt: 'Controle financeiro', rev: false,
  },
  {
    title: 'Pós-venda comprometido com o', highlight: 'sucesso do cliente',
    desc: 'Treinamentos com especialistas, migração de cadastros do seu sistema atual e suporte em tempo real via chat.',
    cta: 'Quero começar agora', img: landingSupport, alt: 'Suporte', rev: true,
    checks: ['Treinamentos com nosso time de especialistas.', 'Migração de cadastros do seu sistema atual.', 'Suporte em tempo real através de chat.'],
  },
];

const plans = [
  {
    slug: 'elolab-max',
    name: 'EloLab Max',
    price: 299,
    popular: false,
    features: [
      'Agenda Inteligente',
      'Prontuário Eletrônico (PEP)',
      'Financeiro Completo',
      'Gestão de Pacientes',
      'Estoque & Insumos',
      'Relatórios & Analytics',
      'Automações (16 fluxos)',
      'LGPD & Auditoria',
      'PWA Mobile',
      'Suporte via Chat',
    ],
  },
  {
    slug: 'elolab-ultra',
    name: 'EloLab Ultra',
    price: 399,
    popular: true,
    features: [
      'Tudo do plano Max +',
      'WhatsApp IA (Agente 24h)',
      'Agendamento Online',
      'Confirmação Automática',
      'Laboratório & Laudos',
      'Triagem Manchester',
      'Portal do Paciente',
      'Painel TV Recepção',
      'Suporte Prioritário',
      'Migração de Dados Grátis',
    ],
  },
];

const testimonials = [
  { name: 'Dra. Mariana Silva', clinic: 'CardioVida - Cardiologia', text: 'O EloLab se reinventa auxiliando na gestão da clínica. O atendimento é super top! Indico!', avatar: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=100&h=100&fit=crop&crop=face' },
  { name: 'Dr. Carlos Mendes', clinic: 'MedCenter - Clínico Geral', text: 'Equipe atenciosa, suporte eficiente. O sistema nunca ficou inoperante.', avatar: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=100&h=100&fit=crop&crop=face' },
  { name: 'Ana Paula Costa', clinic: 'EstéticaPrime - Estética', text: 'A maior vantagem é o fácil acesso e prontidão da equipe técnica.', avatar: 'https://images.unsplash.com/photo-1594824476967-48c8b964ac31?w=100&h=100&fit=crop&crop=face' },
  { name: 'Dr. Roberto Alves', clinic: 'OrthoPlus - Ortopedia', text: 'Sistema muito prático e completo. Recomendo para qualquer clínica.', avatar: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=100&h=100&fit=crop&crop=face' },
  { name: 'Dra. Fernanda Lima', clinic: 'DermaVita - Dermatologia', text: 'Nos ajuda no operacional e no estratégico. Financeiro integrado é um diferencial.', avatar: 'https://images.unsplash.com/photo-1651008376811-b90baee60c1f?w=100&h=100&fit=crop&crop=face' },
  { name: 'Dr. Henrique Souza', clinic: 'PediatraCare - Pediatria', text: 'Excelente ferramenta de gestão. Prontuário intuitivo e seguro.', avatar: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=100&h=100&fit=crop&crop=face' },
  { name: 'Dra. Camila Rocha', clinic: 'NutriVida - Nutrição', text: 'Agenda integrada com WhatsApp mudou meu dia a dia. Reduzi faltas em 40%.', avatar: 'https://images.unsplash.com/photo-1614608682850-e0d6ed316d47?w=100&h=100&fit=crop&crop=face' },
  { name: 'Dr. André Martins', clinic: 'OftalmoCenter - Oftalmologia', text: 'O módulo financeiro é fantástico. Controlo tudo em um só lugar.', avatar: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=100&h=100&fit=crop&crop=face' },
  { name: 'Patrícia Oliveira', clinic: 'LabAnalytica - Laboratório', text: 'Rastreio de amostras com código de barras eliminou erros de coleta.', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop&crop=face' },
  { name: 'Dr. Marcos Ferreira', clinic: 'UroMed - Urologia', text: 'Melhor custo-benefício do mercado. Suporte responde em minutos.', avatar: 'https://images.unsplash.com/photo-1556157382-97eded29296d?w=100&h=100&fit=crop&crop=face' },
  { name: 'Dra. Juliana Pires', clinic: 'GinecoSaúde - Ginecologia', text: 'Prescrição digital com QR Code é um diferencial para minhas pacientes.', avatar: 'https://images.unsplash.com/photo-1527613426441-4da17471b66d?w=100&h=100&fit=crop&crop=face' },
  { name: 'Lucas Santos', clinic: 'FisioAtiva - Fisioterapia', text: 'O painel TV na recepção profissionalizou minha clínica. Pacientes amam.', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face' },
  { name: 'Dra. Beatriz Nunes', clinic: 'EndoVita - Endocrinologia', text: 'Triagem Manchester integrada agilizou nosso fluxo de emergência.', avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&h=100&fit=crop&crop=face' },
  { name: 'Dr. Felipe Cardoso', clinic: 'NeuroPlus - Neurologia', text: 'Encaminhamentos com contra-referência ficaram 100% rastreáveis.', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face' },
  { name: 'Amanda Lopes', clinic: 'OdontoSmile - Odontologia', text: 'Portal do paciente aumentou a satisfação e reduziu ligações no consultório.', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face' },
  { name: 'Dr. Ricardo Braga', clinic: 'PneumoCenter - Pneumologia', text: 'LGPD e assinatura digital nos dão segurança jurídica total.', avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&h=100&fit=crop&crop=face' },
  { name: 'Dra. Isabela Campos', clinic: 'ReumatoVida - Reumatologia', text: 'CID-10 integrado ao prontuário economiza tempo em cada atendimento.', avatar: 'https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?w=100&h=100&fit=crop&crop=face' },
  { name: 'Thiago Ribeiro', clinic: 'LabExcel - Análises Clínicas', text: 'Laudos laboratoriais ficaram padronizados e profissionais. Clientes elogiam.', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&h=100&fit=crop&crop=face' },
  { name: 'Dra. Renata Duarte', clinic: 'AlergoClin - Alergologia', text: 'Alertas de alergia no prontuário salvam vidas. Funcionalidade essencial.', avatar: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=100&h=100&fit=crop&crop=face' },
  { name: 'Dr. Gustavo Pereira', clinic: 'GastroMed - Gastroenterologia', text: 'Relatórios analíticos me ajudam a tomar decisões estratégicas para a clínica.', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face' },
];

const faqItems = [
  {
    q: 'O EloLab funciona no meu celular?',
    a: 'Sim! O EloLab é um PWA (Progressive Web App) que funciona em qualquer dispositivo — smartphone, tablet ou computador — sem necessidade de baixar nada. Basta acessar pelo navegador.',
  },
  {
    q: 'Preciso de cartão de crédito para testar?',
    a: 'Não! O teste gratuito de 3 dias não exige cartão de crédito. Você cria sua conta, configura a clínica e já começa a usar. Após o período de teste, escolha o plano ideal.',
  },
  {
    q: 'Meus dados estão seguros?',
    a: 'Absolutamente. Utilizamos criptografia ponta a ponta, Row Level Security (RLS) no banco de dados, backup automático diário, consentimentos LGPD digitais e trilha de auditoria completa conforme exigido pelo CFM.',
  },
  {
    q: 'Posso migrar os dados do meu sistema atual?',
    a: 'Sim! No plano Ultra, oferecemos migração de dados gratuita. Nossa equipe cuida de todo o processo de importação de pacientes, agendamentos e prontuários do seu sistema anterior.',
  },
  {
    q: 'O sistema funciona para laboratórios?',
    a: 'Sim! O EloLab possui módulo completo de laboratório com worklist de coletas, laudos digitais, mapa de coleta, rastreabilidade de amostras por código de barras e integração com o módulo financeiro.',
  },
  {
    q: 'Quantos usuários posso ter?',
    a: 'Ambos os planos permitem cadastrar toda sua equipe: médicos, recepcionistas, enfermeiros e administradores, cada um com permissões específicas por papel (RBAC). Sem limite de usuários.',
  },
  {
    q: 'Como funciona o suporte?',
    a: 'Oferecemos suporte via WhatsApp e chat no sistema. No plano Ultra, o suporte é prioritário com tempo de resposta reduzido. Também disponibilizamos treinamentos com nossa equipe de especialistas.',
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

/* ─── Stats Counter Component ─── */
function StatCounter({ end, suffix, label, icon: Icon }: { end: number; suffix: string; label: string; icon: React.ElementType }) {
  const { count, ref } = useCountUp(end);
  return (
    <div ref={ref} className="text-center">
      <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
        style={{ background: 'hsl(12,76%,61%,0.12)' }}>
        <Icon className="w-6 h-6" style={{ color: C.coral }} />
      </div>
      <p className="text-3xl md:text-4xl font-extrabold" style={{ color: C.dark }}>
        {count}{suffix}
      </p>
      <p className="text-sm mt-1" style={{ color: C.textL }}>{label}</p>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState<'trial' | 'buy'>('trial');
  const [selectedPlan, setSelectedPlan] = useState<typeof plans[0] | null>(null);
  const [formData, setFormData] = useState({ nome: '', email: '', telefone: '', clinica: '' });
  const [loading, setLoading] = useState(false);

  const openCheckout = (plan: typeof plans[0], mode: 'trial' | 'buy') => {
    setSelectedPlan(plan);
    setCheckoutMode(mode);
    setCheckoutOpen(true);
  };

  const handleCheckout = async () => {
    if (!formData.nome || !formData.email || !selectedPlan) {
      toast.error('Preencha nome e e-mail');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('public-checkout', {
        body: {
          plano_slug: selectedPlan.slug,
          nome: formData.nome,
          email: formData.email,
          telefone: formData.telefone,
          clinica: formData.clinica,
          mode: checkoutMode,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (checkoutMode === 'buy' && data?.checkout_url) {
        toast.success('Redirecionando para pagamento...');
        window.location.href = data.checkout_url;
      } else if (data?.success) {
        toast.success('Verifique seu e-mail para o código de ativação!');
        setCheckoutOpen(false);
        setFormData({ nome: '', email: '', telefone: '', clinica: '' });
      }
    } catch (err: unknown) {
      console.error('Checkout error:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao processar. Tente novamente.');
    } finally {
      setLoading(false);
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
            <button className="lg:hidden p-2" style={{ color: C.dark }} onClick={() => setMobileMenu(!mobileMenu)} aria-label="Menu">
              {mobileMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
          {mobileMenu && (
            <div className="lg:hidden bg-white border-t border-gray-100 px-6 pb-6 space-y-1 animate-fade-in shadow-lg">
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
                  <span className="text-xs font-semibold text-white/90">Novo: Agente IA WhatsApp 24h</span>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-light leading-[1.15] tracking-tight text-white">
                  O melhor<br />
                  <span className="font-extrabold">sistema de gestão</span><br />
                  para sua clínica.
                </h1>
                <p className="mt-5 text-base md:text-lg text-white/70 max-w-lg leading-relaxed">
                  Agenda, prontuário, financeiro, laboratório e WhatsApp IA — tudo integrado em uma única plataforma.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={() => scrollTo('planos')}
                    className="rounded-lg px-8 py-3.5 text-sm font-bold border-2 border-white bg-white hover:bg-white/90 transition-all hover:scale-105 hover:shadow-xl"
                    style={{ color: 'hsl(215,75%,30%)' }}
                  >
                    Começar teste grátis <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <Button
                    onClick={() => scrollTo('modulos')}
                    variant="ghost"
                    className="rounded-lg px-8 py-3.5 text-sm font-bold text-white border-2 border-white/30 hover:bg-white/10 transition-all"
                  >
                    Ver módulos
                  </Button>
                </div>
                <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-white/60">
                  <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> LGPD</span>
                  <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> 3 dias grátis</span>
                  <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> 100% seguro</span>
                  <span className="flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Sem cartão</span>
                </div>
              </div>

              {/* Right: Floating mockups */}
              <div className="min-w-0 w-full flex items-end justify-center lg:justify-end gap-3 sm:gap-6 animate-fade-in" style={{ animationDelay: '0.3s' }}>
                {/* Desktop mockup */}
                <div className="relative min-w-0" style={{ animation: 'heroFloat 4s ease-in-out infinite' }}>
                  <div className="w-[64vw] max-w-[320px] md:max-w-[380px] rounded-xl overflow-hidden shadow-2xl border border-white/10">
                    <div className="h-8 bg-gray-200 flex items-center px-3 gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                      <span className="ml-3 text-[10px] text-gray-500 font-medium">EloLab — Dashboard</span>
                    </div>
                    <div className="bg-white p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: C.grad }}>
                          <BarChart3 className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold" style={{ color: C.dark }}>Painel</p>
                          <p className="text-[8px]" style={{ color: C.textL }}>Hoje, 15 Abr 2026</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {[
                          { label: 'Agendamentos', val: '55', icon: Calendar },
                          { label: 'Pacientes', val: '248', icon: Users },
                          { label: 'Receita', val: 'R$ 29.9k', icon: Receipt },
                        ].map((s, i) => (
                          <div key={i} className="bg-gray-50 rounded-lg p-2 text-center">
                            <s.icon className="w-3 h-3 mx-auto mb-1" style={{ color: C.coral }} />
                            <p className="text-xs font-extrabold" style={{ color: C.dark }}>{s.val}</p>
                            <p className="text-[7px]" style={{ color: C.textL }}>{s.label}</p>
                          </div>
                        ))}
                      </div>
                      <div className="h-16 rounded-lg bg-gradient-to-r from-blue-50 to-teal-50 flex items-center justify-center">
                        <div className="flex items-end gap-1">
                          {[30, 50, 35, 60, 45, 70, 55].map((h, i) => (
                            <div key={i} className="w-4 rounded-t" style={{ height: `${h * 0.6}px`, background: i === 5 ? C.coral : 'hsl(210,60%,85%)' }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mx-auto w-20 h-5 bg-gray-300 rounded-b-lg" />
                  <div className="mx-auto w-32 h-2 bg-gray-200 rounded-b-lg" />
                </div>

                {/* Phone mockup */}
                <div className="relative -mb-4 min-w-0" style={{ animation: 'heroFloat 4s ease-in-out infinite 1s' }}>
                  <div className="w-[28vw] max-w-[140px] md:max-w-[160px] rounded-[24px] overflow-hidden shadow-2xl border-4 border-gray-800 bg-gray-800">
                    <div className="h-5 bg-gray-800 flex justify-center">
                      <div className="w-16 h-3 bg-gray-900 rounded-b-xl" />
                    </div>
                    <div className="bg-white p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: C.grad }}>
                          <Calendar className="w-2.5 h-2.5 text-white" />
                        </div>
                        <p className="text-[8px] font-bold" style={{ color: C.dark }}>Agenda</p>
                      </div>
                      {[
                        { time: '08:00', name: 'Maria Silva', type: 'Consulta' },
                        { time: '09:30', name: 'João Costa', type: 'Retorno' },
                        { time: '10:00', name: 'Ana Lima', type: 'Exame' },
                        { time: '11:00', name: 'Pedro Santos', type: 'Consulta' },
                      ].map((a, i) => (
                        <div key={i} className="flex items-center gap-1.5 py-1.5 border-b border-gray-50 last:border-0">
                          <span className="text-[7px] font-mono font-bold w-7 shrink-0" style={{ color: C.coral }}>{a.time}</span>
                          <div className="min-w-0">
                            <p className="text-[7px] font-bold truncate" style={{ color: C.dark }}>{a.name}</p>
                            <p className="text-[6px]" style={{ color: C.textL }}>{a.type}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="h-4 bg-gray-800 flex justify-center items-center">
                      <div className="w-10 h-1 bg-gray-600 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══ STATS STRIP ══ */}
        <section className="py-16 md:py-20 relative">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
              <StatCounter end={500} suffix="+" label="Profissionais de saúde" icon={Users} />
              <StatCounter end={24} suffix="" label="Módulos integrados" icon={Zap} />
              <StatCounter end={99} suffix=".9%" label="Uptime garantido" icon={TrendingUp} />
              <StatCounter end={40} suffix="%" label="Menos faltas" icon={Award} />
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
                    <Button onClick={goToAuth} className="mt-8 rounded-full px-8 py-3 text-sm font-bold text-white border-0 transition-all hover:scale-105 hover:shadow-lg"
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
              Tudo que o{' '}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: C.grad }}>EloLab</span>
              {' '}oferece
            </h2>
            <p className="mt-3 text-lg" style={{ color: C.textL }}>
              +24 módulos integrados para sua clínica funcionar com máxima eficiência
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
                Escolha o plano{' '}
                <span className="bg-clip-text text-transparent" style={{ backgroundImage: C.grad }}>ideal para você</span>
              </h2>
              <p className="mt-3 text-lg" style={{ color: C.textL }}>
                Comece com 3 dias grátis. Cancele quando quiser.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
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
                      R$ {plan.price}
                    </span>
                    <span className="text-sm font-medium" style={{ color: C.textL }}>/mês</span>
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
                      <Clock className="w-4 h-4 mr-2" /> Teste Grátis 3 Dias
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => openCheckout(plan, 'buy')}
                      className="w-full rounded-full py-3 font-bold border-2 transition-all hover:scale-[1.02]"
                      style={{ borderColor: C.coral, color: C.coral }}
                    >
                      <CreditCard className="w-4 h-4 mr-2" /> Assinar Agora
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ CHECKOUT MODAL ══ */}
        {checkoutOpen && selectedPlan && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => !loading && setCheckoutOpen(false)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => !loading && setCheckoutOpen(false)}
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
                  {checkoutMode === 'trial' ? 'Iniciar Teste Grátis' : 'Assinar Plano'}
                </h3>
                <p className="text-sm mt-1" style={{ color: C.textL }}>
                  {selectedPlan.name} — R$ {selectedPlan.price}/mês
                  {checkoutMode === 'trial' && ' (3 dias grátis)'}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: C.text }}>Nome completo *</label>
                  <Input
                    value={formData.nome}
                    onChange={(e) => setFormData(p => ({ ...p, nome: e.target.value }))}
                    placeholder="Seu nome"
                    className="rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: C.text }}>E-mail *</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                    placeholder="seu@email.com"
                    className="rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: C.text }}>Telefone</label>
                  <Input
                    value={formData.telefone}
                    onChange={(e) => setFormData(p => ({ ...p, telefone: e.target.value }))}
                    placeholder="(00) 00000-0000"
                    className="rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: C.text }}>Nome da Clínica</label>
                  <Input
                    value={formData.clinica}
                    onChange={(e) => setFormData(p => ({ ...p, clinica: e.target.value }))}
                    placeholder="Sua clínica"
                    className="rounded-xl"
                  />
                </div>
              </div>

              <Button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full mt-6 rounded-full py-3 font-bold text-white border-0 transition-all hover:scale-[1.02]"
                style={{ background: C.grad }}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando...</>
                ) : checkoutMode === 'trial' ? (
                  <>Começar Teste Grátis <ArrowRight className="w-4 h-4 ml-2" /></>
                ) : (
                  <>Ir para Pagamento <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </Button>

              <p className="text-center text-xs mt-4" style={{ color: C.textL }}>
                {checkoutMode === 'trial'
                  ? 'Sem cartão de crédito. Após o teste, assine para continuar.'
                  : 'Pagamento seguro via Mercado Pago. Cancele quando quiser.'}
              </p>
            </div>
          </div>
        )}

        {/* ══ TESTIMONIALS CAROUSEL ══ */}
        <section id="depoimentos" className="py-20 md:py-28 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ color: C.dark }}>
                O que estão falando sobre o{' '}
                <span className="bg-clip-text text-transparent" style={{ backgroundImage: C.grad }}>EloLab?</span>
              </h2>
              <p className="mt-3 text-lg" style={{ color: C.textL }}>Mais de 500 profissionais de saúde confiam no EloLab</p>
            </div>
          </div>

          {/* Row 1 */}
          <div className="relative mb-5">
            <div className="flex gap-5 animate-[scrollLeft_60s_linear_infinite] w-max">
              {[...testimonials, ...testimonials].map((t, i) => (
                <div key={`r1-${i}`} className="flex-shrink-0 w-[280px] sm:w-[340px] bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-[hsl(20,30%,90%)] hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                  <div className="flex items-center gap-3 mb-4">
                    <img src={t.avatar} alt={t.name} className="w-12 h-12 rounded-full object-cover border-2 border-[hsl(12,76%,61%,0.3)]" loading="lazy" />
                    <div>
                      <p className="font-bold text-sm" style={{ color: C.dark }}>{t.name}</p>
                      <p className="text-xs" style={{ color: C.textL }}>{t.clinic}</p>
                    </div>
                  </div>
                  <div className="flex gap-0.5 mb-3">
                    {[1,2,3,4,5].map(j => <Star key={j} className="w-4 h-4 fill-[hsl(38,92%,50%)] text-[hsl(38,92%,50%)]" />)}
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: C.text }}>"{t.text}"</p>
                </div>
              ))}
            </div>
          </div>

          {/* Row 2 */}
          <div className="relative">
            <div className="flex gap-5 animate-[scrollRight_55s_linear_infinite] w-max">
              {[...testimonials.slice(10), ...testimonials.slice(0, 10), ...testimonials.slice(10), ...testimonials.slice(0, 10)].map((t, i) => (
                <div key={`r2-${i}`} className="flex-shrink-0 w-[280px] sm:w-[340px] bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-[hsl(20,30%,90%)] hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                  <div className="flex items-center gap-3 mb-4">
                    <img src={t.avatar} alt={t.name} className="w-12 h-12 rounded-full object-cover border-2 border-[hsl(12,76%,61%,0.3)]" loading="lazy" />
                    <div>
                      <p className="font-bold text-sm" style={{ color: C.dark }}>{t.name}</p>
                      <p className="text-xs" style={{ color: C.textL }}>{t.clinic}</p>
                    </div>
                  </div>
                  <div className="flex gap-0.5 mb-3">
                    {[1,2,3,4,5].map(j => <Star key={j} className="w-4 h-4 fill-[hsl(38,92%,50%)] text-[hsl(38,92%,50%)]" />)}
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: C.text }}>"{t.text}"</p>
                </div>
              ))}
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
                Tire suas dúvidas sobre o EloLab
              </p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-[hsl(20,30%,90%)] p-6 md:p-8 shadow-sm">
              {faqItems.map((item, i) => (
                <FaqItem key={i} q={item.q} a={item.a} />
              ))}
            </div>
            <div className="text-center mt-8">
              <p className="text-sm" style={{ color: C.textL }}>
                Ainda tem dúvidas?{' '}
                <a href="https://wa.me/5511937687369" target="_blank" rel="noopener noreferrer"
                  className="font-bold hover:underline" style={{ color: C.coral }}>
                  Fale conosco no WhatsApp
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
                  Pronto para transformar sua clínica?
                </h2>
                <p className="mt-4 text-lg text-white/70 max-w-xl mx-auto">
                  Comece agora com 3 dias grátis. Sem cartão de crédito. Sem compromisso.
                </p>
                <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                  <Button size="lg" onClick={goToAuth}
                    className="rounded-full px-10 text-base font-bold border-2 border-white bg-white hover:bg-white/90 transition-all hover:scale-105 hover:shadow-xl"
                    style={{ color: 'hsl(215,75%,30%)' }}>
                    Começar teste grátis <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <a href="https://wa.me/5511937687369" target="_blank" rel="noopener noreferrer">
                    <Button size="lg" variant="ghost"
                      className="rounded-full px-10 text-base font-bold text-white border-2 border-white/30 hover:bg-white/10 transition-all w-full">
                      <Headphones className="w-4 h-4 mr-2" /> Falar com consultor
                    </Button>
                  </a>
                </div>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-white/50">
                  <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Dados protegidos</span>
                  <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> LGPD compliant</span>
                  <span className="flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Sem cartão</span>
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
                <p className="text-sm text-white/50 leading-relaxed">Sistema completo de gestão para clínicas médicas e laboratórios.</p>
                <div className="mt-4 flex gap-3">
                  <a href="https://wa.me/5511937687369" target="_blank" rel="noopener noreferrer"
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors">
                    <Phone className="w-4 h-4 text-white/70" />
                  </a>
                  <a href="mailto:suporte@elolab.com.br"
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
                  <li><button onClick={() => scrollTo('depoimentos')} className="hover:text-white transition-colors">Depoimentos</button></li>
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
              <p className="text-xs text-white/30">CNPJ: 00.000.000/0001-00</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
