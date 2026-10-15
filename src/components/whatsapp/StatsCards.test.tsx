import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatsCards } from './StatsCards';

describe('WhatsApp operational counters', () => {
  it('shows bookings, today agenda outcomes and failed deliveries with their scope', () => {
    render(<StatsCards sessions={[]} stats={{ messages: 11, conversations: 12, actions: 13, ai_bookings: 14, confirmed_today: 15, no_shows_today: 16, delivery_failures: 17 }} />);
    for (const label of ['Agendamentos pela IA hoje', 'Confirmadas na agenda hoje', 'Faltas na agenda hoje', 'Falhas de envio hoje']) expect(screen.getByText(label)).toBeInTheDocument();
    for (const count of [11, 12, 13, 14, 15, 16, 17]) expect(screen.getByText(String(count))).toBeInTheDocument();
    expect(screen.getByText(/America\/Sao_Paulo/)).toBeInTheDocument();
  });
});
