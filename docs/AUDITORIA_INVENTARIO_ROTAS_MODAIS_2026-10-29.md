# EloLab — inventário estático de rotas e modais

Data: 29/10/2026. Base: 40712d6d. Complementa a auditoria de completude. Nenhuma entrada deste inventário é, isoladamente, prova de defeito ou funcionalidade completa.

## Rotas declaradas

126 declarações, 115 caminhos distintos. Inclui aliases, curinga e ramos de execução alternativos. Fonte: `src/App.tsx`.

| Caminho | Linhas |
|---|---|
| `*` | 224, 363 |
| `/` | 214, 228 |
| `/aceitar-convite` | 218, 233 |
| `/acesso-assistido` | 353 |
| `/admin/acesso-assistido` | 344 |
| `/admin/backups` | 340 |
| `/admin/clinicas` | 330 |
| `/admin/cobrancas` | 342 |
| `/admin/comunicacao` | 336 |
| `/admin/consumo` | 349 |
| `/admin/crm` | 331 |
| `/admin/dominios` | 351 |
| `/admin/erros` | 339 |
| `/admin/filas` | 346 |
| `/admin/historico-financeiro` | 343 |
| `/admin/ia` | 335 |
| `/admin/incidentes` | 347 |
| `/admin/integracoes` | 345 |
| `/admin/lgpd` | 338 |
| `/admin/onboarding` | 350 |
| `/admin/operacoes` | 337 |
| `/admin/relatorio-executivo` | 341 |
| `/admin/relatorios-agendados` | 352 |
| `/admin/saude` | 332 |
| `/admin/seguranca` | 348 |
| `/admin/suporte` | 334 |
| `/agenda` | 265 |
| `/agendar/:clinicaId` | 240 |
| `/agente-ia` | 325 |
| `/analise-preditiva` | 360 |
| `/analytics` | 326 |
| `/atestados` | 269 |
| `/auth` | 216, 231 |
| `/automacoes` | 323 |
| `/boas-vindas` | 256 |
| `/caixa` | 301 |
| `/caixa-diario` | 302 |
| `/chat` | 257 |
| `/cobranca-inadimplentes` | 318 |
| `/configuracoes` | 320 |
| `/configuracoes-avancadas` | 322 |
| `/contas` | 304 |
| `/contas-pagar` | 306 |
| `/contas-receber` | 305 |
| `/convenios` | 291 |
| `/dashboard` | 255 |
| `/demonstracao` | 215, 229 |
| `/documentacao` | 328 |
| `/documentos-clinicos` | 267 |
| `/encaminhamentos` | 272 |
| `/equipe` | 285 |
| `/estoque` | 290 |
| `/exames` | 270 |
| `/faturamento-convenios` | 292 |
| `/feedback` | 262 |
| `/fila` | 284 |
| `/financeiro` | 303 |
| `/fluxo-caixa` | 307 |
| `/funcionarios` | 287 |
| `/gestao-fluxo` | 288 |
| `/guias-externas` | 276 |
| `/higiene-salas` | 358 |
| `/indicadores` | 263 |
| `/interoperabilidade` | 294 |
| `/laboratorio` | 274 |
| `/landing` | 230 |
| `/laudos-lab` | 277 |
| `/lgpd-pacientes` | 355 |
| `/lista-espera` | 297 |
| `/login` | 217, 232 |
| `/mapa-coleta` | 275 |
| `/medicos` | 286 |
| `/meu-historico` | 260 |
| `/minha-fila` | 299 |
| `/notificacoes` | 258 |
| `/onboarding` | 321 |
| `/pacientes` | 278 |
| `/pagamentos` | 312 |
| `/painel-admin` | 329 |
| `/painel-tv` | 244 |
| `/patrimonio-equipamentos` | 359 |
| `/planos` | 223, 327 |
| `/planos/checkout/:slug` | 243 |
| `/politica-cookies` | 221, 236 |
| `/politica-privacidade` | 220, 235 |
| `/portal-guias/:token` | 241 |
| `/portal-paciente` | 238 |
| `/portal-pacientes` | 259 |
| `/precos-exames` | 314 |
| `/precos-servicos` | 313 |
| `/preferencias` | 261 |
| `/prescricoes` | 268 |
| `/prontuarios` | 266 |
| `/recepcao` | 300 |
| `/redefinir-senha` | 219, 234 |
| `/relatorios` | 316 |
| `/relatorios/salvos` | 317 |
| `/repasses-medicos` | 293 |
| `/retornos` | 273 |
| `/salas` | 289 |
| `/seguranca` | 354 |
| `/seguranca-assistencial` | 357 |
| `/suporte` | 333 |
| `/tarefas` | 298 |
| `/teleconsulta/:sessionId` | 239 |
| `/templates` | 296 |
| `/templates-email` | 324 |
| `/termos-uso` | 222, 237 |
| `/tipos-consulta` | 315 |
| `/todos-templates` | 295 |
| `/treinamento` | 264 |
| `/triagem` | 271 |
| `/usuarios` | 319 |
| `/verificar-assinatura/:codigo` | 242 |
| `/vitais-graficos` | 356 |

## Usos de DialogContent

145 instanciações em 89 arquivos TSX fora de `__tests__`. Inclui subcomponentes e arquivos que podem ser legados; alcançabilidade de cada um requer inspeção. Exclui AlertDialog, Sheet e outros overlays.

| Arquivo | Quantidade | Linhas |
|---|---:|---|
| `src/components/agenda/AgendaPage.tsx` | 1 | 991 |
| `src/components/agenda/AppointmentDialog.tsx` | 1 | 454 |
| `src/components/agenda/BloqueioAgenda.tsx` | 1 | 246 |
| `src/components/agenda/ColorSchemeDialog.tsx` | 1 | 49 |
| `src/components/AutorizacaoConvenioModal.tsx` | 1 | 149 |
| `src/components/BackupRestore.tsx` | 1 | 325 |
| `src/components/clinical/AnexosProntuario.tsx` | 3 | 553, 633, 671 |
| `src/components/clinical/ConsentimentoLGPD.tsx` | 2 | 366, 432 |
| `src/components/clinical/DigitalSignature.tsx` | 1 | 165 |
| `src/components/clinical/DischargeReport.tsx` | 1 | 301 |
| `src/components/clinical/DrugInteractionChecker.tsx` | 1 | 271 |
| `src/components/clinical/EncaminhamentoMedico.tsx` | 3 | 516, 658, 721 |
| `src/components/clinical/ExportacaoClinicaProtegida.tsx` | 1 | 56 |
| `src/components/clinical/PatientPhoto.tsx` | 1 | 171 |
| `src/components/clinical/PatientTimeline.tsx` | 1 | 606 |
| `src/components/clinical/ProntuarioAdendos.tsx` | 1 | 177 |
| `src/components/clinical/ReturnScheduler.tsx` | 2 | 237, 379 |
| `src/components/configuracoes/IntegracoesClinica.tsx` | 1 | 287 |
| `src/components/ConvidarFuncionarioDialog.tsx` | 1 | 109 |
| `src/components/ConvitesList.tsx` | 1 | 550 |
| `src/components/EtiquetaPaciente.tsx` | 1 | 108 |
| `src/components/exames/LancarResultado.tsx` | 1 | 187 |
| `src/components/fila/FinalizarAtendimentoDialog.tsx` | 1 | 57 |
| `src/components/financeiro/GuiasLoteDialog.tsx` | 1 | 90 |
| `src/components/financeiro/HistoricoLancamentoButton.tsx` | 1 | 35 |
| `src/components/financeiro/ImportarExtratoDialog.tsx` | 1 | 67 |
| `src/components/financeiro/RecursoGlosaDialog.tsx` | 1 | 101 |
| `src/components/GerenciadorLaboratorios.tsx` | 1 | 186 |
| `src/components/InstallPWA.tsx` | 1 | 119 |
| `src/components/KeyboardShortcutsDialog.tsx` | 1 | 36 |
| `src/components/landing-v2/PricingSection.tsx` | 1 | 290 |
| `src/components/MFASetupDialog.tsx` | 1 | 116 |
| `src/components/MFAVerifyDialog.tsx` | 1 | 57 |
| `src/components/OnboardingWizard.tsx` | 1 | 131 |
| `src/components/patients/PagamentosDaCobranca.tsx` | 1 | 156 |
| `src/components/patients/RevisaoDuplicidadesDialog.tsx` | 1 | 136 |
| `src/components/plataforma/AcoesDaClinica.tsx` | 2 | 174, 210 |
| `src/components/ReauthDialog.tsx` | 1 | 56 |
| `src/components/relatorios/RelatorioCustomizado.tsx` | 1 | 877 |
| `src/components/ui/command.tsx` | 1 | 29 |
| `src/components/Version20Announcement.tsx` | 1 | 51 |
| `src/components/whatsapp/SessionsTab.tsx` | 1 | 113 |
| `src/pages/Atestados.tsx` | 3 | 803, 1069, 1118 |
| `src/pages/CaixaDiario.tsx` | 9 | 1791, 1829, 1873, 2233, 2272, 2308, 2369, 2463, 2618 |
| `src/pages/CentralSuporte.tsx` | 1 | 348 |
| `src/pages/Configuracoes.tsx` | 4 | 334, 972, 1023, 1312 |
| `src/pages/ContasPagar.tsx` | 2 | 665, 824 |
| `src/pages/ContasReceber.tsx` | 5 | 1165, 1296, 1430, 1483, 1504 |
| `src/pages/Convenios.tsx` | 2 | 344, 952 |
| `src/pages/Encaminhamentos.tsx` | 1 | 609 |
| `src/pages/Estoque.tsx` | 3 | 887, 948, 1054 |
| `src/pages/Exames.tsx` | 3 | 1557, 2005, 2114 |
| `src/pages/FaturamentoConvenios.tsx` | 4 | 566, 568, 589, 624 |
| `src/pages/Fila.tsx` | 3 | 1088, 1464, 1586 |
| `src/pages/Funcionarios.tsx` | 2 | 802, 1014 |
| `src/pages/GuiasExternas.tsx` | 3 | 752, 1017, 1206 |
| `src/pages/laboratorio/PedidosLaboratorioPanel.tsx` | 2 | 268, 303 |
| `src/pages/Laboratorio.tsx` | 3 | 752, 1253, 1641 |
| `src/pages/LaudosLab.tsx` | 1 | 432 |
| `src/pages/LgpdPacientes.tsx` | 2 | 252, 282 |
| `src/pages/ListaEspera.tsx` | 1 | 705 |
| `src/pages/MapaColeta.tsx` | 1 | 959 |
| `src/pages/Medicos.tsx` | 1 | 941 |
| `src/pages/Pacientes.tsx` | 4 | 1503, 1910, 2781, 2865 |
| `src/pages/PainelTV.tsx` | 1 | 622 |
| `src/pages/PlatformBackups.tsx` | 1 | 253 |
| `src/pages/PlatformClinicas.tsx` | 1 | 547 |
| `src/pages/PlatformCobrancas.tsx` | 1 | 322 |
| `src/pages/PlatformConsumo.tsx` | 1 | 263 |
| `src/pages/PlatformIA.tsx` | 1 | 332 |
| `src/pages/PlatformIncidentes.tsx` | 1 | 330 |
| `src/pages/PlatformLGPD.tsx` | 1 | 271 |
| `src/pages/PlatformOnboarding.tsx` | 1 | 330 |
| `src/pages/PortalPaciente.tsx` | 2 | 1033, 1784 |
| `src/pages/PrecosExames.tsx` | 2 | 503, 799 |
| `src/pages/Prescricoes.tsx` | 3 | 1316, 1416, 1466 |
| `src/pages/Prontuarios.tsx` | 3 | 2180, 2838, 2867 |
| `src/pages/Recepcao.tsx` | 2 | 1739, 2004 |
| `src/pages/RepassesMedicos.tsx` | 1 | 367 |
| `src/pages/Retornos.tsx` | 1 | 934 |
| `src/pages/Salas.tsx` | 1 | 727 |
| `src/pages/SegurancaAssistencial.tsx` | 1 | 489 |
| `src/pages/Tarefas.tsx` | 1 | 820 |
| `src/pages/Templates.tsx` | 2 | 621, 688 |
| `src/pages/TemplatesEmail.tsx` | 3 | 546, 706, 742 |
| `src/pages/TiposConsulta.tsx` | 2 | 430, 488 |
| `src/pages/Treinamento.tsx` | 1 | 125 |
| `src/pages/Triagem.tsx` | 1 | 836 |
| `src/pages/Usuarios.tsx` | 1 | 465 |
