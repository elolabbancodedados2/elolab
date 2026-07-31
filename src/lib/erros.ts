/**
 * Traduz erro de banco/API para uma frase que a pessoa na recepção entende.
 *
 * Hoje o app faz uma de duas coisas ruins com erro de servidor: engole
 * ("Erro ao salvar") ou despeja o texto cru do Postgres. Nenhuma das duas
 * ajuda — "null value in column enfermeiro_id violates not-null constraint"
 * e "Erro ao salvar" deixam a pessoa igualmente sem saber o que fazer.
 *
 * Aqui o código do erro vira instrução. O texto original continua disponível
 * em `detalheTecnico` para quem for investigar.
 */

/** Formato de erro do supabase-js/PostgREST. */
export interface ErroApi {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

/** Nome de coluna -> como a pessoa chama aquilo na tela. */
const CAMPOS: Record<string, string> = {
  enfermeiro_id: 'profissional responsável',
  paciente_id: 'paciente',
  medico_id: 'médico',
  clinica_id: 'clínica',
  agendamento_id: 'agendamento',
  prontuario_id: 'prontuário',
  convenio_id: 'convênio',
  item_id: 'item de estoque',
  data_nascimento: 'data de nascimento',
  nome: 'nome',
  email: 'e-mail',
  cpf: 'CPF',
  valor: 'valor',
  data: 'data',
};

function nomeAmigavel(coluna: string): string {
  return CAMPOS[coluna] ?? coluna.replace(/_id$/, '').replace(/_/g, ' ');
}

/** Extrai o nome da coluna citada na mensagem crua do Postgres. */
function colunaCitada(msg: string): string | null {
  return (
    msg.match(/column "([a-z0-9_]+)"/i)?.[1] ??
    msg.match(/Key \(([a-z0-9_]+)\)/i)?.[1] ??
    null
  );
}

/**
 * Frase pronta para mostrar ao usuário. Sempre devolve algo útil — nunca
 * string vazia, porque toast sem texto é pior que toast com texto genérico.
 */
export function mensagemDeErro(erro: unknown): string {
  if (!erro) return 'Não foi possível concluir. Tente de novo.';

  const e = erro as ErroApi & { error_description?: string };
  const msg = String(e.message ?? e.error_description ?? erro);
  const coluna = colunaCitada(msg);
  const campo = coluna ? nomeAmigavel(coluna) : 'um campo obrigatório';

  switch (e.code) {
    case '23505': // unique_violation
      return coluna
        ? `Já existe um registro com esse ${nomeAmigavel(coluna)}.`
        : 'Já existe um registro igual a este.';

    case '23503': // foreign_key_violation
      return `O ${campo} informado não existe mais. Recarregue a página e selecione de novo.`;

    case '23502': // not_null_violation
      return `Falta preencher: ${campo}.`;

    case '23514': // check_violation
      return 'Algum valor está fora do que o sistema aceita. Confira os campos destacados.';

    case '22P02': // invalid_text_representation
      return 'Algum valor está em formato inválido. Confira datas e números.';

    case '22001': // string_data_right_truncation
      return 'Um dos textos é longo demais para o campo.';

    case '42501': // insufficient_privilege
      return 'Você não tem permissão para esta ação. Peça a um administrador da clínica.';

    case 'PGRST116': // nenhuma linha onde se esperava uma
      return 'Registro não encontrado. Ele pode ter sido apagado por outra pessoa.';

    case 'PGRST204': // coluna inexistente no cache do schema
      return 'O sistema tentou gravar um campo que não existe. Avise o suporte.';

    case 'PGRST301': // JWT inválido/expirado
    case '401':
      return 'Sua sessão expirou. Entre de novo.';
  }

  // Sem código: cair para padrões conhecidos do texto.
  if (/permission denied|row-level security|violates row-level/i.test(msg)) {
    return 'Você não tem permissão para esta ação. Peça a um administrador da clínica.';
  }
  if (/rate limit|too many requests/i.test(msg)) {
    return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  }
  if (/already registered|already been registered|user already exists/i.test(msg)) {
    return 'Já existe uma conta com este e-mail.';
  }
  if (/invalid login credentials/i.test(msg)) {
    return 'E-mail ou senha incorretos.';
  }
  if (/email not confirmed/i.test(msg)) {
    return 'Confirme seu e-mail antes de entrar. Verifique a caixa de entrada.';
  }
  if (/weak_password|password should be/i.test(msg)) {
    return 'Senha fraca: use ao menos 10 caracteres, com maiúscula, minúscula e número.';
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  }

  // Mensagem própria do app (lançada com new Error) costuma já estar em
  // português e ser específica — vale mais do que qualquer genérico.
  if (msg && !/^\[object/.test(msg) && msg.length < 200) return msg;

  return 'Não foi possível concluir. Tente de novo.';
}

/**
 * Texto cru, para quem for investigar. Vai na descrição do toast, embaixo da
 * frase amigável — não substitui.
 */
export function detalheTecnico(erro: unknown): string | undefined {
  const e = erro as ErroApi;
  if (!e?.code && !e?.details) return undefined;
  return [e.code, e.details || e.message].filter(Boolean).join(' — ');
}
