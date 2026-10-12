import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationsTab } from './ConversationsTab';
import type { WhatsAppConversation } from './types';

vi.mock('./useWhatsAppQueries', () => ({
  useWhatsAppInternalNotes: () => ({ data: [], isError: false }),
  useWhatsAppMessages: () => ({ data: [], isLoading: false, isError: false, hasOlderMessages: false }),
}));

const conversation = {
  id: 'conversation-1',
  session_id: 'session-1',
  remote_jid: '5511999999999@s.whatsapp.net',
  status: 'aguardando_humano',
  ultima_mensagem_at: '2026-10-12T12:00:00.000Z',
  responsavel_id: null,
  prioridade: 'normal',
  nao_lidas: 1,
  primeira_resposta_em: null,
  atendimento_humano_em: null,
  encerrada_em: null,
  sla_limite_em: null,
  resumo_ia: null,
  satisfacao_nota: null,
  satisfacao_comentario: null,
  pacientes: { nome: 'Ana Clínica' },
  profiles: null,
  contexto: [{
    queixa_principal: 'Dor de cabeça',
    sintomas: 'Sensibilidade à luz',
    duracao_sintomas: 'Desde ontem',
    medicamentos_em_uso: ['Dipirona', 'Vitamina B'],
    registrado_em: '2026-10-12T12:00:00.000Z',
  }],
} as WhatsAppConversation & { contexto: unknown };

describe('ConversationsTab pré-triagem', () => {
  it('mostra o contexto apenas no painel interno após abrir a conversa e rotula os dados', () => {
    render(
      <ConversationsTab
        conversations={[conversation]}
        hasMoreConversations={false}
        isLoadingMoreConversations={false}
        onLoadMoreConversations={vi.fn()}
        onStatusChange={vi.fn()}
        isUpdating={false}
        onSendMessage={vi.fn(async () => {})}
        isSending={false}
        onMarkRead={vi.fn()}
        onAddInternalNote={vi.fn(async () => {})}
        isAddingNote={false}
        onPriorityChange={vi.fn()}
        onGenerateSummary={vi.fn()}
        isGeneratingSummary={false}
        onSendMedia={vi.fn(async () => {})}
        isSendingMedia={false}
        isClosing={false}
        onCloseConversation={vi.fn()}
      />,
    );

    expect(screen.queryByText('Dor de cabeça')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Ana Clínica'));

    expect(screen.getByRole('region', { name: 'Pré-triagem informada pelo paciente' })).toBeInTheDocument();
    expect(screen.getByText('Dor de cabeça')).toBeInTheDocument();
    expect(screen.getByText('Queixa principal')).toBeInTheDocument();
    expect(screen.getByText('Sensibilidade à luz')).toBeInTheDocument();
    expect(screen.getByText('Desde ontem')).toBeInTheDocument();
    expect(screen.getByText('Dipirona, Vitamina B')).toBeInTheDocument();
    expect(screen.getByText('Uso interno')).toBeInTheDocument();
  });
});
