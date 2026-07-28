# 🗺️ Mapa de Fluxos do Sistema EloLab

> **Como ler este documento.** Vários módulos deixaram de ter tela própria e
> viraram **abas** dentro de telas unificadas. Onde aparece `Arquivo.tsx (aba de
> /rota)`, o arquivo continua existindo mas o usuário chega nele pela rota
> indicada. A lista de rotas reais está no README.

## ✅ FLUXOS IMPLEMENTADOS E FUNCIONAIS

### 1️⃣ **FLUXO DE ATENDIMENTO** ✅ COMPLETO
```
Check-in → Triagem → Pagamento → Chamada Painel → Sala → Finalizado
├─ Recepcao.tsx    (aba de /recepcao)  - Check-in + Pagamento
├─ Triagem.tsx     (aba de /fila)      - Manchester, vitais, IMC
├─ Fila.tsx        (aba de /fila)      - Gerenciamento da fila
├─ PainelTV.tsx    (/painel-tv)        - Chamadas ao vivo
└─ Dashboard.tsx   (/dashboard)        - Resumo do dia
```

### 2️⃣ **FLUXO DE CAIXA** ✅ COMPLETO
```
Abrir Caixa → Lançamentos → Fechamento → Relatório
├─ CaixaDiario.tsx (aba de /recepcao)  - Abertura/Fechamento
├─ Lancamentos - Receitas/Despesas/Sangrias/Suprimentos
├─ Recibos - Impressão/Download
└─ FluxoCaixa.tsx  (/fluxo-caixa)      - Análise financeira
```

### 3️⃣ **FLUXO DE EXAMES** ✅ COMPLETO
```
Solicitação → Coleta → Realização → Laudo → Resultado
├─ Exames.tsx - Solicitação com TUSS
├─ Laboratorio.tsx - Gestão de coletas
├─ LaudosLab.tsx - Geração PDF + QR Code
├─ MapaColeta.tsx - Mapa de localização
├─ Laboratórios - CRUD
└─ Preços - Custo + Venda
```

### 4️⃣ **FLUXO FINANCEIRO** ✅ IMPLEMENTADO
```
Pagamento → Recibo → Lançamento → Relatório
├─ Pagamentos.tsx - Gestão cobranças
├─ ContasReceber.tsx - Contas a receber
├─ ContasPagar.tsx - Contas a pagar
├─ Financeiro.tsx - Dashboard financeiro
└─ Relatorios.tsx - Análise dados
```

### 5️⃣ **FLUXO DE AGENDAMENTO** ✅ IMPLEMENTADO
```
Agendar → Confirmar → Check-in → Atender → Retorno
├─ Agenda.tsx - Calendário de agendamentos
├─ ListaEspera.tsx - Fila de espera
└─ Retornos.tsx - Agendamento de retorno
```

### 6️⃣ **FLUXO DE PRONTUÁRIO** ✅ IMPLEMENTADO
```
Criar → Consulta → Registrar → Arquivar
├─ Prontuarios.tsx - Histórico do paciente
├─ Triagem.tsx - Coleta de dados iniciais
└─ Registra automaticamente após atendimento
```

### 7️⃣ **FLUXO DE DOCUMENTOS** ✅ IMPLEMENTADO
```
Criar → Prescrição → Atestado → Encaminhamento
├─ Prescricoes.tsx - Geração de receitas
├─ Atestados.tsx - Emissão de atestados
├─ Encaminhamentos.tsx - Encaminhamentos médicos
└─ Templates.tsx - Modelos customizáveis
```

### 8️⃣ **FLUXO DE ADMIN** ✅ IMPLEMENTADO
```
Configurar → Gerenciar → Analisar → Otimizar
├─ Configuracoes.tsx - Salas, horários, etc
├─ Usuarios.tsx - Equipe
├─ Convenios.tsx - Planos convênio
├─ TiposConsulta.tsx - Tipos de serviço
├─ Medicos.tsx - Profissionais
└─ Funcionarios.tsx - Equipe geral
```

### 9️⃣ **FLUXO DE PORTAL PACIENTE** ✅ IMPLEMENTADO
```
Login → Agendar → Acompanhar → Consultar
├─ PortalPaciente.tsx - Acesso do paciente
├─ Pode ver agendamentos
├─ Pode fazer check-in
└─ Pode consultar prontuário (se permitido)
```

---

## ⚠️ FLUXOS COM POTENCIAL DE MELHORIA

### 1. **FLUXO DE RECEITA/PRESCRIÇÃO** 📋
**Status:** ✅ Existe mas pode melhorar
```
Atual:
├─ Prescricoes.tsx - Cria e imprime
└─ Salva em prontuário

Melhorias possíveis:
├─ QR Code na receita para verificação
├─ Integração com farmácias
├─ Histórico de medicações
├─ Alertas de interações medicamentosas
├─ Revalidação automática de receita
└─ Envio por WhatsApp/Email
```

### 2. **FLUXO DE TRIAGEM** 🩺
**Status:** ✅ Existe, na aba Triagem de `/fila`
```
Atual:
├─ Triagem.tsx (aba de /fila) - Manchester, sinais vitais, IMC
├─ Registra pressão, peso, temperatura, saturação, FC
├─ Classificação de risco alimenta o Analytics
└─ autoTriagemParaFila() empurra o paciente para a fila

Nota histórica: por um período a rota /triagem redirecionava para /fila e a
Fila não tinha triagem, deixando esta tela inalcançável. Corrigido.

Melhorias possíveis:
├─ Histórico de vitais (parcial: existe /vitais-graficos)
├─ Alertas se fora de padrão
├─ Checklist de anamnese automático
├─ Integração com aparelhos (pressão, oxímetro)
└─ Avaliação de risco
```

### 3. **FLUXO DE ESTOQUE** 📦
**Status:** ✅ Existe mas pode ser mais robusto
```
Atual:
├─ Estoque.tsx - Gerencia medicamentos
├─ Entrada/Saída
└─ Movimentação

Melhorias possíveis:
├─ Alerta de vencimento
├─ Integração com prescribing (desconta automaticamente)
├─ Código de barras
├─ Localização no estoque
├─ Previsão de consumo
├─ Integração com fornecedor (compra automática)
└─ Controle de lote
```

### 4. **FLUXO DE RETORNO** 📅
**Status:** ✅ Existe mas pode ser automático
```
Atual:
├─ Retornos.tsx - Agendar retorno
└─ Manual

Melhorias possíveis:
├─ Retorno automático (médico marca na consulta)
├─ Lembretes por SMS/WhatsApp
├─ Confirmação automática
├─ Sugestão de data baseada em clínica
└─ Histórico de retornos
```

---

## 🚀 FLUXOS NOVOS QUE PODEM SER ADICIONADOS

### 1. **FLUXO DE TELEMEDICINA** 📱
```
Status: NÃO IMPLEMENTADO

O que fazer:
├─ Agendamento de consulta online
├─ Sala de videoconferência integrada
├─ Receita digital
├─ Pagamento online
├─ Prontuário compartilhado
└─ Integração com WhatsApp/Telegram para links
```

### 2. **FLUXO DE NOTA FISCAL** 🧾
```
Status: FORA DO ESCOPO — decisão do negócio

A NF da clínica é emitida pelo contador, fora do sistema.

O que existia (NotaFiscalModal + edge function generate-nfe) era apenas um
registro manual: gravava em notas_fiscais sem enviar nada à SEFAZ. Como isso
significava redigitar no EloLab algo que já é feito na contabilidade, os dois
foram removidos.

A tabela notas_fiscais foi mantida no banco para preservar eventuais registros
já lançados. Se estiver vazia, pode ser descartada com segurança.
```

### 3. **FLUXO DE AGENDAMENTO AUTOMÁTICO** 🤖
```
Status: PARCIAL (existe manual)

O que fazer:
├─ Médico marca retorno na consulta → Sistema agenda automaticamente
├─ Envia confirmação ao paciente
├─ Lembretes (1 semana, 1 dia antes)
└─ Reassinado automático se não confirmar
```

### 4. **FLUXO DE FEEDBACK/AVALIAÇÃO** ⭐
```
Status: NÃO IMPLEMENTADO

O que fazer:
├─ Após atendimento: paciente avalia (1-5 stars)
├─ Feedback por WhatsApp
├─ Dashboard de satisfação por médico
├─ Alertas se avaliação baixa
└─ Relatório mensal
```

### 5. **FLUXO DE AUTORIZAÇÃO CONVÊNIO** ✅
```
Status: NÃO IMPLEMENTADO

O que fazer:
├─ Verificação automática de cobertura
├─ Solicitação de autorização ao convênio
├─ Rastreamento de status
├─ Alerta se negada
└─ Arquivo de autorizações
```

### 6. **FLUXO DE LEMBRETES** 🔔
```
Status: PARCIAL (email/SMS básico)

O que fazer:
├─ Lembretes de agendamento (SMS/WhatsApp/Email)
├─ Confirmação com 1-click
├─ Reassinado automático se não responder
├─ Histórico de comunicações
└─ Templates customizáveis por especialidade
```

### 7. **FLUXO DE INTEGRAÇÃO COM CARTÃO CONVÊNIO** 💳
```
Status: NÃO IMPLEMENTADO

O que fazer:
├─ Leitura de cartão com QR/código de barras
├─ Verificação automática de cobertura
├─ Bloqueio se não autorizado
└─ Desconto automático de copagamento
```

### 8. **FLUXO DE ANÁLISE PREDITIVA** 📊
```
Status: NÃO IMPLEMENTADO

O que fazer:
├─ Previsão de no-show (quem não vai vir)
├─ Sugestão de retorno baseada em padrões
├─ Alertas de pacientes de risco
└─ Recomendações de cross-sell (outros serviços)
```

---

## 📋 RESUMO: O QUE FAZER AGORA

### **PRIORIDADE 1 (Essencial)** 🔴
- [ ] Aprimorar fluxo de Retorno (automático + lembretes)
- [ ] Integração com WhatsApp para lembretes
- [ ] Nota Fiscal eletrônica
- [ ] Integração Convênio (verificação cobertura)

### **PRIORIDADE 2 (Importante)** 🟠
- [ ] Feedback/Avaliação após atendimento
- [ ] Melhor histórico de Triagem (gráficos vitais)
- [ ] Integração Estoque com Prescrição
- [ ] QR Code em Receita

### **PRIORIDADE 3 (Nice to Have)** 🟡
- [ ] Telemedicina
- [ ] Análise Preditiva
- [ ] Integração com dispositivos (pressão, oxímetro)
- [ ] Portal de Fornecedor (compras automáticas)

---

## 🎯 PRÓXIMA AÇÃO

**Qual fluxo você quer que eu implemente/melhore?**

1. ⚡ Retorno automático com lembretes
2. 📱 Integração WhatsApp
3. 🧾 Nota Fiscal Eletrônica
4. ⭐ Feedback/Avaliação
5. Outro?
