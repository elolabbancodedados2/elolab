import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });
  it('permite assumir uma conversa ativa sem esperar uma transferência da IA', async () => {
    const onStatusChange = vi.fn();
    render(<ConversationsTab conversations={[{ ...conversation, status: 'ativo' }]}
      hasMoreConversations={false} isLoadingMoreConversations={false} onLoadMoreConversations={vi.fn()}
      onStatusChange={onStatusChange} isUpdating={false} onSendMessage={vi.fn(async () => {})}
      isSending={false} onMarkRead={vi.fn()} onAddInternalNote={vi.fn(async () => {})}
      isAddingNote={false} onPriorityChange={vi.fn()} onGenerateSummary={vi.fn()}
      isGeneratingSummary={false} onSendMedia={vi.fn(async () => {})} isSendingMedia={false}
      isClosing={false} onCloseConversation={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Assumir' }));
    expect(onStatusChange).toHaveBeenCalledWith(conversation.id, 'em_atendimento_humano');
  });

  it('mostra o contexto apenas no painel interno após abrir a conversa e rotula os dados', async () => {
    const user = userEvent.setup();
    const onMarkRead = vi.fn();
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
        onMarkRead={onMarkRead}
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

    expect(screen.getByRole('textbox', { name: 'Buscar conversas por nome ou número' })).toBeInTheDocument();
    expect(screen.queryByText('Dor de cabeça')).not.toBeInTheDocument();
    const selectConversation = screen.getByRole('button', { name: /Abrir conversa com Ana Clínica/ });
    expect(selectConversation).toHaveAttribute('aria-pressed', 'false');
    expect(within(selectConversation).queryByRole('button')).not.toBeInTheDocument();
    selectConversation.focus();
    expect(selectConversation).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(selectConversation).toHaveAttribute('aria-pressed', 'true');
    expect(onMarkRead).toHaveBeenCalledWith(conversation.id);
    expect(screen.getByRole('region', { name: 'Pré-triagem informada pelo paciente' })).toBeInTheDocument();
    expect(screen.getByText('Dor de cabeça')).toBeInTheDocument();
    expect(screen.getByText('Queixa principal')).toBeInTheDocument();
    expect(screen.getByText('Sensibilidade à luz')).toBeInTheDocument();
    expect(screen.getByText('Desde ontem')).toBeInTheDocument();
    expect(screen.getByText('Dipirona, Vitamina B')).toBeInTheDocument();
    expect(screen.getByText('Uso interno')).toBeInTheDocument();

    const activeFilter = screen.getByRole('button', { name: /Ativas/ });
    expect(activeFilter).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(activeFilter);
    expect(activeFilter).toHaveAttribute('aria-pressed', 'true');
  });
});
