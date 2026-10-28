import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, friendlyErrorMessage } from '@/components/ErrorState';
import { parseDateOnly } from '@/lib/dateOnly';
import { descreverIdade, mascararCpf } from '@/lib/identificacaoPaciente';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export interface PacienteIdentificacao {
  nome: string;
  nome_social?: string | null;
  data_nascimento?: string | null;
  cpf?: string | null;
  /**
   * `null` ou `undefined`: alergias não informadas.
   * Lista vazia: o paciente confirmou que não tem alergia conhecida.
   * A coluna `pacientes.alergias` vem como `'{}'` por padrão; sem um campo de
   * confirmação, a tela deve converter a lista vazia do banco em `null`.
   */
  alergias?: string[] | null;
  /** `undefined` omite o campo; `null` ou texto vazio exibe "Particular". */
  convenio?: string | null;
}

export type VarianteIdentificacao = 'pagina' | 'dialogo';
export type ContextoIdentificacao = 'registro' | 'prescricao' | 'cobranca';

interface IdentificacaoPacienteProps {
  paciente: PacienteIdentificacao | null | undefined;
  /** `pagina` (padrão) ou `dialogo`, mais compacta, para logo abaixo do título de um diálogo. */
  variante?: VarianteIdentificacao;
  /** Ajusta textos de apoio. Em `prescricao`, alergias não informadas pedem confirmação. */
  contexto?: ContextoIdentificacao;
  carregando?: boolean;
  /** Erro ao carregar o paciente. Tem prioridade sobre os dados recebidos. */
  erro?: unknown;
  onTentarNovamente?: () => void;
  className?: string;
}

/**
 * Valor ausente que compromete a identificação. Usa ícone e texto, nunca só cor.
 * Fica em `foreground` até existir o token `warning-text` (o `text-warning`
 * atual não passa em contraste AA; ver docs/ux/design-system/README.md).
 */
function Ausente({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-foreground">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}

function Campo({
  rotulo,
  compacto,
  children,
}: {
  rotulo: string;
  compacto: boolean;
  children: ReactNode;
}) {
  if (compacto) {
    return (
      <div className="flex items-baseline gap-1">
        <dt className="sr-only">{rotulo}</dt>
        <dd className="text-sm text-foreground">{children}</dd>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

function Alergias({
  alergias,
  contexto,
}: {
  alergias: string[] | null | undefined;
  contexto: ContextoIdentificacao;
}) {
  if (alergias == null) {
    return (
      <Ausente>
        {contexto === 'prescricao'
          ? 'Alergias não informadas. Confirme com o paciente antes de prescrever.'
          : 'Alergias não informadas'}
      </Ausente>
    );
  }
  const lista = Array.from(new Set(alergias.map((a) => a.trim()).filter(Boolean)));
  if (lista.length === 0) {
    return <span>Nenhuma alergia conhecida</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <span className="sr-only">Atenção: paciente com alergias registradas.</span>
      <ul className="flex flex-wrap gap-1.5" aria-label="Alergias registradas">
        {lista.map((alergia) => (
          <li key={alergia}>
            <Badge variant="destructive" className="text-xs">
              {alergia}
            </Badge>
          </li>
        ))}
      </ul>
    </span>
  );
}

/** Anuncia ao leitor de tela quando o paciente exibido muda com a tela aberta. */
function useAnuncioDeTroca(nome: string | undefined): string {
  const anterior = useRef<string | undefined>(nome);
  const [anuncio, setAnuncio] = useState('');

  useEffect(() => {
    if (nome && anterior.current && nome !== anterior.current) {
      setAnuncio(`Paciente alterado para ${nome}.`);
    }
    if (nome) anterior.current = nome;
  }, [nome]);

  return anuncio;
}

/**
 * Cabeçalho de identificação do paciente para telas em que se registra,
 * prescreve ou cobra (CLIN-QA-012). Exibe nome completo, data de nascimento,
 * idade, alergias e CPF mascarado. Só exibe: não edita nem revela o CPF.
 * Especificação: docs/ux/telas/identificacao-paciente.md.
 */
export function IdentificacaoPaciente({
  paciente,
  variante = 'pagina',
  contexto = 'registro',
  carregando = false,
  erro,
  onTentarNovamente,
  className,
}: IdentificacaoPacienteProps) {
  const compacto = variante === 'dialogo';
  const anuncio = useAnuncioDeTroca(carregando || erro ? undefined : paciente?.nome);
  const base = cn('rounded-md border border-border bg-card', compacto ? 'px-3 py-2' : 'px-4 py-3', className);

  const regiaoAnuncio = (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {anuncio}
    </p>
  );

  if (carregando) {
    return (
      <section aria-label="Identificação do paciente" aria-busy="true" className={base}>
        <span className="sr-only">Carregando identificação do paciente.</span>
        <Skeleton className="h-5 w-64 max-w-full" />
        <div className={cn('flex flex-wrap', compacto ? 'mt-2 gap-3' : 'mt-3 gap-6')}>
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-40" />
        </div>
        {regiaoAnuncio}
      </section>
    );
  }

  if (erro) {
    return (
      <section aria-label="Identificação do paciente" className={cn('rounded-md', className)}>
        <ErrorState
          compact
          description={`Não foi possível carregar a identificação do paciente. ${friendlyErrorMessage(erro)}`}
          onRetry={onTentarNovamente}
        />
        {regiaoAnuncio}
      </section>
    );
  }

  if (!paciente) {
    return (
      <section aria-label="Identificação do paciente" className={base}>
        <p className="text-sm text-muted-foreground">Nenhum paciente selecionado.</p>
        {regiaoAnuncio}
      </section>
    );
  }

  const dataNascimento =
    paciente.data_nascimento && !Number.isNaN(parseDateOnly(paciente.data_nascimento).getTime())
      ? paciente.data_nascimento
      : null;
  const nascimento = dataNascimento ? formatDate(dataNascimento, 'short') : null;
  const idade = dataNascimento ? descreverIdade(dataNascimento) : null;
  const cpf = mascararCpf(paciente.cpf);
  const nomeSocial = paciente.nome_social?.trim();

  return (
    <section aria-label="Identificação do paciente" className={base}>
      <p
        className={cn(
          'break-words font-semibold leading-tight text-foreground',
          compacto ? 'text-sm' : 'text-base',
        )}
      >
        {paciente.nome}
      </p>
      {nomeSocial && nomeSocial !== paciente.nome && (
        <p className="mt-0.5 text-sm text-muted-foreground">Nome social: {nomeSocial}</p>
      )}
      <dl
        className={cn(
          'flex flex-wrap',
          compacto ? 'mt-1 gap-x-3 gap-y-1' : 'mt-3 gap-x-6 gap-y-3',
        )}
      >
        <Campo rotulo="Data de nascimento" compacto={compacto}>
          {nascimento ?? (
            <Ausente>{compacto ? 'Data de nascimento não informada' : 'Não informada'}</Ausente>
          )}
        </Campo>
        {/* Sem data, a idade não existe: o aviso acima já cobre os dois campos. */}
        {idade && (
          <Campo rotulo="Idade" compacto={compacto}>
            {idade}
          </Campo>
        )}
        <Campo rotulo="CPF" compacto={compacto}>
          {cpf ? (
            <>
              {compacto && <span aria-hidden="true">CPF </span>}
              <span aria-hidden="true">{cpf}</span>
              <span className="sr-only">{`Mascarado, final ${cpf.slice(-2)}`}</span>
            </>
          ) : compacto ? (
            'CPF não informado'
          ) : (
            'Não informado'
          )}
        </Campo>
        {paciente.convenio !== undefined && (
          <Campo rotulo="Convênio" compacto={compacto}>
            {paciente.convenio?.trim() || 'Particular'}
          </Campo>
        )}
        <div className={cn('flex', compacto ? 'basis-full items-baseline gap-1' : 'flex-col gap-0.5')}>
          <dt className={compacto ? 'text-sm text-muted-foreground' : 'text-xs text-muted-foreground'}>
            Alergias
          </dt>
          <dd className={cn('text-sm text-foreground', !compacto && 'font-medium')}>
            <Alergias alergias={paciente.alergias} contexto={contexto} />
          </dd>
        </div>
      </dl>
      {regiaoAnuncio}
    </section>
  );
}
