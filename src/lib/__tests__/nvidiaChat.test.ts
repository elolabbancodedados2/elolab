import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNvidiaChatCompletion } from '../../../supabase/functions/_shared/nvidia';

afterEach(() => vi.restoreAllMocks());

describe('NVIDIA direct conversation responses', () => {
  it('can disable thinking for short WhatsApp replies without changing other callers', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _options: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content: 'Olá!' } }] })));
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    await createNvidiaChatCompletion({ apiKey: 'placeholder', messages: [{ role: 'user', content: 'Olá' }], enableThinking: false });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({ chat_template_kwargs: { enable_thinking: false } });
    await createNvidiaChatCompletion({ apiKey: 'placeholder', messages: [{ role: 'user', content: 'Olá' }] });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).not.toHaveProperty('chat_template_kwargs');
  });
});
