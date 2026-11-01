import { memo, useEffect, useState } from 'react';
import { Eye, Edit, Trash2, Link, Unlink, Phone, Mail, AlertTriangle, ChevronLeft, ChevronRight, Power, MoreHorizontal } from 'lucide-react';
import { linkWhatsApp } from '@/lib/whatsapp';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cpfMascarado, nomesDoPaciente, sexoPorExtenso, situacaoCarteirinha } from '@/lib/pacienteFicha';
import { WhatsAppModelosMenu } from './WhatsAppModelosMenu';
import { ActionableEmptyState } from '@/components/ActionableEmptyState';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PatientPhoto, AllergyAlert } from '@/components/clinical';
import { describeMissingPatientContacts } from '@/lib/patientContactCompleteness';
import { cn } from '@/lib/utils';
import { PainelPaciente } from './PainelPaciente';

const CHAVE_MODO = 'elolab_pacientes_modo';
type ModoLista = 'fichas' | 'lista';

function lerModo(): ModoLista {
  try {
    return localStorage.getItem(CHAVE_MODO) === 'lista' ? 'lista' : 'fichas';
  } catch {
    return 'fichas';
  }
}

// O painel lateral só cabe em telas largas; abaixo disso o clique abre a ficha.
const TELA_LARGA = '(min-width: 1280px)';
function useTelaLarga() {
  const [larga, setLarga] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(TELA_LARGA).matches === true);
  useEffect(() => {
    const consulta = window.matchMedia?.(TELA_LARGA);
    if (!consulta) return;
    const atualizar = () => setLarga(consulta.matches);
    consulta.addEventListener?.('change', atualizar);
    return () => consulta.removeEventListener?.('change', atualizar);
  }, []);
  return larga;
}

interface AcaoPaciente {
  chave: string;
  rotulo: string;
  nomeAcessivel: string;
  icone: typeof Eye;
  destrutiva?: boolean;
  executar: () => void;
}

interface PatientListTableProps {
  pacientes: any[];
  totalPacientes: number | null;
  totalPacientesCarregado: boolean;
  hasFiltrosAtivos?: boolean;
  pagina: number;
  hasMore: boolean;
  isLoading?: boolean;
  hasError?: boolean;
  onPaginaChange: (pagina: number) => void;
  onLimparFiltros: () => void;
  onCreate?: () => void;
  onView: (paciente: any) => void;
  onEdit: (paciente: any) => void;
  onDelete: (paciente: any) => void;
  podeExcluirPaciente?: boolean;
  podeEditarPaciente?: boolean;
  onGeneratePortalLink: (id: string, nome: string) => void;
  onRevokePortalLinks: (id: string, nome: string) => void;
  onChangeStatus?: (paciente: any) => void;
  /**
   * Gerar link do portal grava em paciente_portal_tokens, cujo RLS exige admin
   * ou recepção. Enfermagem alcança esta tela e era recusada no clique — o
   * botão precisa desaparecer para quem não pode usá-lo.
   */
  podeGerarLinkPortal?: boolean;
  getConvenioNome: (id: string | null) => string;
  calcularIdade: (data: string | null) => number;
  /** O saldo no painel lateral só aparece para quem vê o financeiro. */
  podeVerFinanceiro?: boolean;
}

export const PatientListTable = memo(function PatientListTable({
  pacientes, totalPacientes, totalPacientesCarregado, hasFiltrosAtivos = false, onLimparFiltros, onCreate, onView, onEdit, onDelete, onGeneratePortalLink, onRevokePortalLinks,
  podeGerarLinkPortal = true, podeExcluirPaciente = false, podeEditarPaciente = true, onChangeStatus, getConvenioNome, calcularIdade,
  pagina, hasMore, isLoading = false, hasError = false, onPaginaChange, podeVerFinanceiro = false,
}: PatientListTableProps) {
  // Ordem de importância: no celular só as duas primeiras viram botão; o resto vai para "Mais".
  const acoesDoPaciente = (paciente: any): AcaoPaciente[] => [
    ...(podeEditarPaciente ? [{ chave: 'editar', rotulo: 'Editar', nomeAcessivel: `Editar ${paciente.nome}`, icone: Edit, executar: () => onEdit(paciente) }] : []),
    ...(podeGerarLinkPortal && paciente.ativo !== false ? [
      { chave: 'portal', rotulo: 'Link do portal', nomeAcessivel: `Gerar link do portal para ${paciente.nome}`, icone: Link, executar: () => onGeneratePortalLink(paciente.id, paciente.nome) },
      { chave: 'revogar', rotulo: 'Revogar portal', nomeAcessivel: `Revogar links do portal de ${paciente.nome}`, icone: Unlink, destrutiva: true, executar: () => onRevokePortalLinks(paciente.id, paciente.nome) },
    ] : []),
    ...(podeEditarPaciente && onChangeStatus ? [{ chave: 'status', rotulo: paciente.ativo === false ? 'Reativar' : 'Inativar', nomeAcessivel: `${paciente.ativo === false ? 'Reativar' : 'Inativar'} ${paciente.nome}`, icone: Power, executar: () => onChangeStatus(paciente) }] : []),
    ...(podeExcluirPaciente ? [{ chave: 'excluir', rotulo: 'Excluir', nomeAcessivel: `Excluir ${paciente.nome}`, icone: Trash2, destrutiva: true, executar: () => onDelete(paciente) }] : []),
  ];
  const tamanhoPagina = 50;
  // Fichas é o padrão do protótipo aprovado em 30/10/2026; a lista em tabela continua disponível.
  const [modo, setModo] = useState<ModoLista>(lerModo);
  const trocarModo = (novo: ModoLista) => {
    setModo(novo);
    try { localStorage.setItem(CHAVE_MODO, novo); } catch { /* armazenamento indisponível: vale só nesta sessão */ }
  };
  const telaLarga = useTelaLarga();
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const comPainel = telaLarga && modo === 'fichas' && !isLoading && !hasError && pacientes.length > 0;
  const selecionado = comPainel ? pacientes.find(p => p.id === selecionadoId) ?? pacientes[0] : null;
  const paginaAtual = pagina;
  const pacientesVisiveis = pacientes;
  const vazioPorBusca = totalPacientes !== 0;
  const estadoVazio = !totalPacientesCarregado
    ? { title: 'Verificando o cadastro de pacientes', description: 'A lista será atualizada assim que a consulta terminar.' }
    : totalPacientes === 0
      ? { title: 'Ainda não há pacientes cadastrados', description: 'Cadastre o primeiro paciente para iniciar o atendimento nesta clínica.' }
      : totalPacientes === null
        ? { title: 'Não foi possível confirmar o cadastro', description: 'Os indicadores estão indisponíveis. A lista permanece preservada.' }
        : { title: 'Nenhum paciente corresponde à busca e aos filtros atuais', description: 'Tente ajustar os termos ou remova os filtros para voltar a ver os pacientes.' };
  const renderEmptyState = () => (
    !totalPacientesCarregado || totalPacientes === null ? (
      <div role="status" className="px-4 py-10 text-center text-sm text-muted-foreground">
        <p className="font-medium">{estadoVazio.title}</p>
        <p className="mt-1">{estadoVazio.description}</p>
      </div>
    ) : (
      <ActionableEmptyState
        title={estadoVazio.title}
        description={estadoVazio.description}
        actionLabel={hasFiltrosAtivos && vazioPorBusca ? 'Limpar busca e filtros' : totalPacientes === 0 && onCreate ? 'Novo paciente' : undefined}
        onAction={hasFiltrosAtivos && vazioPorBusca ? onLimparFiltros : totalPacientes === 0 ? onCreate : undefined}
        className="px-4 py-8"
      />
    )
  );

  return (
    <div>
      <div role="group" aria-label="Exibição da lista de pacientes" className="hidden justify-end gap-1 px-4 pb-3 lg:flex">
        {(['fichas', 'lista'] as const).map(opcao => (
          <Button
            key={opcao}
            type="button"
            size="sm"
            variant={modo === opcao ? 'default' : 'outline'}
            aria-pressed={modo === opcao}
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => trocarModo(opcao)}
          >
            {opcao === 'fichas' ? 'Fichas' : 'Lista'}
          </Button>
        ))}
      </div>
      <div className={cn(comPainel && 'grid grid-cols-[minmax(0,1fr)_340px] gap-3 px-4 pb-4')}>
      <div className={cn('divide-y', modo === 'fichas' ? (comPainel ? 'grid grid-cols-2 content-start gap-3 divide-y-0' : 'lg:grid lg:grid-cols-2 lg:gap-3 lg:divide-y-0 lg:px-4 lg:pb-4 2xl:grid-cols-3') : 'lg:hidden')}>
        {isLoading ? <div className="px-4 py-12 text-center text-muted-foreground">Carregando pacientes…</div> : hasError ? <div className="px-4 py-12 text-center text-destructive">Não foi possível carregar esta página.</div> : pacientes.length === 0 ? (
          renderEmptyState()
        ) : pacientesVisiveis.map((paciente) => {
          const idade = calcularIdade(paciente.data_nascimento);
          const contatoAusente = describeMissingPatientContacts(paciente);
          const nomes = nomesDoPaciente(paciente);
          const carteira = paciente.convenio_id ? situacaoCarteirinha(paciente.validade_carteira) : null;
          const temWhatsApp = Boolean(linkWhatsApp(paciente.telefone, 'x'));
          const acoes = acoesDoPaciente(paciente);
          const visiveis = acoes.slice(0, temWhatsApp ? 1 : 2);
          const noMenu = acoes.slice(visiveis.length);
          return (
            <article key={paciente.id} className={cn('p-4 lg:rounded-xl lg:border lg:border-border lg:bg-card lg:shadow-xs', selecionado?.id === paciente.id && 'lg:border-foreground lg:ring-1 lg:ring-foreground')}>
              <button type="button" aria-pressed={comPainel ? selecionado?.id === paciente.id : undefined} className="flex min-h-11 w-full items-start gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => (comPainel ? setSelecionadoId(paciente.id) : onView(paciente))} onDoubleClick={() => comPainel && onView(paciente)}>
                <PatientPhoto pacienteId={paciente.id} pacienteNome={paciente.nome} currentPhotoUrl={paciente.foto_url} size="sm" editable={false} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{nomes.principal}</span>
                  {nomes.registro && <span className="block truncate text-xs text-muted-foreground">Registro: {nomes.registro}</span>}
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {paciente.ativo === false && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                    {paciente.data_nascimento && <span>{Number.isFinite(idade) && idade >= 0 ? `${idade} ${idade === 1 ? 'ano' : 'anos'}` : 'Nascimento inválido'}</span>}
                    {sexoPorExtenso(paciente.sexo) && <span>{sexoPorExtenso(paciente.sexo)}</span>}
                    <Badge variant="outline" className="max-w-full truncate text-[10px]">{getConvenioNome(paciente.convenio_id)}</Badge>
                  </span>
                  {carteira && <span className={cn('mt-1.5 flex items-center gap-1.5 text-xs font-medium', carteira.nivel === 'vencida' ? 'text-destructive' : 'text-warning-foreground')}><AlertTriangle aria-hidden="true" className="h-3 w-3" />{carteira.texto}</span>}
                  {paciente.telefone && <span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{paciente.telefone}</span>}
                  {contatoAusente && <span className="mt-1.5 flex items-center gap-1.5 text-xs text-warning-foreground"><AlertTriangle aria-hidden="true" className="h-3 w-3" />{contatoAusente}</span>}
                </span>
                <Eye className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
              {paciente.alergias?.length > 0 && <AllergyAlert alergias={paciente.alergias} compact className="mt-2" />}
              <div data-testid="patient-mobile-actions" className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2 lg:gap-1.5" onClick={(e) => e.stopPropagation()}>
                {temWhatsApp && <WhatsAppModelosMenu paciente={paciente} className="h-11 w-full min-w-0 px-2 text-xs lg:h-9" />}
                {visiveis.map(acao => (
                  <Button key={acao.chave} variant="outline" onClick={acao.executar} className={cn('h-11 w-full min-w-0 gap-1 px-2 text-xs lg:h-9', acao.destrutiva && 'text-destructive')} aria-label={acao.nomeAcessivel}>
                    <acao.icone aria-hidden="true" className="h-4 w-4" /> {acao.rotulo}
                  </Button>
                ))}
                {visiveis.length + (temWhatsApp ? 1 : 0) < 2 && <span aria-hidden="true" />}
                {noMenu.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-11 w-11 lg:h-9 lg:w-9" aria-label={`Mais ações para ${paciente.nome}`}>
                        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {noMenu.map(acao => (
                        <DropdownMenuItem key={acao.chave} onSelect={acao.executar} className={cn('min-h-11 gap-2', acao.destrutiva && 'text-destructive focus:text-destructive')} aria-label={acao.nomeAcessivel}>
                          <acao.icone aria-hidden="true" className="h-4 w-4" />{acao.rotulo}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : <span aria-hidden="true" />}
              </div>
            </article>
          );
        })}
      </div>
      {selecionado && (
        <PainelPaciente
          paciente={selecionado}
          idade={calcularIdade(selecionado.data_nascimento)}
          convenio={getConvenioNome(selecionado.convenio_id)}
          podeEditar={podeEditarPaciente}
          podeVerFinanceiro={podeVerFinanceiro}
          onView={onView}
          onEdit={onEdit}
        />
      )}
      </div>
      <div className={cn('hidden overflow-x-auto', modo === 'lista' && 'lg:block')}>
      <Table className="[&_th]:px-2 [&_td]:px-2">
        <TableHeader>
          <TableRow>
            <TableHead>Paciente</TableHead>
            <TableHead className="hidden md:table-cell">CPF</TableHead>
            <TableHead className="hidden sm:table-cell">Contato</TableHead>
            <TableHead className="hidden lg:table-cell">Convênio</TableHead>
            <TableHead className="hidden lg:table-cell">Idade</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">Carregando pacientes…</TableCell></TableRow>
          ) : hasError ? (
            <TableRow><TableCell colSpan={6} className="py-12 text-center text-destructive">Não foi possível carregar esta página.</TableCell></TableRow>
          ) : pacientes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-3">{renderEmptyState()}</TableCell>
            </TableRow>
          ) : (
            pacientesVisiveis.map((paciente) => {
              const idade = calcularIdade(paciente.data_nascimento);
              const contatoAusente = describeMissingPatientContacts(paciente);
              return (
                <TableRow
                  key={paciente.id}
                  tabIndex={0}
                  aria-label={`Abrir ficha de ${paciente.nome}`}
                  className="cursor-pointer transition-colors hover:bg-primary/[0.05] focus-visible:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() => onView(paciente)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    onView(paciente);
                  }}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <PatientPhoto
                        pacienteId={paciente.id}
                        pacienteNome={paciente.nome}
                        currentPhotoUrl={paciente.foto_url}
                        size="sm"
                        editable={false}
                      />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{nomesDoPaciente(paciente).principal}</p>
                        {nomesDoPaciente(paciente).registro && <p className="truncate text-xs text-muted-foreground">Registro: {nomesDoPaciente(paciente).registro}</p>}
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          {paciente.ativo === false && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Inativo</Badge>}
                          {sexoPorExtenso(paciente.sexo) && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{sexoPorExtenso(paciente.sexo)}</Badge>}
                          {paciente.convenio_id && situacaoCarteirinha(paciente.validade_carteira)?.nivel === 'vencida' && <Badge variant="outline" className="border-destructive/30 px-1.5 py-0 text-[10px] text-destructive">Carteirinha vencida</Badge>}
                          {paciente.data_nascimento && Number.isFinite(idade) && idade >= 0 && idade < 18 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Menor</Badge>}
                        </div>
                        {paciente.alergias && paciente.alergias.length > 0 && (
                          <AllergyAlert alergias={paciente.alergias} compact className="mt-1" />
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-sm tabular-nums md:table-cell">{cpfMascarado(paciente.cpf) || '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="space-y-0.5 text-sm">
                      {paciente.telefone && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="h-3 w-3" />{paciente.telefone}
                        </div>
                      )}
                      {paciente.email && (
                        <div className="flex items-center gap-1.5 text-muted-foreground truncate max-w-[180px]">
                          <Mail className="h-3 w-3" />{paciente.email}
                        </div>
                      )}
                      {contatoAusente && (
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-warning-foreground">
                          <AlertTriangle aria-hidden="true" className="h-3 w-3" />{contatoAusente}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="outline" className="text-xs">
                      {getConvenioNome(paciente.convenio_id)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap lg:table-cell">
                    <span className="text-sm tabular-nums">
                      {paciente.data_nascimento
                        ? Number.isFinite(idade) && idade >= 0 ? `${idade} anos` : <span className="text-muted-foreground">Data inválida</span>
                        : <span className="text-muted-foreground">N/I</span>}
                    </span>
                  </TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      <Button variant="ghost" size="icon" onClick={() => onView(paciente)} title="Ver detalhes" aria-label={`Ver detalhes de ${paciente.nome}`} className="h-11 w-11 rounded-full hover:bg-primary/10 hover:text-primary">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <WhatsAppModelosMenu paciente={paciente} rotulo="" className="h-11 w-14 gap-0.5 border-0 px-1" />
                      {podeGerarLinkPortal && paciente.ativo !== false && (
                        <Button variant="ghost" size="icon" onClick={() => onGeneratePortalLink(paciente.id, paciente.nome)} title="Link do portal" aria-label={`Gerar link do portal para ${paciente.nome}`} className="h-11 w-11 rounded-full hover:bg-primary/10 hover:text-primary">
                          <Link className="h-4 w-4" />
                        </Button>
                      )}
                      {podeGerarLinkPortal && paciente.ativo !== false && (
                        <Button variant="ghost" size="icon" onClick={() => onRevokePortalLinks(paciente.id, paciente.nome)} title="Revogar links do portal" aria-label={`Revogar links do portal de ${paciente.nome}`} className="h-11 w-11 rounded-full text-destructive hover:bg-destructive/10">
                          <Unlink className="h-4 w-4" />
                        </Button>
                      )}
                      {podeEditarPaciente &&
                        <Button variant="ghost" size="icon" onClick={() => onEdit(paciente)} title="Editar" aria-label={`Editar ${paciente.nome}`} className="h-11 w-11 rounded-full hover:bg-primary/10 hover:text-primary">
                          <Edit className="h-4 w-4" />
                        </Button>
                      }
                      {podeEditarPaciente && onChangeStatus &&
                        <Button variant="ghost" size="icon" onClick={() => onChangeStatus(paciente)} title={paciente.ativo === false ? 'Reativar paciente' : 'Inativar paciente'} aria-label={`${paciente.ativo === false ? 'Reativar' : 'Inativar'} ${paciente.nome}`} className="h-11 w-11 rounded-full hover:bg-primary/10 hover:text-primary">
                          <Power className="h-4 w-4" />
                        </Button>
                      }
                      {podeExcluirPaciente && (
                        <Button variant="ghost" size="icon" onClick={() => onDelete(paciente)} title="Excluir ficha vazia" aria-label={`Excluir ${paciente.nome}`} className="h-11 w-11 rounded-full hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      </div>
      {(pagina > 0 || hasMore) && (
        <nav aria-label="Paginação de pacientes" className="flex flex-col gap-2 border-t p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Mostrando {paginaAtual * tamanhoPagina + (pacientes.length ? 1 : 0)}–{paginaAtual * tamanhoPagina + pacientes.length} pacientes{hasMore ? ' (há mais)' : ''}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 gap-1 rounded-full"
              disabled={paginaAtual === 0}
              onClick={() => onPaginaChange(paginaAtual - 1)}
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <span className="min-w-20 text-center text-xs text-muted-foreground" aria-label={`Página ${paginaAtual + 1}`}>
              Página {paginaAtual + 1}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 gap-1 rounded-full"
              disabled={!hasMore}
              onClick={() => onPaginaChange(paginaAtual + 1)}
            >
              Próxima <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
});
