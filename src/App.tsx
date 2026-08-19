import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyErrorMessage } from "@/components/ErrorState";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SupabaseAuthProvider } from "@/contexts/SupabaseAuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SupabaseProtectedRoute } from "@/components/SupabaseProtectedRoute";
import { MainLayout } from "@/components/layout/MainLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PlatformAnnouncements } from "@/components/PlatformAnnouncements";
import { OperationalGuard } from "@/components/OperationalGuard";
import { InstallPWA } from "@/components/InstallPWA";
import { SubscriptionGuard } from "@/components/SubscriptionGuard";
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Agenda = lazy(() => import("@/pages/Agenda"));
const Pacientes = lazy(() => import("@/pages/Pacientes"));
const AtendimentoFila = lazy(() => import("@/pages/AtendimentoFila"));
const Prontuarios = lazy(() => import("@/pages/Prontuarios"));
const Financeiro = lazy(() => import("@/pages/Financeiro"));
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
const ContasPagar = lazy(() => import("@/pages/ContasPagar"));
const Funcionarios = lazy(() => import("@/pages/Funcionarios"));
const Exames = lazy(() => import("@/pages/Exames"));
const Triagem = lazy(() => import("@/pages/Triagem"));
const Salas = lazy(() => import("@/pages/Salas"));
const ListaEspera = lazy(() => import("@/pages/ListaEspera"));
const FluxoCaixa = lazy(() => import("@/pages/FluxoCaixa"));
const Templates = lazy(() => import("@/pages/Templates"));
const Encaminhamentos = lazy(() => import("@/pages/Encaminhamentos"));
const Automacoes = lazy(() => import("@/pages/Automacoes"));
const AgenteIA = lazy(() => import("@/pages/AgenteIA"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Pagamentos = lazy(() => import("@/pages/Pagamentos"));
const Planos = lazy(() => import("@/pages/Planos"));
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
const TiposConsulta = lazy(() => import("@/pages/TiposConsulta"));
const RecepcaoCaixa = lazy(() => import("@/pages/RecepcaoCaixa"));
const ChatInterno = lazy(() => import("@/pages/ChatInterno"));
const TemplatesEmail = lazy(() => import("@/pages/TemplatesEmail"));
const Auth = lazy(() => import("@/pages/Auth"));
const AceitarConvite = lazy(() => import("@/pages/AceitarConvite"));
const RedefinirSenha = lazy(() => import("@/pages/RedefinirSenha"));
const PainelTV = lazy(() => import("@/pages/PainelTV"));
const PortalPaciente = lazy(() => import("@/pages/PortalPaciente"));
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
const RepassesMedicos = lazy(() => import("@/pages/RepassesMedicos"));
const Interoperabilidade = lazy(() => import("@/pages/Interoperabilidade"));
import { useNotificationScheduler } from "@/hooks/useNotificationScheduler";
import { CookieConsent } from "@/components/CookieConsent";

const queryClient = new QueryClient({
  // Falha de carregamento nunca deve virar tela em branco silenciosa:
  // o usuário recebe uma mensagem clara (uma única vez por erro).
  queryCache: new QueryCache({
    onError: (error) => {
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
  useNotificationScheduler();
  return <>{children}</>;
}

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-2 border-primary/15" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
        </div>
        <p className="text-sm font-medium text-muted-foreground animate-pulse">Carregando...</p>
      </div>
    </div>
  );
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

function App() {
  const mode = getRoutingMode();

  // Nota: o antigo autoSetupDatabase() rodava a cada carregamento da aplicação e
  // chamava a edge function auto-migrate (DDL com service_role, sem checagem de
  // papel). Removido — migrações passam pelo fluxo normal do Supabase.

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <SupabaseAuthProvider>
                <OperationalGuard><AppInitializer>
                <NotificationBanner />
                <PlatformAnnouncements />
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    {mode === 'landing' ? (
                      <>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/login" element={<Navigate to="/auth" replace />} />
                        <Route path="/aceitar-convite" element={<AceitarConvite />} />
                        <Route path="/redefinir-senha" element={<RedefinirSenha />} />
                        <Route path="/politica-privacidade" element={<PoliticaPrivacidade />} />
                        <Route path="/politica-cookies" element={<PoliticaCookies />} />
                        <Route path="/termos-uso" element={<TermosUso />} />
                        <Route path="/planos" element={<Planos />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </>
                    ) : (
                      <>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/landing" element={<LandingPage />} />
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/login" element={<Navigate to="/auth" replace />} />
                        <Route path="/aceitar-convite" element={<AceitarConvite />} />
                        <Route path="/redefinir-senha" element={<RedefinirSenha />} />
                        <Route path="/politica-privacidade" element={<PoliticaPrivacidade />} />
                        <Route path="/politica-cookies" element={<PoliticaCookies />} />
                        <Route path="/termos-uso" element={<TermosUso />} />
                        <Route path="/portal-paciente" element={<PortalPaciente />} />
                        <Route path="/portal-guias/:token" element={<PortalGuias />} />
                        <Route path="/verificar-assinatura/:codigo" element={<VerificarAssinatura />} />
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
                          <Route path="/chat" element={<ChatInterno />} />
                          <Route path="/agenda" element={<Agenda />} />
                          <Route path="/prontuarios" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><Prontuarios /></SupabaseProtectedRoute>} />
                          <Route path="/documentos-clinicos" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><DocumentosClinicos /></SupabaseProtectedRoute>} />
                          <Route path="/prescricoes" element={<Navigate to="/documentos-clinicos" replace />} />
                          <Route path="/atestados" element={<Navigate to="/documentos-clinicos" replace />} />
                          <Route path="/exames" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><Exames /></SupabaseProtectedRoute>} />
                          <Route path="/triagem" element={<Navigate to="/fila?tab=triagem" replace />} />
                          <Route path="/encaminhamentos" element={<Navigate to="/documentos-clinicos" replace />} />
                          <Route path="/retornos" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'recepcao']}><Retornos /></SupabaseProtectedRoute>} />
                          <Route path="/laboratorio" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><Laboratorio /></SupabaseProtectedRoute>} />
                          <Route path="/mapa-coleta" element={<SupabaseProtectedRoute allowedRoles={['admin', 'enfermagem']}><MapaColeta /></SupabaseProtectedRoute>} />
                          <Route path="/guias-externas" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem']}><GuiasExternas /></SupabaseProtectedRoute>} />
                          <Route path="/laudos-lab" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><LaudosLab /></SupabaseProtectedRoute>} />
                          <Route path="/pacientes" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem']}><Pacientes /></SupabaseProtectedRoute>} />
                          {/* `medico` estava fora, então o médico recebia "sem permissão" numa
                              tela que o banco já autorizava: fila_atendimento e agendamentos
                              liberam has_any_role exceto financeiro, e triagens liberam
                              can_access_clinical, que inclui médico. Sem ele, o médico não via
                              quem estava esperando para chamar o próximo paciente. */}
                          <Route path="/fila" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'medico']}><AtendimentoFila /></SupabaseProtectedRoute>} />
                          <Route path="/equipe" element={<SupabaseProtectedRoute allowedRoles={['admin']}><EquipePage /></SupabaseProtectedRoute>} />
                          <Route path="/medicos" element={<Navigate to="/equipe" replace />} />
                          <Route path="/funcionarios" element={<Navigate to="/equipe" replace />} />
                          <Route path="/gestao-fluxo" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao']}><GestaoFluxo /></SupabaseProtectedRoute>} />
                          <Route path="/salas" element={<Navigate to="/gestao-fluxo" replace />} />
                          <Route path="/estoque" element={<SupabaseProtectedRoute allowedRoles={['admin', 'enfermagem']}><Estoque /></SupabaseProtectedRoute>} />
                          <Route path="/convenios" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao']}><Convenios /></SupabaseProtectedRoute>} />
                          <Route path="/faturamento-convenios" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><FaturamentoConvenios /></SupabaseProtectedRoute>} />
                          <Route path="/repasses-medicos" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><RepassesMedicos /></SupabaseProtectedRoute>} />
                          <Route path="/interoperabilidade" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><Interoperabilidade /></SupabaseProtectedRoute>} />
                          <Route path="/todos-templates" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico']}><TemplatesUnificado /></SupabaseProtectedRoute>} />
                          <Route path="/templates" element={<Navigate to="/todos-templates" replace />} />
                          <Route path="/lista-espera" element={<Navigate to="/gestao-fluxo" replace />} />
                          <Route path="/tarefas" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'enfermagem', 'financeiro', 'medico']}><Tarefas /></SupabaseProtectedRoute>} />
                          <Route path="/recepcao" element={<SupabaseProtectedRoute allowedRoles={['admin', 'recepcao', 'financeiro']}><RecepcaoCaixa /></SupabaseProtectedRoute>} />
                          <Route path="/caixa" element={<Navigate to="/recepcao" replace />} />
                          <Route path="/caixa-diario" element={<Navigate to="/recepcao" replace />} />
                          <Route path="/financeiro" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><Financeiro /></SupabaseProtectedRoute>} />
                          <Route path="/contas" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><ContasPage /></SupabaseProtectedRoute>} />
                          <Route path="/contas-receber" element={<Navigate to="/contas" replace />} />
                          <Route path="/contas-pagar" element={<Navigate to="/contas" replace />} />
                          <Route path="/fluxo-caixa" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><FluxoCaixa /></SupabaseProtectedRoute>} />
                          <Route path="/pagamentos" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><Pagamentos /></SupabaseProtectedRoute>} />
                          <Route path="/precos-servicos" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><PrecosServicos /></SupabaseProtectedRoute>} />
                          <Route path="/precos-exames" element={<Navigate to="/precos-servicos" replace />} />
                          <Route path="/tipos-consulta" element={<Navigate to="/precos-servicos" replace />} />
                          <Route path="/relatorios" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><Relatorios /></SupabaseProtectedRoute>} />
                          <Route path="/relatorios/salvos" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><RelatoriosSalvos /></SupabaseProtectedRoute>} />
                          <Route path="/cobranca-inadimplentes" element={<SupabaseProtectedRoute allowedRoles={['admin', 'financeiro']}><CobrancaInadimplentes /></SupabaseProtectedRoute>} />
                          <Route path="/usuarios" element={<SupabaseProtectedRoute somentePlataforma><Usuarios /></SupabaseProtectedRoute>} />
                          <Route path="/configuracoes" element={<SupabaseProtectedRoute allowedRoles={['admin']}><Configuracoes /></SupabaseProtectedRoute>} />
                          <Route path="/configuracoes-avancadas" element={<SupabaseProtectedRoute allowedRoles={['admin']}><ConfiguracoesAvancadas /></SupabaseProtectedRoute>} />
                          <Route path="/automacoes" element={<SupabaseProtectedRoute allowedRoles={['admin']}><Automacoes /></SupabaseProtectedRoute>} />
                          <Route path="/templates-email" element={<Navigate to="/todos-templates" replace />} />
                          <Route path="/agente-ia" element={<SupabaseProtectedRoute allowedRoles={['admin']}><AgenteIA /></SupabaseProtectedRoute>} />
                          <Route path="/analytics" element={<SupabaseProtectedRoute allowedRoles={['admin']}><Analytics /></SupabaseProtectedRoute>} />
                          <Route path="/planos" element={<SupabaseProtectedRoute allowedRoles={['admin']}><Planos /></SupabaseProtectedRoute>} />
                          <Route path="/documentacao" element={<SupabaseProtectedRoute somentePlataforma><Documentacao /></SupabaseProtectedRoute>} />
                          <Route path="/painel-admin" element={<SupabaseProtectedRoute somentePlataforma><PainelAdmin /></SupabaseProtectedRoute>} />
                          <Route path="/admin/clinicas" element={<SupabaseProtectedRoute somentePlataforma><PlatformClinicas /></SupabaseProtectedRoute>} />
                          <Route path="/admin/crm" element={<SupabaseProtectedRoute somentePlataforma><PlatformCRM /></SupabaseProtectedRoute>} />
                          <Route path="/admin/saude" element={<SupabaseProtectedRoute somentePlataforma><PlatformSaude /></SupabaseProtectedRoute>} />
                          <Route path="/suporte" element={<SupabaseProtectedRoute allowedRoles={['admin']}><CentralSuporte /></SupabaseProtectedRoute>} />
                          <Route path="/admin/suporte" element={<SupabaseProtectedRoute somentePlataforma><CentralSuporte /></SupabaseProtectedRoute>} />
                          <Route path="/admin/ia" element={<SupabaseProtectedRoute somentePlataforma><PlatformIA /></SupabaseProtectedRoute>} />
                          <Route path="/admin/comunicacao" element={<SupabaseProtectedRoute somentePlataforma><PlatformComunicacao /></SupabaseProtectedRoute>} />
                          <Route path="/admin/operacoes" element={<SupabaseProtectedRoute somentePlataforma><PlatformOperacoes /></SupabaseProtectedRoute>} />
                          <Route path="/admin/lgpd" element={<SupabaseProtectedRoute somentePlataforma><PlatformLGPD /></SupabaseProtectedRoute>} />
                          <Route path="/seguranca" element={<SupabaseProtectedRoute><Seguranca /></SupabaseProtectedRoute>} />
                          <Route path="/lgpd-pacientes" element={<SupabaseProtectedRoute allowedRoles={['admin']}><LgpdPacientes /></SupabaseProtectedRoute>} />
                          <Route path="/vitais-graficos" element={<SupabaseProtectedRoute allowedRoles={['admin', 'medico', 'enfermagem']}><VitaisGraficos /></SupabaseProtectedRoute>} />
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
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
