export const DEFAULT_NVIDIA_CHAT_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b'
export const NVIDIA_CHAT_COMPLETIONS_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'

type NvidiaChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  name?: string
  tool_calls?: unknown[]
}

export async function createNvidiaChatCompletion({
  apiKey,
  model,
  messages,
  tools,
  toolChoice,
  maxTokens = 512,
  temperature = 0.2,
  timeoutMs = 45000,
  enableThinking,
}: {
  apiKey: string
  model?: string
  messages: NvidiaChatMessage[]
  tools?: unknown[]
  toolChoice?: 'auto' | 'none' | 'required'
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  enableThinking?: boolean
}) {
  const safeMaxTokens = Math.min(Math.max(Math.floor(maxTokens), 64), 4096)
  const body: Record<string, unknown> = {
    model: model || DEFAULT_NVIDIA_CHAT_MODEL,
    messages,
    max_tokens: safeMaxTokens,
    temperature: Math.min(Math.max(temperature, 0), 1),
    reasoning_budget: Math.min(128, Math.max(32, Math.floor(safeMaxTokens / 4))),
    stream: false,
  }

  if (tools?.length) body.tools = tools
  if (toolChoice) body.tool_choice = toolChoice
  if (enableThinking !== undefined) body.chat_template_kwargs = { enable_thinking: enableThinking }

  const response = await fetch(NVIDIA_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    // Do not log provider bodies: they can contain request fragments.
    throw new Error(`NVIDIA API HTTP ${response.status}`)
  }

  return await response.json()
}
