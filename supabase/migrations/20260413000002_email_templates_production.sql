-- Insert production email templates for appointment confirmation, exam results, and payment receipts

-- Confirmação de Consulta (Email)
INSERT INTO public.notification_templates (nome, categoria, tipo, assunto, conteudo, ativo)
VALUES (
  'Confirmação de Consulta - 24h',
  'confirmacao',
  'email',
  '✅ {{clinica_nome}} — Sua Consulta foi Confirmada',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px; border-radius: 12px;">
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="margin: 0; font-size: 28px;">✅ Consulta Confirmada!</h1>
      <p style="margin: 8px 0 0; opacity: 0.9;">{{clinica_nome}}</p>
    </div>

    <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px;">
      <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">Olá, <strong>{{paciente_nome}}</strong>!</p>

      <p style="margin: 0 0 20px; color: #6b7280; line-height: 1.6;">Sua consulta foi confirmada com sucesso! Aqui estão os detalhes:</p>

      <div style="background: #f3f4f6; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 8px 0; color: #374151;"><strong>📅 Data:</strong> {{data}}</p>
        <p style="margin: 8px 0; color: #374151;"><strong>🕐 Horário:</strong> {{horario}}</p>
        <p style="margin: 8px 0; color: #374151;"><strong>👨‍⚕️ Médico:</strong> {{medico_nome}}</p>
        <p style="margin: 8px 0; color: #374151;"><strong>📍 Local:</strong> {{clinica_endereco}}</p>
      </div>

      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #92400e; font-size: 14px;">
          <strong>⚠️ Importante:</strong> Chegue 15 minutos antes. Leve seus documentos de identificação e exames anteriores.
        </p>
      </div>

      <p style="margin: 20px 0 0; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
        Este é um e-mail automático. Não responda esta mensagem.
      </p>
    </div>
  </div>'
)
ON CONFLICT DO NOTHING;

-- Resultado de Exame Disponível (Email)
INSERT INTO public.notification_templates (nome, categoria, tipo, assunto, conteudo, ativo)
VALUES (
  'Resultado de Exame Disponível',
  'resultado_exame',
  'email',
  '🔬 {{clinica_nome}} — Seu Resultado de Exame está Disponível',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px; border-radius: 12px;">
    <div style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="margin: 0; font-size: 28px;">🔬 Resultado Disponível!</h1>
      <p style="margin: 8px 0 0; opacity: 0.9;">{{clinica_nome}}</p>
    </div>

    <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px;">
      <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">Olá, <strong>{{paciente_nome}}</strong>!</p>

      <p style="margin: 0 0 20px; color: #6b7280; line-height: 1.6;">Seu resultado de exame está pronto para consulta!</p>

      <div style="background: #f3f4f6; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 8px 0; color: #374151;"><strong>🔬 Tipo de Exame:</strong> {{tipo_exame}}</p>
        <p style="margin: 8px 0; color: #374151;"><strong>📅 Data do Resultado:</strong> {{data_resultado}}</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="{{link_portal}}" style="background: #0ea5e9; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
          Visualizar Resultado
        </a>
      </div>

      <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px; line-height: 1.6;">
        Acesse seu portal de paciente para ver os resultados em detalhes. Se tiver dúvidas, entre em contato com a clínica.
      </p>

      <p style="margin: 20px 0 0; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
        Este é um e-mail automático. Não responda esta mensagem.
      </p>
    </div>
  </div>'
)
ON CONFLICT DO NOTHING;

-- Recibo de Pagamento (Email)
INSERT INTO public.notification_templates (nome, categoria, tipo, assunto, conteudo, ativo)
VALUES (
  'Recibo de Pagamento',
  'financeiro',
  'email',
  '💳 {{clinica_nome}} — Recibo de Pagamento',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px; border-radius: 12px;">
    <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="margin: 0; font-size: 28px;">💳 Pagamento Recebido</h1>
      <p style="margin: 8px 0 0; opacity: 0.9;">{{clinica_nome}}</p>
    </div>

    <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px;">
      <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">Olá, <strong>{{paciente_nome}}</strong>!</p>

      <p style="margin: 0 0 20px; color: #6b7280; line-height: 1.6;">Confirmamos o recebimento do seu pagamento. Aqui está o recibo:</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background: #f3f4f6; border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px; color: #6b7280; font-weight: bold;">Descrição:</td>
          <td style="padding: 12px; color: #374151; text-align: right;">{{descricao}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px; color: #6b7280; font-weight: bold;">Valor:</td>
          <td style="padding: 12px; color: #374151; text-align: right; font-size: 18px; font-weight: bold; color: #10b981;">{{valor}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px; color: #6b7280; font-weight: bold;">Forma de Pagamento:</td>
          <td style="padding: 12px; color: #374151; text-align: right;">{{forma_pagamento}}</td>
        </tr>
        <tr style="background: #f3f4f6;">
          <td style="padding: 12px; color: #6b7280; font-weight: bold;">Data:</td>
          <td style="padding: 12px; color: #374151; text-align: right;">{{data}}</td>
        </tr>
      </table>

      <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #166534; font-size: 14px;">
          ✅ Seu pagamento foi processado com sucesso!
        </p>
      </div>

      <p style="margin: 20px 0 0; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
        Este é um e-mail automático. Conserve-o como comprovante. Não responda esta mensagem.
      </p>
    </div>
  </div>'
)
ON CONFLICT DO NOTHING;

-- Lembrete de Consulta - 24h (Email)
INSERT INTO public.notification_templates (nome, categoria, tipo, assunto, conteudo, ativo)
VALUES (
  'Lembrete de Consulta - 24h',
  'lembrete_consulta',
  'email',
  '⏰ {{clinica_nome}} — Lembrete de Consulta Amanhã',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px; border-radius: 12px;">
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="margin: 0; font-size: 28px;">⏰ Lembrete de Consulta</h1>
      <p style="margin: 8px 0 0; opacity: 0.9;">Você tem uma consulta amanhã!</p>
    </div>

    <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px;">
      <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">Olá, <strong>{{paciente_nome}}</strong>!</p>

      <p style="margin: 0 0 20px; color: #6b7280; line-height: 1.6;">Lembramos que você tem uma consulta marcada para amanhã:</p>

      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 8px 0; color: #92400e;"><strong>📅 Data:</strong> {{data}}</p>
        <p style="margin: 8px 0; color: #92400e;"><strong>🕐 Horário:</strong> {{horario}}</p>
        <p style="margin: 8px 0; color: #92400e;"><strong>👨‍⚕️ Médico:</strong> {{medico_nome}}</p>
        <p style="margin: 8px 0; color: #92400e;"><strong>📍 Local:</strong> {{clinica_endereco}}</p>
      </div>

      <div style="background: #f3f4f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
          ✓ Chegue 15 minutos antes<br/>
          ✓ Leve documentos de identificação<br/>
          ✓ Trazer exames anteriores se houver
        </p>
      </div>

      <p style="margin: 20px 0 0; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
        Caso não possa comparecer, notifique com antecedência.
      </p>
    </div>
  </div>'
)
ON CONFLICT DO NOTHING;

-- Lembrete de Consulta - 2h (Email)
INSERT INTO public.notification_templates (nome, categoria, tipo, assunto, conteudo, ativo)
VALUES (
  'Lembrete de Consulta - 2h',
  'lembrete_consulta',
  'email',
  '⏰ {{clinica_nome}} — Sua Consulta é Daqui a 2 Horas!',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px; border-radius: 12px;">
    <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="margin: 0; font-size: 28px;">⏰ Última Chamada!</h1>
      <p style="margin: 8px 0 0; opacity: 0.9;">Sua consulta é daqui a 2 horas</p>
    </div>

    <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px;">
      <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">Olá, <strong>{{paciente_nome}}</strong>!</p>

      <p style="margin: 0 0 20px; color: #6b7280; line-height: 1.6;">Última chamada! Sua consulta é daqui a 2 horas:</p>

      <div style="background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 8px 0; color: #7f1d1d;"><strong>🕐 Horário:</strong> {{horario}}</p>
        <p style="margin: 8px 0; color: #7f1d1d;"><strong>👨‍⚕️ Médico:</strong> {{medico_nome}}</p>
        <p style="margin: 8px 0; color: #7f1d1d;"><strong>📍 Local:</strong> {{clinica_nome}}</p>
      </div>

      <p style="margin: 0; color: #6b7280; font-size: 14px;">
        Se não puder comparecer, avise imediatamente! Caso contrário, estamos esperando por você!
      </p>
    </div>
  </div>'
)
ON CONFLICT DO NOTHING;
