import { supabase } from '@/integrations/supabase/client';

export type AcaoDeConta =
  | 'previa'
  | 'bloquear'
  | 'desbloquear'
  | 'trocar_senha'
  | 'enviar_reset'
  | 'confirmar_email'
  | 'apagar';

export interface PreviaDaConta {
  email: string;
  bloqueado: boolean;
  email_confirmado: boolean;
  ultimo_login: string | null;
  papeis: string[];
  dono_da_clinica: string | null;
  pacientes: number;
  agendamentos: number;
  /** Motivos que impedem a exclusão. Vazio = pode apagar. */
  impedimentos: string[];
  /** O que a exclusão levaria junto. */
  some_junto: string[];
}

interface Pedido {
  acao: AcaoDeConta;
  alvo_id: string;
  senha?: string;
  motivo?: string;
  confirmacao?: string;
}

/**
 * `functions.invoke` não lança em erro HTTP: devolve `{ data: null, error }`, e
 * a mensagem que a função escreveu fica em `error.context`, um Response ainda
 * não lido. Sem abrir esse corpo, toda recusa da função — "digite o e-mail para
 * confirmar", "esta conta tem registros vinculados" — chegava na tela como
 * "Edge Function returned a non-2xx status code", que não diz o que fazer.
 */
export async function chamarAdminContas<T = Record<string, unknown>>(
  pedido: Pedido,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-contas', { body: pedido });

  if (error) {
    let mensagem = error.message;
    const contexto = (error as { context?: Response }).context;
    if (contexto && typeof contexto.json === 'function') {
      try {
        const corpo = await contexto.json();
        if (corpo?.error) mensagem = corpo.error;
      } catch {
        // Resposta sem JSON: fica a mensagem original.
      }
    }
    throw new Error(mensagem);
  }

  // A função responde 200 com `{ error }` em alguns caminhos; sem esta checagem
  // a tela comemoraria uma ação que não aconteceu.
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error));
  }

  return data as T;
}

/**
 * Senha temporária legível: sem caracteres que se confundem ao ditar por
 * telefone (O/0, l/1/I), que é como ela costuma ser entregue.
 */
export function gerarSenhaTemporaria(): string {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const numeros = '23456789';
  const simbolos = '!@#$%&*';
  const alfabeto = letras + numeros + simbolos;

  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  const escolher = (fonte: string, i: number) => fonte[bytes[i] % fonte.length];

  // Garante um de cada classe antes de completar, para não gerar por acaso uma
  // senha que o próprio Supabase recusaria.
  const obrigatorios = [escolher(letras, 0), escolher(numeros, 1), escolher(simbolos, 2)];
  const resto = Array.from({ length: 13 }, (_, i) => escolher(alfabeto, i + 3));

  // Embaralha de trás para frente (Fisher–Yates). Ordenar com comparador
  // aleatório parece equivalente mas não é: a ordem final fica enviesada, e os
  // três obrigatórios tendem a ficar perto de onde começaram — no início da
  // senha, que é justamente onde um atacante olha primeiro.
  const chars = [...obrigatorios, ...resto];
  const sorteio = new Uint32Array(chars.length);
  crypto.getRandomValues(sorteio);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = sorteio[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
