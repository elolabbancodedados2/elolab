import { Suspense, lazy } from "react";
import { MotionConfig } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyErrorMessage } from "@/components/ErrorState";
import { createBrowserRouter, RouterProvider, Routes, Route, Navigate, useSearchParams } from "react-router-dom";
import { SupabaseAuthProvider } from "@/contexts/SupabaseAuthContext";
import { useWhatsAppBookingNotifications } from "@/hooks/useWhatsAppBookingNotifications";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SupabaseProtectedRoute } from "@/components/SupabaseProtectedRoute";
import { MainLayout } from "@/components/layout/MainLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PlatformAnnouncements } from "@/components/PlatformAnnouncements";
import { OperationalGuard } from "@/components/OperationalGuard";
import { InstallPWA } from "@/components/InstallPWA";
import { SubscriptionGuard } from "@/components/SubscriptionGuard";
import { PlanFeatureGuard } from "@/components/PlanFeatureGuard";
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const BoasVindasClinica = lazy(() => import("@/pages/BoasVindasClinica"));
const DemonstracaoClinica = lazy(() => import("@/pages/DemonstracaoClinica"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const MinhaFilaTarefas = lazy(() => import("@/pages/MinhaFilaTarefas"));
const Agenda = lazy(() => import("@/pages/Agenda"));
const AppointmentPage = lazy(() => import("@/pages/AppointmentPage"));
const Pacientes = lazy(() => import("@/pages/Pacientes"));
const ConsentimentoLGPDTaskPage = lazy(() => import("@/pages/ConsentimentoLGPDTaskPage"));
const AtendimentoFila = lazy(() => import("@/pages/AtendimentoFila"));
const FilaOperacional = lazy(() => import("@/pages/Fila"));
const RecepcaoOperacional = lazy(() => import("@/pages/Recepcao"));
const FinalizarAtendimento = lazy(() => import("@/pages/FinalizarAtendimento"));
const Prontuarios = lazy(() => import("@/pages/Prontuarios"));
const NovoAdendoProntuarioPage = lazy(() => import("@/pages/NovoAdendoProntuarioPage"));
const NovoAnexoProntuarioPage = lazy(() => import("@/pages/NovoAnexoProntuarioPage"));
const NovoRetornoProntuarioPage = lazy(() => import("@/pages/NovoRetornoProntuarioPage"));
const Financeiro = lazy(() => import("@/pages/Financeiro"));
const AbrirCaixaPage = lazy(() => import("@/pages/AbrirCaixaPage"));
const FecharCaixaPage = lazy(() => import("@/pages/FecharCaixaPage"));
const CashOperationPage = lazy(() => import("@/pages/CashOperationPage").then(module => ({ default: module.CashOperationPage })));
const CashierSalePage = lazy(() => import("@/pages/CashierSalePage").then(module => ({ default: module.CashierSalePage })));
const Medicos = lazy(() => import("@/pages/Medicos"));
const Estoque = lazy(() => import("@/pages/Estoque"));
const Relatorios = lazy(() => import("@/pages/Relatorios"));
const RelatoriosSalvos = lazy(() => import("@/pages/RelatoriosSalvos"));
const CobrancaInadimplentes = lazy(() => import("@/pages/CobrancaInadimplentes"));
const Usuarios = lazy(() => import("@/pages/Usuarios"));
const Configuracoes = lazy(() => import("@/pages/Configuracoes"));
const ConfiguracoesAvancadas = lazy(() => import("@/pages/ConfiguracoesAvancadas"));
const Prescricoes = lazy(() => import("@/pages/Prescricoes"));
const Atestados = lazy(() => import("@/pages/Atestados"));
const Convenios = lazy(() => import("@/pages/Convenios"));
const ContasReceber = lazy(() => import("@/pages/ContasReceber"));
const ContaReceberEstorno = lazy(() => import("@/pages/ContaReceberEstorno"));
const ContasPagar = lazy(() => import("@/pages/ContasPagar"));
const ConvidarFuncionario = lazy(() => import("@/pages/ConvidarFuncionario"));
const Funcionarios = lazy(() => import("@/pages/Funcionarios"));
const GerenciadorLaboratorios = lazy(() => import("@/components/GerenciadorLaboratorios"));
const Exames = lazy(() => import("@/pages/Exames"));
const Triagem = lazy(() => import("@/pages/Triagem"));
const Salas = lazy(() => import("@/pages/Salas"));
const HigieneSalas = lazy(() => import("@/pages/HigieneSalas"));
const PatrimonioEquipamentos = lazy(() => import("@/pages/PatrimonioEquipamentos"));
const ListaEspera = lazy(() => import("@/pages/ListaEspera"));
const FluxoCaixa = lazy(() => import("@/pages/FluxoCaixa"));
const ClinicalTemplateEditor = lazy(() => import("@/pages/ClinicalTemplateEditor"));
const Encaminhamentos = lazy(() => import("@/pages/Encaminhamentos"));
const Automacoes = lazy(() => import("@/pages/Automacoes"));
const AgenteIA = lazy(() => import("@/pages/AgenteIA"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Planos = lazy(() => import("@/pages/Planos"));
const PlanoCheckout = lazy(() => import("@/pages/PlanoCheckout"));
const PedidosLaboratorioPage = lazy(() => import("@/pages/laboratorio/PedidosLaboratorioPanel"));
const NovaColetaPage = lazy(() => import("@/pages/laboratorio/NovaColetaPage"));
const ResultadosColetaPage = lazy(() => import("@/pages/laboratorio/ResultadosColetaPage"));
const AmostraPage = lazy(() => import("@/pages/laboratorio/AmostraPage"));
const GuiaPage = lazy(() => import("@/pages/laboratorio/GuiaPage"));
const PortalGuiasPage = lazy(() => import("@/pages/laboratorio/PortalGuiasPage"));
const NovaGuiaPage = lazy(() => import("@/pages/laboratorio/NovaGuiaPage"));
const Laboratorio = lazy(() => import("@/pages/Laboratorio"));
const PrecosExames = lazy(() => import("@/pages/PrecosExames"));
const PrecosServicos = lazy(() => import("@/pages/PrecosServicos"));
const EquipePage = lazy(() => import("@/pages/Equipe"));
const DocumentosClinicos = lazy(() => import("@/pages/DocumentosClinicos"));
const ContasPage = lazy(() => import("@/pages/Contas"));
const GestaoFluxo = lazy(() => import("@/pages/GestaoFluxo"));
const TemplatesUnificado = lazy(() => import("@/pages/TemplatesUnificado"));
const Tarefas = lazy(() => import("@/pages/Tarefas"));
const Retornos = lazy(() => import("@/pages/Retornos"));
const MapaColeta = lazy(() => import("@/pages/MapaColeta"));
const LaudoPage = lazy(() => import("@/pages/laboratorio/LaudoPage"));
const LaudosLab = lazy(() => import("@/pages/LaudosLab"));
const GuiasExternas = lazy(() => import("@/pages/GuiasExternas"));
const PortalGuias = lazy(() => import("@/pages/PortalGuias"));
const Documentacao = lazy(() => import("@/pages/Documentacao"));
const PainelAdmin = lazy(() => import("@/pages/PainelAdmin"));
const PlatformClinicas = lazy(() => import("@/pages/PlatformClinicas"));
const PlatformCRM = lazy(() => import("@/pages/PlatformCRM"));
const PlatformSaude = lazy(() => import("@/pages/PlatformSaude"));
const CentralSuporte = lazy(() => import("@/pages/CentralSuporte"));
const PlatformIA = lazy(() => import("@/pages/PlatformIA"));
const PlatformComunicacao = lazy(() => import("@/pages/PlatformComunicacao"));
const PlatformOperacoes = lazy(() => import("@/pages/PlatformOperacoes"));
const PlatformLGPD = lazy(() => import("@/pages/PlatformLGPD"));
const PlatformErros = lazy(() => import("@/pages/PlatformErros"));
const PlatformBackups = lazy(() => import("@/pages/PlatformBackups"));
const PlatformRelatorioExecutivo = lazy(() => import("@/pages/PlatformRelatorioExecutivo"));
const PlatformCobrancas = lazy(() => import("@/pages/PlatformCobrancas"));
const PlatformHistoricoFinanceiro = lazy(() => import("@/pages/PlatformHistoricoFinanceiro"));
const AcessoAssistido = lazy(() => import("@/pages/AcessoAssistido"));
const PlatformIntegracoes = lazy(() => import("@/pages/PlatformIntegracoes"));
const PlatformFilas = lazy(() => import("@/pages/PlatformFilas"));
const PlatformIncidentes = lazy(() => import("@/pages/PlatformIncidentes"));
const PlatformSeguranca = lazy(() => import("@/pages/PlatformSeguranca"));
const PlatformConsumo = lazy(() => import("@/pages/PlatformConsumo"));
const PlatformOnboarding = lazy(() => import("@/pages/PlatformOnboarding"));
const OnboardingClinica = lazy(() => import("@/pages/OnboardingClinica"));
const PlatformDominios = lazy(() => import("@/pages/PlatformDominios"));
const PlatformRelatoriosAgendados = lazy(() => import("@/pages/PlatformRelatoriosAgendados"));
const TiposConsulta = lazy(() => import("@/pages/TiposConsulta"));
const RecepcaoCaixa = lazy(() => import("@/pages/RecepcaoCaixa"));
const ChatInterno = lazy(() => import("@/pages/ChatInterno"));
const CentralNotificacoes = lazy(() => import("@/pages/CentralNotificacoes"));
const MeuHistorico = lazy(() => import("@/pages/MeuHistorico"));
const PreferenciasPessoais = lazy(() => import("@/pages/PreferenciasPessoais"));
const FeedbackProduto = lazy(() => import("@/pages/FeedbackProduto"));
const IndicadoresProdutividade = lazy(() => import("@/pages/IndicadoresProdutividade"));
const Treinamento = lazy(() => import("@/pages/Treinamento"));
const TemplatesEmail = lazy(() => import("@/pages/TemplatesEmail"));
const Auth = lazy(() => import("@/pages/Auth"));
const AceitarConvite = lazy(() => import("@/pages/AceitarConvite"));
const RedefinirSenha = lazy(() => import("@/pages/RedefinirSenha"));
const PainelTV = lazy(() => import("@/pages/PainelTV"));
const PortalPaciente = lazy(() => import("@/pages/PortalPaciente"));
const PortalPacientesClinica = lazy(() => import("@/pages/PortalPacientesClinica"));
const AgendamentoOnline = lazy(() => import("@/pages/AgendamentoOnline"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const PoliticaPrivacidade = lazy(() => import("@/pages/PoliticaPrivacidade"));
const PoliticaCookies = lazy(() => import("@/pages/PoliticaCookies"));
const TermosUso = lazy(() => import("@/pages/TermosUso"));
const Seguranca = lazy(() => import("@/pages/Seguranca"));
const LgpdPacientes = lazy(() => import("@/pages/LgpdPacientes"));
const VitaisGraficos = lazy(() => import("@/pages/VitaisGraficos"));
const AnalisePreditiva = lazy(() => import("@/pages/AnalisePreditiva"));
const VerificarAssinatura = lazy(() => import("@/pages/VerificarAssinatura"));
const FaturamentoConvenios = lazy(() => import("@/pages/FaturamentoConvenios"));
const NovoLoteTissPage = lazy(() => import("@/pages/NovoLoteTissPage"));
const RepassesMedicos = lazy(() => import("@/pages/RepassesMedicos"));
const RepassePagamentoPage = lazy(() => import("@/pages/RepassePagamentoPage"));
const BankStatementImportPage = lazy(() => import("@/pages/BankStatementImportPage"));
const Interoperabilidade = lazy(() => import("@/pages/Interoperabilidade"));
const Teleconsulta = lazy(() => import("@/pages/Teleconsulta"));
const SegurancaAssistencial = lazy(() => import("@/pages/SegurancaAssistencial"));
import { CookieConsent } from "@/components/CookieConsent";
import { BrandLoadingScreen } from "@/components/BrandLoadingScreen";
import { MobileTableAdapter } from "@/components/ui/table";

const queryClient = new QueryClient({
  // Falha de carregamento nunca deve virar tela em branco silenciosa:
  // o usuário recebe uma mensagem clara (uma única vez por erro).
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.suppressGlobalErrorToast === true) return;
      toast.error(friendlyErrorMessage(error), { id: `query-error-${friendlyErrorMessage(error)}` });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes garbage collection
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * App initializer: starts notification scheduler after auth is ready.
 * Renders nothing — children are passed through.
 */
function AppInitializer({ children }: { children: React.ReactNode }) {
  useWhatsAppBookingNotifications();
  return <><MobileTableAdapter />{children}</>;
}

function RedirecionarTriagem() {
  const [searchParams] = useSearchParams();
  const destino = new URLSearchParams(searchParams);
  destino.set('tab', 'triagem');
  return <Navigate to={`/fila?${destino.toString()}`} replace />;
}

function RouteFallback() {
  return <BrandLoadingScreen message="Abrindo seu ambiente" detail="Estamos carregando esta área do EloLab." />;
}

/**
 * Routing mode based on hostname:
 * - www.elolab.com.br / elolab.com.br → Landing only (site institucional)
 * - app.elolab.com.br / localhost / preview → Full SaaS app
 */
function getRoutingMode(): 'landing' | 'app' {
  const host = window.location.hostname;
  if (
    host === 'elolab.com.br' ||
    host === 'www.elolab.com.br'
  ) {
    return 'landing';
  }
  // app.elolab.com.br / localhost / preview → Full SaaS app
  return 'app';
}

function AppRoutes() {
  const mode = getRoutingMode();
  return (
              <SupabaseAuthProvider>
                <OperationalGuard><AppInitializer>
                <NotificationBanner />
                <PlatformAnnouncements />
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    {mode === 'landing' ? (
                      <>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/demonstracao" element={<DemonstracaoClinica />} />
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/login" element={<Navigate to="/auth" replace />} />
                        <Route path="/aceitar-convite" element={<AceitarConvite />} />
                        <Route path="/redefinir-senha" element={<RedefinirSenha />} />
                        <Route path="/politica-privacidade" element={<PoliticaPrivacidade />} />
                        <Route path="/politica-cookies" element={<PoliticaCookies />} />
                        <Route path="/termos-uso" element={<TermosUso />} />
                        <Route path="/planos" element={<Navigate to="/#planos" replace />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </>
                    ) : (
                      <>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/demonstracao" element={<DemonstracaoClinica />} />
                        <Route path="/landing" element={<LandingPage />} />
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/login" element={<Navigate to="/auth" replace />} />
                        <Route path="/aceitar-convite" element={<AceitarConvite />} />
                        <Route path="/redefinir-senha" element={<RedefinirSenha />} />
                        <Route path="/politica-privacidade" element={<PoliticaPrivacidade />} />
                        <Route path="/politica-cookies" element={<PoliticaCookies />} />
                        <Route path="/termos-uso" element={<TermosUso />} />
                        <Route path="/portal-paciente" element={<PortalPaciente />} />
                        <Route path="/teleconsulta/:sessionId" element={<Teleconsulta />} />
                        <Route path="/agendar/:clinicaId" element={<AgendamentoOnline />} />
                        <Route path="/portal-guias/:token" element={<PortalGuias />} />
                        <Route path="/verificar-assinatura/:codigo" element={<VerificarAssinatura />} />
                        <Route path="/planos/checkout/:slug" element={<SupabaseProtectedRoute allowedRoles={['admin']} permitirCompradorPendente><PlanoCheckout /></SupabaseProtectedRoute>} />
                        <Route path="/painel-tv" element={<SupabaseProtectedRoute><PainelTV /></SupabaseProtectedRoute>} />

                        <Route
                          element={
                            <SupabaseProtectedRoute>
                              <SubscriptionGuard>
                                <MainLayout />
                              </SubscriptionGuard>
                            </SupabaseProtectedRoute>
                          }
                        >
                          <Route path="/dashboard" element={<Dashboard />} />
                          <Route path="/boas-vindas" element={<SupabaseProtectedRoute allowedRoles={['admin']}><BoasVindasClinica /></SupabaseProtectedRoute>} />
                          <Route path="/chat" element={<ChatInterno />} />
                          <Route path="/notificacoes" element={<CentralNotificacoes />} />
                          <Route path="/portal-pacientes" element={<SupabaseProtectedRoute allowedRoles={['admin']}><PortalPacientesClinica /></SupabaseProtectedRoute>} />
                          <Route path="/meu-historico" element={<MeuHistorico />} />
                          <Route path="/preferencias" element={<PreferenciasPessoais />} />
                          <Route path="/feedback" element={<FeedbackProduto />} />
                          <Route path="/indicadores" element={<IndicadoresProdutividade />} />
                          <Route path="/treinamento" element={<Treinamento />} />
                          <Route path="/agenda" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'medico']}><Agenda /></SupabaseProtectedRoute>} />
                          <Route path="/agenda/nova" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'medico']}><AppointmentPage /></SupabaseProtectedRoute>} />
                          <Route path="/agenda/:appointmentId/editar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'medico']}><AppointmentPage /></SupabaseProtectedRoute>} />
                          <Route path="/prontuarios/:prontuarioId/adendos/novo" element={<SupabaseProtectedRoute allowedRoles={['medico']}><NovoAdendoProntuarioPage /></SupabaseProtectedRoute>} />
                          <Route path="/prontuarios/:prontuarioId/anexos/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><NovoAnexoProntuarioPage /></SupabaseProtectedRoute>} />
                          <Route path="/prontuarios/retornos/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><NovoRetornoProntuarioPage /></SupabaseProtectedRoute>} />
                          <Route path="/prontuarios/:prontuarioId/retornos/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><NovoRetornoProntuarioPage /></SupabaseProtectedRoute>} />
                          <Route path="/prontuarios/*" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><Prontuarios /></SupabaseProtectedRoute>} />
                          <Route path="/documentos-clinicos" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><DocumentosClinicos /></SupabaseProtectedRoute>} />
                          <Route path="/documentos-clinicos/nova-prescricao" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><Prescricoes creationPage /></SupabaseProtectedRoute>} />
                          <Route path="/prescricoes" element={<Navigate to="/documentos-clinicos" replace />} />
                          <Route path="/atestados" element={<Navigate to="/documentos-clinicos?tab=atestados" replace />} />
                          <Route path="/documentos-clinicos/novo-atestado" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><Atestados creationPage /></SupabaseProtectedRoute>} />
                          <Route path="/atestados/:certificateId" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><Atestados /></SupabaseProtectedRoute>} />
                          <Route path="/exames" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><Exames /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/exames/laboratorios" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><GerenciadorLaboratorios /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/exames/laboratorios/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><GerenciadorLaboratorios /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/exames/laboratorios/:laboratoryId/editar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><GerenciadorLaboratorios /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/exames/nova" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><Exames creationPage /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/exames/:examId" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><Exames /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/exames/:examId/resultado" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><Exames resultPage /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/triagem/nova" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><Triagem creationPage /></SupabaseProtectedRoute>} />
                          <Route path="/fila/adicionar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'medico']}><FilaOperacional creationPage /></SupabaseProtectedRoute>} />
                          <Route path="/atendimentos/:agendamentoId/finalizar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'medico']}><FinalizarAtendimento /></SupabaseProtectedRoute>} />
                          <Route path="/triagem" element={<RedirecionarTriagem />} />
                          <Route path="/encaminhamentos" element={<Navigate to="/documentos-clinicos?tab=encaminhamentos" replace />} />
                          <Route path="/documentos-clinicos/novo-encaminhamento" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><Encaminhamentos creationPage /></SupabaseProtectedRoute>} />
                          <Route path="/encaminhamentos/:referralId" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><Encaminhamentos /></SupabaseProtectedRoute>} />
                          <Route path="/retornos" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'recepcao']}><Retornos /></SupabaseProtectedRoute>} />
                          <Route path="/retornos/:returnId/agendar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'recepcao']}><Retornos /></SupabaseProtectedRoute>} />
                          <Route path="/laboratorio/pedidos/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><PedidosLaboratorioPage task="new" /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/laboratorio/coletas/nova" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><NovaColetaPage /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/laboratorio/coletas/:coletaId/resultados" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><ResultadosColetaPage /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/laboratorio/pedidos/:pedidoId/historico" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><PedidosLaboratorioPage task="history" /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/laboratorio" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><Laboratorio /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/mapa-coleta" element={<SupabaseProtectedRoute allowedRoles={['admin', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><MapaColeta /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/mapa-coleta/:coletaId" element={<SupabaseProtectedRoute allowedRoles={['admin', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><AmostraPage /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/guias-externas" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><GuiasExternas /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/guias-externas/nova" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><NovaGuiaPage /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/guias-externas/portal" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><PortalGuiasPage /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/guias-externas/:guiaId" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><GuiaPage /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/laudos-lab" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><LaudosLab /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/laudos-lab/:coletaId" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><PlanFeatureGuard feature="exames" requiredPlan="EloLab Pro"><LaudoPage /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/pacientes/:patientId/consentimentos/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'medico']}><ConsentimentoLGPDTaskPage task="novo" /></SupabaseProtectedRoute>} />
                          <Route path="/pacientes/:patientId/consentimentos/:consentType/revogar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'medico']}><ConsentimentoLGPDTaskPage task="revogar" /></SupabaseProtectedRoute>} />
                          <Route path="/pacientes" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'medico']}><Pacientes /></SupabaseProtectedRoute>} />
                          <Route path="/pacientes/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'medico']}><Pacientes /></SupabaseProtectedRoute>} />
                          <Route path="/pacientes/:patientId/editar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'medico']}><Pacientes /></SupabaseProtectedRoute>} />
                          <Route path="/pacientes/:patientId" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'medico']}><Pacientes /></SupabaseProtectedRoute>} />
                          {/* `medico` estava fora, então o médico recebia "sem permissão" numa
                              tela que o banco já autorizava: fila_atendimento e agendamentos
                              liberam has_any_role exceto financeiro, e triagens liberam
                              can_access_clinical, que inclui médico. Sem ele, o médico não via
                              quem estava esperando para chamar o próximo paciente. */}
                          <Route path="/fila" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'medico']}><AtendimentoFila /></SupabaseProtectedRoute>} />
                          <Route path="/equipe" element={<SupabaseProtectedRoute allowedRoles={['admin']}><EquipePage /></SupabaseProtectedRoute>} />
                          <Route path="/equipe/medicos" element={<Navigate to="/equipe" replace />} />
                          <Route path="/equipe/convites" element={<Navigate to="/equipe?aba=convites" replace />} />
                          <Route path="/equipe/convites/novo" element={<SupabaseProtectedRoute allowedRoles={['admin']}><ConvidarFuncionario /></SupabaseProtectedRoute>} />
                          <Route path="/equipe/funcionarios" element={<Navigate to="/equipe?aba=funcionarios" replace />} />
                          <Route path="/equipe/funcionarios/novo" element={<SupabaseProtectedRoute allowedRoles={['admin']}><Funcionarios task="new" /></SupabaseProtectedRoute>} />
                          <Route path="/equipe/funcionarios/:employeeId/editar" element={<SupabaseProtectedRoute allowedRoles={['admin']}><Funcionarios task="edit" /></SupabaseProtectedRoute>} />
                          <Route path="/equipe/funcionarios/perfis" element={<SupabaseProtectedRoute allowedRoles={['admin']}><Funcionarios task="labels" /></SupabaseProtectedRoute>} />
                          <Route path="/equipe/medicos/novo" element={<SupabaseProtectedRoute allowedRoles={['admin']}><Medicos task="new" /></SupabaseProtectedRoute>} />
                          <Route path="/equipe/medicos/:doctorId" element={<SupabaseProtectedRoute allowedRoles={['admin']}><Medicos task="profile" /></SupabaseProtectedRoute>} />
                          <Route path="/equipe/medicos/:doctorId/editar" element={<SupabaseProtectedRoute allowedRoles={['admin']}><Medicos task="edit" /></SupabaseProtectedRoute>} />
                          <Route path="/equipe/medicos/:doctorId/disponibilidade" element={<SupabaseProtectedRoute allowedRoles={['admin']}><Medicos task="availability" /></SupabaseProtectedRoute>} />
                          <Route path="/medicos" element={<Navigate to="/equipe" replace />} />
                          <Route path="/funcionarios" element={<Navigate to="/equipe" replace />} />
                          <Route path="/gestao-fluxo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao']}><GestaoFluxo /></SupabaseProtectedRoute>} />
                          <Route path="/gestao-fluxo/espera/nova" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao']}><ListaEspera creationPage /></SupabaseProtectedRoute>} />
                          <Route path="/gestao-fluxo/espera" element={<Navigate to="/gestao-fluxo?tab=espera" replace />} />
                          <Route path="/gestao-fluxo/salas/nova" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao']}><Salas creationPage /></SupabaseProtectedRoute>} />
                          <Route path="/gestao-fluxo/salas/:roomId/editar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao']}><Salas /></SupabaseProtectedRoute>} />
                          <Route path="/salas" element={<Navigate to="/gestao-fluxo" replace />} />
                          <Route path="/gestao-fluxo/salas" element={<Navigate to="/gestao-fluxo" replace />} />
                          <Route path="/estoque/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'enfermagem']}><Estoque task="new" /></SupabaseProtectedRoute>} />
                          <Route path="/estoque/:itemId/editar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'enfermagem']}><Estoque task="edit" /></SupabaseProtectedRoute>} />
                          <Route path="/estoque/:itemId/entrada" element={<SupabaseProtectedRoute allowedRoles={['admin', 'enfermagem']}><Estoque task="entry" /></SupabaseProtectedRoute>} />
                          <Route path="/estoque/:itemId/saida" element={<SupabaseProtectedRoute allowedRoles={['admin', 'enfermagem']}><Estoque task="exit" /></SupabaseProtectedRoute>} />
                          <Route path="/estoque/:itemId/historico" element={<SupabaseProtectedRoute allowedRoles={['admin', 'enfermagem']}><Estoque task="history" /></SupabaseProtectedRoute>} />
                          <Route path="/estoque" element={<SupabaseProtectedRoute allowedRoles={['admin', 'enfermagem']}><Estoque /></SupabaseProtectedRoute>} />
                          <Route path="/convenios" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'financeiro']}><Convenios /></SupabaseProtectedRoute>} />
                          <Route path="/convenios/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'financeiro']}><Convenios creationPage /></SupabaseProtectedRoute>} />
                          <Route path="/convenios/:agreementId/editar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'financeiro']}><Convenios /></SupabaseProtectedRoute>} />
                          <Route path="/convenios/:agreementId/exames" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'financeiro']}><Convenios examTablePage /></SupabaseProtectedRoute>} />
                          <Route path="/convenios/:agreementId/exames/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'financeiro']}><Convenios examTablePage examCreationPage /></SupabaseProtectedRoute>} />
                          <Route path="/convenios/:agreementId/exames/:agreementExamId/editar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'financeiro']}><Convenios examTablePage /></SupabaseProtectedRoute>} />
                          <Route path="/faturamento-convenios" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><FaturamentoConvenios /></SupabaseProtectedRoute>} />
                          <Route path="/faturamento-convenios/lotes/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><NovoLoteTissPage /></SupabaseProtectedRoute>} />
                          <Route path="/repasses-medicos/:repasseId/pagamento" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><RepassePagamentoPage /></SupabaseProtectedRoute>} />
                          <Route path="/repasses-medicos" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><RepassesMedicos /></SupabaseProtectedRoute>} />
                          <Route path="/interoperabilidade" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><Interoperabilidade /></SupabaseProtectedRoute>} />
                          <Route path="/todos-templates/prescricoes/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><ClinicalTemplateEditor kind="prescription" /></SupabaseProtectedRoute>} />
                          <Route path="/todos-templates/prescricoes/:templateId/editar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><ClinicalTemplateEditor kind="prescription" /></SupabaseProtectedRoute>} />
                          <Route path="/todos-templates/atestados/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><ClinicalTemplateEditor kind="certificate" /></SupabaseProtectedRoute>} />
                          <Route path="/todos-templates/atestados/:templateId/editar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><ClinicalTemplateEditor kind="certificate" /></SupabaseProtectedRoute>} />
                          <Route path="/todos-templates/email/novo" element={<SupabaseProtectedRoute allowedRoles={['admin']}><TemplatesEmail task="new" /></SupabaseProtectedRoute>} />
                          <Route path="/todos-templates/email/:templateId/editar" element={<SupabaseProtectedRoute allowedRoles={['admin']}><TemplatesEmail task="edit" /></SupabaseProtectedRoute>} />
                          <Route path="/todos-templates/email/:templateId/ativar" element={<SupabaseProtectedRoute allowedRoles={['admin']}><TemplatesEmail task="activate" /></SupabaseProtectedRoute>} />
                          <Route path="/todos-templates/email/:templateId/historico" element={<SupabaseProtectedRoute allowedRoles={['admin']}><TemplatesEmail task="history" /></SupabaseProtectedRoute>} />
                          <Route path="/todos-templates" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><TemplatesUnificado /></SupabaseProtectedRoute>} />
                          <Route path="/templates" element={<Navigate to="/todos-templates" replace />} />
                          <Route path="/lista-espera" element={<Navigate to="/gestao-fluxo?tab=espera" replace />} />
                          <Route path="/tarefas/nova" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'financeiro', 'medico']}><Tarefas task="new" /></SupabaseProtectedRoute>} />
                          <Route path="/tarefas/:taskId/editar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'financeiro', 'medico']}><Tarefas task="edit" /></SupabaseProtectedRoute>} />
                          <Route path="/tarefas" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'financeiro', 'medico']}><Tarefas /></SupabaseProtectedRoute>} />
                          <Route path="/minha-fila" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'financeiro', 'medico']}><MinhaFilaTarefas /></SupabaseProtectedRoute>} />
                          <Route path="/recepcao/encaixe" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao']}><RecepcaoOperacional task="walk-in" /></SupabaseProtectedRoute>} />
                          <Route path="/recepcao/caixa/abrir" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'financeiro']}><AbrirCaixaPage /></SupabaseProtectedRoute>} />
                          <Route path="/recepcao/caixa/sangria" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'financeiro']}><CashOperationPage operation="sangria" /></SupabaseProtectedRoute>} />
                          <Route path="/recepcao/caixa/suprimento" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'financeiro']}><CashOperationPage operation="suprimento" /></SupabaseProtectedRoute>} />
                          <Route path="/recepcao/caixa/despesa" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'financeiro']}><CashOperationPage operation="despesa" /></SupabaseProtectedRoute>} />
                          <Route path="/recepcao/caixa/venda" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'financeiro']}><CashierSalePage /></SupabaseProtectedRoute>} />
                          <Route path="/recepcao/caixa/:caixaId/fechar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'financeiro']}><FecharCaixaPage /></SupabaseProtectedRoute>} />
                          <Route path="/recepcao/pagamentos/:lancamentoId" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'financeiro']}><RecepcaoOperacional task="payment" /></SupabaseProtectedRoute>} />
                          <Route path="/recepcao" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'financeiro']}><RecepcaoCaixa /></SupabaseProtectedRoute>} />
                          <Route path="/caixa" element={<Navigate to="/recepcao?tab=caixa" replace />} />
                          <Route path="/caixa-diario" element={<Navigate to="/recepcao?tab=caixa" replace />} />
                          <Route path="/financeiro" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><Financeiro /></SupabaseProtectedRoute>} />
                          <Route path="/contas/receber/:lancamentoId/estorno" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><ContaReceberEstorno /></SupabaseProtectedRoute>} />
                          <Route path="/contas/receber/:lancamentoId/recebimento" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><ContasReceber /></SupabaseProtectedRoute>} />
                          <Route path="/contas/receber/nova" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><ContasReceber /></SupabaseProtectedRoute>} />
                          <Route path="/contas/pagar/nova" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><ContasPagar /></SupabaseProtectedRoute>} />
                          <Route path="/contas" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><ContasPage /></SupabaseProtectedRoute>} />
                          <Route path="/contas-receber" element={<Navigate to="/contas?tab=receber" replace />} />
                          <Route path="/contas-pagar" element={<Navigate to="/contas?tab=pagar" replace />} />
                          <Route path="/fluxo-caixa/extrato" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><BankStatementImportPage /></SupabaseProtectedRoute>} />
                          <Route path="/fluxo-caixa" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><FluxoCaixa /></SupabaseProtectedRoute>} />
                          {/* A tela legada usava pagamentos_mercadopago (checkout online),
                              enquanto o financeiro da clínica usa Contas + pagamentos.
                              Mantemos o endereço antigo como alias para não deixar
                              links salvos abrirem dados incompletos. */}
                          <Route path="/pagamentos" element={<Navigate to="/contas?tab=receber" replace />} />
                          <Route path="/precos-servicos" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><PrecosServicos /></SupabaseProtectedRoute>} />
                          <Route path="/precos-servicos/tipos/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><TiposConsulta creationPage /></SupabaseProtectedRoute>} />
                          <Route path="/precos-servicos/tipos/:consultationTypeId/editar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><TiposConsulta /></SupabaseProtectedRoute>} />
                          <Route path="/precos-servicos/tipos/:consultationTypeId/precos" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><TiposConsulta pricesPage /></SupabaseProtectedRoute>} />
                          <Route path="/precos-servicos/tipos" element={<Navigate to="/precos-servicos?tab=tipos" replace />} />
                          <Route path="/precos-exames" element={<Navigate to="/precos-servicos" replace />} />
                          <Route path="/precos-servicos/exames" element={<Navigate to="/precos-servicos" replace />} />
                          <Route path="/precos-servicos/exames/particular" element={<Navigate to="/precos-servicos" replace />} />
                          <Route path="/precos-servicos/exames/convenios" element={<Navigate to="/precos-servicos" state={{ examPriceTab: 'convenio' }} replace />} />
                          <Route path="/precos-servicos/exames/particular/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><PrecosExames task="particular-new" /></SupabaseProtectedRoute>} />
                          <Route path="/precos-servicos/exames/particular/editar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><PrecosExames task="particular-edit" /></SupabaseProtectedRoute>} />
                          <Route path="/precos-servicos/exames/convenios/novo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><PrecosExames task="convenio-new" /></SupabaseProtectedRoute>} />
                          <Route path="/precos-servicos/exames/convenios/:examPriceId/editar" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><PrecosExames task="convenio-edit" /></SupabaseProtectedRoute>} />
                          <Route path="/tipos-consulta" element={<Navigate to="/precos-servicos?tab=tipos" replace />} />
                          <Route path="/relatorios" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><Relatorios /></SupabaseProtectedRoute>} />
                          <Route path="/relatorios/salvos" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><RelatoriosSalvos /></SupabaseProtectedRoute>} />
                          <Route path="/cobranca-inadimplentes" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><CobrancaInadimplentes /></SupabaseProtectedRoute>} />
                          <Route path="/usuarios/:accountId/editar" element={<SupabaseProtectedRoute somentePlataforma><Usuarios editing /></SupabaseProtectedRoute>} />
                          <Route path="/usuarios" element={<SupabaseProtectedRoute somentePlataforma><Usuarios /></SupabaseProtectedRoute>} />
                          <Route path="/configuracoes" element={<SupabaseProtectedRoute allowedRoles={['admin']}><Configuracoes /></SupabaseProtectedRoute>} />
                          <Route path="/onboarding" element={<SupabaseProtectedRoute allowedRoles={['admin']}><OnboardingClinica /></SupabaseProtectedRoute>} />
                          <Route path="/configuracoes-avancadas" element={<SupabaseProtectedRoute allowedRoles={['admin']}><ConfiguracoesAvancadas /></SupabaseProtectedRoute>} />
                          <Route path="/automacoes" element={<SupabaseProtectedRoute allowedRoles={['admin']}><PlanFeatureGuard feature="automacoes" requiredPlan="EloLab Pro"><Automacoes /></PlanFeatureGuard></SupabaseProtectedRoute>} />
                          <Route path="/templates-email" element={<Navigate to="/todos-templates?tab=email" replace />} />
                          <Route path="/agente-ia" element={<SupabaseProtectedRoute allowedRoles={['admin']}><AgenteIA /></SupabaseProtectedRoute>} />
                          <Route path="/analytics" element={<SupabaseProtectedRoute allowedRoles={['admin']}><Analytics /></SupabaseProtectedRoute>} />
                          <Route path="/planos" element={<SupabaseProtectedRoute allowedRoles={['admin']} permitirCompradorPendente><Planos /></SupabaseProtectedRoute>} />
                          <Route path="/documentacao" element={<SupabaseProtectedRoute somentePlataforma><Documentacao /></SupabaseProtectedRoute>} />
                          <Route path="/painel-admin" element={<SupabaseProtectedRoute somentePlataforma><PainelAdmin /></SupabaseProtectedRoute>} />
                          <Route path="/admin/clinicas" element={<SupabaseProtectedRoute somentePlataforma><PlatformClinicas /></SupabaseProtectedRoute>} />
                          <Route path="/admin/crm" element={<SupabaseProtectedRoute somentePlataforma><PlatformCRM /></SupabaseProtectedRoute>} />
                          <Route path="/admin/saude" element={<SupabaseProtectedRoute somentePlataforma><PlatformSaude /></SupabaseProtectedRoute>} />
                          <Route path="/suporte" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'medico', 'financeiro']}><CentralSuporte /></SupabaseProtectedRoute>} />
                          <Route path="/admin/suporte" element={<SupabaseProtectedRoute somentePlataforma><CentralSuporte /></SupabaseProtectedRoute>} />
                          <Route path="/admin/ia" element={<SupabaseProtectedRoute somentePlataforma><PlatformIA /></SupabaseProtectedRoute>} />
                          <Route path="/admin/comunicacao" element={<SupabaseProtectedRoute somentePlataforma><PlatformComunicacao /></SupabaseProtectedRoute>} />
                          <Route path="/admin/operacoes" element={<SupabaseProtectedRoute somentePlataforma><PlatformOperacoes /></SupabaseProtectedRoute>} />
                          <Route path="/admin/lgpd" element={<SupabaseProtectedRoute somentePlataforma><PlatformLGPD /></SupabaseProtectedRoute>} />
                          <Route path="/admin/erros" element={<SupabaseProtectedRoute somentePlataforma><PlatformErros /></SupabaseProtectedRoute>} />
                          <Route path="/admin/backups" element={<SupabaseProtectedRoute somentePlataforma><PlatformBackups /></SupabaseProtectedRoute>} />
                          <Route path="/admin/relatorio-executivo" element={<SupabaseProtectedRoute somentePlataforma><PlatformRelatorioExecutivo /></SupabaseProtectedRoute>} />
                          <Route path="/admin/cobrancas" element={<SupabaseProtectedRoute somentePlataforma><PlatformCobrancas /></SupabaseProtectedRoute>} />
                          <Route path="/admin/historico-financeiro" element={<SupabaseProtectedRoute somentePlataforma><PlatformHistoricoFinanceiro /></SupabaseProtectedRoute>} />
                          <Route path="/admin/acesso-assistido" element={<SupabaseProtectedRoute somentePlataforma><AcessoAssistido /></SupabaseProtectedRoute>} />
                          <Route path="/admin/integracoes" element={<SupabaseProtectedRoute somentePlataforma><PlatformIntegracoes /></SupabaseProtectedRoute>} />
                          <Route path="/admin/filas" element={<SupabaseProtectedRoute somentePlataforma><PlatformFilas /></SupabaseProtectedRoute>} />
                          <Route path="/admin/incidentes" element={<SupabaseProtectedRoute somentePlataforma><PlatformIncidentes /></SupabaseProtectedRoute>} />
                          <Route path="/admin/seguranca" element={<SupabaseProtectedRoute somentePlataforma><PlatformSeguranca /></SupabaseProtectedRoute>} />
                          <Route path="/admin/consumo" element={<SupabaseProtectedRoute somentePlataforma><PlatformConsumo /></SupabaseProtectedRoute>} />
                          <Route path="/admin/onboarding" element={<SupabaseProtectedRoute somentePlataforma><PlatformOnboarding /></SupabaseProtectedRoute>} />
                          <Route path="/admin/dominios" element={<SupabaseProtectedRoute somentePlataforma><PlatformDominios /></SupabaseProtectedRoute>} />
                          <Route path="/admin/relatorios-agendados" element={<SupabaseProtectedRoute somentePlataforma><PlatformRelatoriosAgendados /></SupabaseProtectedRoute>} />
                          <Route path="/acesso-assistido" element={<SupabaseProtectedRoute allowedRoles={['admin']}><AcessoAssistido /></SupabaseProtectedRoute>} />
                          <Route path="/seguranca" element={<SupabaseProtectedRoute><Seguranca /></SupabaseProtectedRoute>} />
                          <Route path="/lgpd-pacientes" element={<SupabaseProtectedRoute allowedRoles={['admin']}><LgpdPacientes /></SupabaseProtectedRoute>} />
                          <Route path="/vitais-graficos" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><VitaisGraficos /></SupabaseProtectedRoute>} />
                          <Route path="/seguranca-assistencial" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><SegurancaAssistencial /></SupabaseProtectedRoute>} />
                          <Route path="/higiene-salas" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem']}><HigieneSalas /></SupabaseProtectedRoute>} />
                          <Route path="/patrimonio-equipamentos" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem']}><PatrimonioEquipamentos /></SupabaseProtectedRoute>} />
                          <Route path="/analise-preditiva" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao']}><AnalisePreditiva /></SupabaseProtectedRoute>} />
                        </Route>

                        <Route path="*" element={<NotFound />} />
                      </>
                    )}
                  </Routes>
                </Suspense>
                <InstallPWA />
                <CookieConsent />
                </AppInitializer></OperationalGuard>
              </SupabaseAuthProvider>

  );
}

// Data router enables supported navigation blocking for unsaved task pages.
const router = createBrowserRouter([{ path: "*", element: <ErrorBoundary><AppRoutes /></ErrorBoundary> }]);

function App() {

  // Nota: o antigo autoSetupDatabase() rodava a cada carregamento da aplicação e
  // chamava a edge function auto-migrate (DDL com service_role, sem checagem de
  // papel). Removido — migrações passam pelo fluxo normal do Supabase.

  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <RouterProvider router={router} />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
      </ErrorBoundary>
    </MotionConfig>
  );
}

export default App;
