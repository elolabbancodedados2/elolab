import { Link } from 'react-router-dom';
import { NavegacaoLegal } from '@/components/NavegacaoLegal';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TermosUso() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <FileText className="h-8 w-8 text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Termos de Uso</h1>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
          <p className="text-xs">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>

          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Aceitação dos Termos</h2>
            <p>Ao acessar e utilizar o sistema EloLab, você concorda com estes Termos de Uso, com a <Link to="/politica-privacidade" className="text-primary hover:underline">Política de Privacidade</Link> e com a <Link to="/politica-cookies" className="text-primary hover:underline">Política de Cookies</Link>. Se não concordar, descontinue o uso imediatamente.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Descrição do Serviço</h2>
            <p>O EloLab é um sistema de gestão clínica em nuvem (SaaS) que inclui:</p>
            <ul>
              <li>Gestão de agendamentos e pacientes</li>
              <li>Prontuário Eletrônico do Paciente (PEP)</li>
              <li>Gestão financeira (faturamento, contas a pagar/receber)</li>
              <li>Módulo laboratorial (coletas, laudos)</li>
              <li>Controle de estoque e automações</li>
              <li>Comunicação via WhatsApp e e-mail</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Cadastro e Conta</h2>
            <ul>
              <li>Você deve fornecer informações verdadeiras e completas no cadastro</li>
              <li>É responsável por manter a confidencialidade da senha</li>
              <li>Deve notificar imediatamente sobre uso não autorizado</li>
              <li>Contas são pessoais e intransferíveis</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Planos e Pagamentos</h2>
            <ul>
              <li>O acesso é oferecido mediante assinatura mensal ou anual</li>
              <li>Pagamentos são processados via Mercado Pago</li>
              <li>O período de teste (trial) é gratuito e configurável por plano</li>
              <li>Após <strong>2 dias de inadimplência</strong>, o acesso será suspenso automaticamente</li>
              <li>A reativação ocorre após regularização do pagamento</li>
              <li>Cancelamentos podem ser feitos a qualquer momento pelo painel</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Responsabilidades do Usuário</h2>
            <ul>
              <li>Utilizar o sistema exclusivamente para fins lícitos e profissionais</li>
              <li>Manter dados de pacientes em conformidade com a LGPD e sigilo profissional</li>
              <li>Garantir que apenas profissionais autorizados acessem dados clínicos</li>
              <li>Não compartilhar credenciais de acesso</li>
              <li>Realizar backup de dados críticos quando necessário</li>
              <li>Cumprir todas as normas do CFM, CRM e legislação sanitária aplicável</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Responsabilidades da EloLab</h2>
            <ul>
              <li>Manter infraestrutura segura com criptografia e controle de acesso</li>
              <li>Realizar backups automáticos semanais dos dados</li>
              <li>Disponibilizar suporte técnico em horário comercial</li>
              <li>Notificar sobre manutenções programadas com antecedência</li>
              <li>Manter conformidade com LGPD e regulamentações de saúde</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Dados e Prontuários</h2>
            <ul>
              <li>Prontuários são armazenados por no mínimo <strong>20 anos</strong> (Resolução CFM nº 1.821/2007)</li>
              <li>Alterações em registros clínicos são rastreadas via audit trail</li>
              <li>A EloLab atua como <strong>Operadora</strong> dos dados; a clínica é a <strong>Controladora</strong></li>
              <li>Dados clínicos são criptografados e protegidos por RLS (Row Level Security)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Propriedade Intelectual</h2>
            <p>O software EloLab, incluindo código-fonte, design, marcas e documentação, é propriedade exclusiva da EloLab. É proibida a reprodução, engenharia reversa ou distribuição sem autorização.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">9. Limitação de Responsabilidade</h2>
            <ul>
              <li>O EloLab é uma ferramenta de apoio à gestão e <strong>não substitui o julgamento clínico</strong></li>
              <li>Não nos responsabilizamos por decisões médicas baseadas no uso do sistema</li>
              <li>Não garantimos disponibilidade ininterrupta (SLA de 99,5%)</li>
              <li>Força maior e caso fortuito excluem responsabilidade</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">10. Rescisão</h2>
            <ul>
              <li>O usuário pode cancelar a qualquer momento via painel administrativo</li>
              <li>A EloLab pode suspender contas que violem estes termos</li>
              <li>Após cancelamento, dados são mantidos conforme período legal de retenção</li>
              <li>Exportação de dados é disponibilizada antes da exclusão definitiva</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">11. Disposições Gerais</h2>
            <ul>
              <li><strong>Legislação aplicável:</strong> Leis da República Federativa do Brasil</li>
              <li><strong>Foro:</strong> Comarca do domicílio da sede da EloLab</li>
              <li>A tolerância quanto ao descumprimento não constitui renúncia</li>
              <li>Caso alguma cláusula seja inválida, as demais permanecem em vigor</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">12. Contato</h2>
            <p>Dúvidas sobre estes termos: <strong>contato@elolab.com.br</strong></p>
            <p>Questões sobre privacidade: <strong>privacidade@elolab.com.br</strong></p>
          </section>
          <NavegacaoLegal atual="/termos-uso" />
        </div>
      </div>
    </div>
  );
}
