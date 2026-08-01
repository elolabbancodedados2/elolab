import { Link } from 'react-router-dom';
import { NavegacaoLegal } from '@/components/NavegacaoLegal';
import { ArrowLeft, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PoliticaPrivacidade() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Política de Privacidade</h1>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
          <p className="text-xs">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>

          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Introdução</h2>
            <p>A EloLab ("nós", "nosso") opera o sistema de gestão clínica EloLab. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos seus dados pessoais em conformidade com a <strong>Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018)</strong>, o <strong>Marco Civil da Internet (Lei nº 12.965/2014)</strong>, a <strong>Resolução CFM nº 1.821/2007</strong> e demais normas aplicáveis.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Controlador e Encarregado (DPO)</h2>
            <p><strong>Controlador:</strong> EloLab Tecnologia em Saúde LTDA.</p>
            <p><strong>Encarregado de Proteção de Dados (DPO):</strong> Para exercer seus direitos ou esclarecer dúvidas, entre em contato pelo e-mail: <strong>privacidade@elolab.com.br</strong></p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Dados Coletados</h2>
            <h3 className="text-base font-medium text-foreground">3.1 Dados de cadastro</h3>
            <ul>
              <li>Nome completo, nome social, e-mail, telefone, CPF</li>
              <li>CRM, especialidade (para profissionais de saúde)</li>
              <li>Dados da clínica: nome, CNPJ, endereço</li>
            </ul>
            <h3 className="text-base font-medium text-foreground">3.2 Dados de pacientes (dados sensíveis)</h3>
            <ul>
              <li>Dados de saúde: prontuários, prescrições, exames, atestados, triagem</li>
              <li>Alergias, medicamentos, histórico clínico</li>
              <li>Foto do paciente (quando autorizado)</li>
            </ul>
            <h3 className="text-base font-medium text-foreground">3.3 Dados de uso</h3>
            <ul>
              <li>Logs de acesso (IP, navegador, dispositivo)</li>
              <li>Registros de auditoria (ações realizadas no sistema)</li>
              <li>Cookies e tecnologias similares</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Bases Legais (Art. 7º e 11 da LGPD)</h2>
            <ul>
              <li><strong>Consentimento (Art. 7º, I / Art. 11, I):</strong> Para coleta de dados sensíveis de pacientes</li>
              <li><strong>Execução de contrato (Art. 7º, V):</strong> Para prestação do serviço contratado</li>
              <li><strong>Obrigação legal (Art. 7º, II):</strong> Cumprimento de obrigações regulatórias (CFM, Anvisa)</li>
              <li><strong>Tutela da saúde (Art. 7º, VIII / Art. 11, II, f):</strong> Proteção da vida e incolumidade física</li>
              <li><strong>Legítimo interesse (Art. 7º, IX):</strong> Melhoria do serviço e segurança</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Finalidade do Tratamento</h2>
            <ul>
              <li>Gestão de agendamentos, prontuários e atendimentos clínicos</li>
              <li>Faturamento, gestão financeira e emissão de documentos fiscais</li>
              <li>Envio de lembretes de consulta e notificações operacionais</li>
              <li>Controle de estoque e insumos médicos</li>
              <li>Auditoria e rastreabilidade conforme exigências legais</li>
              <li>Geração de relatórios estatísticos anonimizados</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Compartilhamento de Dados</h2>
            <p>Seus dados podem ser compartilhados com:</p>
            <ul>
              <li><strong>Supabase (infraestrutura):</strong> Armazenamento seguro em nuvem com criptografia</li>
              <li><strong>Mercado Pago:</strong> Processamento de pagamentos e assinaturas</li>
              <li><strong>Brevo:</strong> Envio de e-mails transacionais</li>
              <li><strong>Órgãos reguladores:</strong> Quando exigido por lei (ANS, Anvisa, CFM)</li>
            </ul>
            <p>Não vendemos, alugamos ou compartilhamos seus dados com terceiros para fins de marketing.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Retenção de Dados</h2>
            <ul>
              <li><strong>Prontuários médicos:</strong> Mínimo de 20 anos (Resolução CFM nº 1.821/2007)</li>
              <li><strong>Dados financeiros:</strong> 5 anos (legislação fiscal)</li>
              <li><strong>Logs de auditoria:</strong> 5 anos</li>
              <li><strong>Dados de conta:</strong> Enquanto o contrato estiver ativo + 6 meses</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Segurança dos Dados</h2>
            <ul>
              <li>Criptografia em trânsito (TLS/HTTPS) e em repouso</li>
              <li>Row Level Security (RLS) em todas as tabelas do banco de dados</li>
              <li>Autenticação multifator disponível</li>
              <li>Timeout automático de sessão por inatividade (30 minutos)</li>
              <li>Controle de acesso por perfis (RBAC)</li>
              <li>Audit trail completo com registro de todas as alterações</li>
              <li>Backups automáticos semanais criptografados</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">9. Direitos do Titular (Art. 18 da LGPD)</h2>
            <p>Você tem direito a:</p>
            <ul>
              <li>Confirmação da existência de tratamento</li>
              <li>Acesso aos dados pessoais</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários</li>
              <li>Portabilidade dos dados</li>
              <li>Eliminação dos dados tratados com consentimento</li>
              <li>Informação sobre compartilhamento com terceiros</li>
              <li>Revogação do consentimento</li>
            </ul>
            <p>Para exercer seus direitos, entre em contato: <strong>privacidade@elolab.com.br</strong></p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">10. Cookies</h2>
            <p>Utilizamos cookies essenciais e opcionais. Consulte nossa <Link to="/politica-cookies" className="text-primary hover:underline">Política de Cookies</Link> para detalhes completos.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">11. Transferência Internacional</h2>
            <p>Os dados são armazenados em servidores da AWS (Supabase) que podem estar localizados fora do Brasil. A transferência é realizada com garantias adequadas conforme Art. 33 da LGPD.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">12. Alterações nesta Política</h2>
            <p>Esta política pode ser atualizada periodicamente. Notificaremos sobre alterações significativas por e-mail ou notificação no sistema.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">13. Contato e Reclamações</h2>
            <p>Se não estiver satisfeito com o tratamento de seus dados, você pode registrar reclamação junto à <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong> — <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">www.gov.br/anpd</a></p>
          </section>
          <NavegacaoLegal atual="/politica-privacidade" />
        </div>
      </div>
    </div>
  );
}
