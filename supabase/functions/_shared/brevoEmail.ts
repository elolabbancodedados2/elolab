const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const DEFAULT_SENDER = 'noreply@elolab.com.br';
const DEFAULT_LOGO_URL = 'https://app.elolab.com.br/email/elolab-logo.png';

export type BrevoRecipient = string | { email: string; name?: string };

export type BrevoAttachment = {
  filename: string;
  content: string;
};

export type BrandedEmailInput = {
  html: string;
  text?: string;
  preheader?: string;
};

export type BrevoEmailInput = BrandedEmailInput & {
  to: BrevoRecipient | BrevoRecipient[];
  subject: string;
  senderName?: string;
  replyTo?: string;
  attachments?: BrevoAttachment[];
  tags?: string[];
};

type LegacyBrevoPayload = {
  sender?: { name?: string };
  to: BrevoRecipient | BrevoRecipient[];
  subject: string;
  htmlContent?: string;
  html?: string;
  textContent?: string;
  replyTo?: string | { email: string };
  attachment?: Array<{ name?: string; filename?: string; content: string }>;
  attachments?: Array<{ name?: string; filename?: string; content: string }>;
  tags?: string[];
};

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function brandedHeader(preheader: string): string {
  const hiddenPreheader = preheader
    ? `<div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}</div>`
    : '';

  return `${hiddenPreheader}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;background:#f3f6f9">
      <tr><td align="center" style="padding:28px 16px 16px">
        <img src="${DEFAULT_LOGO_URL}" width="174" alt="EloLab" style="display:block;width:174px;max-width:70%;height:auto;border:0">
      </td></tr>
      <tr><td align="center" style="padding:0 12px 24px">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px">
          <tr><td style="padding:32px 28px;font-family:Arial,Helvetica,sans-serif;color:#172b4d;font-size:15px;line-height:1.65">
`;
}

function brandedFooter(): string {
  return `
          </td></tr>
          <tr><td style="padding:18px 28px;border-top:1px solid #e8edf2;font-family:Arial,Helvetica,sans-serif;color:#64748b;font-size:12px;line-height:1.5">
            Mensagem autom?tica do EloLab. Em caso de d?vida, acesse o suporte pelo aplicativo.
          </td></tr>
        </table>
        <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;color:#64748b;font-size:11px">EloLab · Gestão clínica com cuidado</p>
      </td></tr>
    </table>`;
}

export function renderBrandedEmail(input: BrandedEmailInput): { html: string; text: string } {
  const body = input.html.trim();
  const preheader = input.preheader ?? '';
  const text = input.text?.trim() || htmlToText(body);
  const header = brandedHeader(preheader);
  const footer = brandedFooter();

  if (/<html\b/i.test(body) && /<body\b[^>]*>/i.test(body)) {
    const withHeader = body.replace(/<body\b([^>]*)>/i, `<body$1>${header}`);
    return {
      html: withHeader.replace(/<\/body\s*>/i, `${footer}</body>`),
      text,
    };
  }

  return {
    html: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EloLab</title></head><body style="margin:0;padding:0;background:#f3f6f9">${header}${body}${footer}</body></html>`,
    text,
  };
}

export async function sendBrevoEmail(input: BrevoEmailInput): Promise<Response> {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) throw new Error('Envio de e-mail não configurado (BREVO_API_KEY ausente).');

  const rendered = renderBrandedEmail(input);
  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  const payload: Record<string, unknown> = {
    sender: { name: input.senderName || 'EloLab', email: DEFAULT_SENDER },
    to: recipients.map((recipient) => typeof recipient === 'string' ? { email: recipient } : recipient),
    subject: input.subject,
    htmlContent: rendered.html,
    textContent: rendered.text,
  };

  if (input.replyTo) payload.replyTo = { email: input.replyTo };
  if (input.tags?.length) payload.tags = input.tags;
  if (input.attachments?.length) {
    payload.attachment = input.attachments.map(({ filename, content }) => ({ name: filename, content }));
  }

  let response: Response;
  try {
    response = await fetch(BREVO_SEND_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Falha de conexão com o serviço de e-mail.');
  }

  return response;
}

/** Temporary-compatible adapter for existing Edge Function Brevo payloads. */
export async function sendBrandedBrevoRequest(init: RequestInit): Promise<Response> {
  if (typeof init.body !== 'string') throw new Error('Conteúdo de e-mail inválido.');

  let payload: LegacyBrevoPayload;
  try {
    payload = JSON.parse(init.body) as LegacyBrevoPayload;
  } catch {
    throw new Error('Conteúdo de e-mail inválido.');
  }

  const html = payload.htmlContent ?? payload.html;
  if (!html || !payload.subject || !payload.to) throw new Error('Dados de e-mail incompletos.');

  const attachments = payload.attachment ?? payload.attachments;
  const replyTo = typeof payload.replyTo === 'string' ? payload.replyTo : payload.replyTo?.email;

  return sendBrevoEmail({
    to: payload.to,
    subject: payload.subject,
    senderName: payload.sender?.name,
    html,
    text: payload.textContent,
    replyTo,
    tags: payload.tags,
    attachments: attachments?.map((item) => ({
      filename: item.filename ?? item.name ?? 'attachment',
      content: item.content,
    })),
  });
}
