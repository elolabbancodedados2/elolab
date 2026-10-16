import { memo } from 'react';
import { motion } from 'framer-motion';
import { Eye, Edit, Trash2, Link, Unlink, Phone, Mail, AlertTriangle, ChevronLeft, ChevronRight, Power, MessageCircle } from 'lucide-react';
import { linkWhatsApp } from '@/lib/whatsapp';
import { Button } from '@/components/ui/button';
import { ActionableEmptyState } from '@/components/ActionableEmptyState';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PatientPhoto, AllergyAlert } from '@/components/clinical';
import { describeMissingPatientContacts } from '@/lib/patientContactCompleteness';

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
}

export const PatientListTable = memo(function PatientListTable({
  pacientes, totalPacientes, totalPacientesCarregado, hasFiltrosAtivos = false, onLimparFiltros, onCreate, onView, onEdit, onDelete, onGeneratePortalLink, onRevokePortalLinks,
  podeGerarLinkPortal = true, podeExcluirPaciente = false, podeEditarPaciente = true, onChangeStatus, getConvenioNome, calcularIdade,
  pagina, hasMore, isLoading = false, hasError = false, onPaginaChange,
}: PatientListTableProps) {
  const tamanhoPagina = 50;
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
      <div className="divide-y lg:hidden">
        {isLoading ? <div className="px-4 py-12 text-center text-muted-foreground">Carregando pacientes…</div> : hasError ? <div className="px-4 py-12 text-center text-destructive">Não foi possível carregar esta página.</div> : pacientes.length === 0 ? (
          renderEmptyState()
        ) : pacientesVisiveis.map((paciente) => {
          const idade = calcularIdade(paciente.data_nascimento);
          const contatoAusente = describeMissingPatientContacts(paciente);
          return (
            <article key={paciente.id} className="p-4">
              <button type="button" className="flex min-h-11 w-full items-start gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onView(paciente)}>
                <PatientPhoto pacienteId={paciente.id} pacienteNome={paciente.nome} currentPhotoUrl={paciente.foto_url} size="sm" editable={false} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{paciente.nome}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {paciente.ativo === false && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                    {paciente.data_nascimento && <span>{Number.isFinite(idade) && idade >= 0 ? `${idade} anos` : 'Nascimento inválido'}</span>}
                    <Badge variant="outline" className="max-w-full truncate text-[10px]">{getConvenioNome(paciente.convenio_id)}</Badge>
                  </span>
                  {paciente.telefone && <span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{paciente.telefone}</span>}
                  {contatoAusente && <span className="mt-1.5 flex items-center gap-1.5 text-xs text-warning-foreground"><AlertTriangle aria-hidden="true" className="h-3 w-3" />{contatoAusente}</span>}
                </span>
                <Eye className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
              {paciente.alergias?.length > 0 && <AllergyAlert alergias={paciente.alergias} compact className="mt-2" />}
              <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const whatsapp = linkWhatsApp(paciente.telefone, `Olá, ${String(paciente.nome_social || paciente.nome || '').split(' ')[0]}! Aqui é da clínica.`);
                  return whatsapp ? (
                    <Button asChild variant="outline" className="h-11 min-w-0 flex-1 gap-1 rounded-full border-[#1080CA]/30 px-2 text-xs text-[#1080CA]">
                      <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Chamar ${paciente.nome} no WhatsApp`}><MessageCircle className="h-4 w-4" /> WhatsApp</a>
                    </Button>
                  ) : null;
                })()}
                {podeGerarLinkPortal && paciente.ativo !== false && (
                  <Button variant="outline" onClick={() => onGeneratePortalLink(paciente.id, paciente.nome)} className="h-11 min-w-0 flex-1 gap-1 px-2 text-xs" aria-label={`Gerar link do portal para ${paciente.nome}`}>
                    <Link className="h-4 w-4" /> Portal
                  </Button>
                )}
                {podeGerarLinkPortal && paciente.ativo !== false && (
                  <Button variant="outline" onClick={() => onRevokePortalLinks(paciente.id, paciente.nome)} className="h-11 min-w-0 flex-1 gap-1 px-2 text-xs text-destructive" aria-label={`Revogar links do portal de ${paciente.nome}`}>
                    <Unlink className="h-4 w-4" /> Revogar
                  </Button>
                )}
                {podeEditarPaciente && <Button variant="outline" onClick={() => onEdit(paciente)} className="h-11 min-w-0 flex-1 gap-1 px-2 text-xs" aria-label={`Editar ${paciente.nome}`}>
                  <Edit className="h-4 w-4" /> Editar
                </Button>}
                {podeEditarPaciente && onChangeStatus && <Button variant="outline" onClick={() => onChangeStatus(paciente)} className="h-11 min-w-0 flex-1 gap-1 px-2 text-xs" aria-label={`${paciente.ativo === false ? 'Reativar' : 'Inativar'} ${paciente.nome}`}>
                  <Power className="h-4 w-4" /> {paciente.ativo === false ? 'Reativar' : 'Inativar'}
                </Button>}
                {podeExcluirPaciente && (
                  <Button variant="outline" onClick={() => onDelete(paciente)} className="h-11 min-w-0 flex-1 gap-1 px-2 text-xs text-destructive" aria-label={`Excluir ${paciente.nome}`}>
                    <Trash2 className="h-4 w-4" /> Excluir
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto lg:block">
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
                <TableRow key={paciente.id} className="cursor-pointer transition-colors hover:bg-[#1080CA]/[0.05]" onClick={() => onView(paciente)}>
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
                        <p className="font-medium truncate">{paciente.nome}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {paciente.ativo === false && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Inativo</Badge>}
                          {paciente.sexo && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {['M', 'masculino'].includes(paciente.sexo) ? 'M' : ['F', 'feminino'].includes(paciente.sexo) ? 'F' : 'O'}
                            </Badge>
                          )}
                          {paciente.data_nascimento && Number.isFinite(idade) && idade >= 0 && idade < 18 && <Badge className="bg-amber-500/10 text-amber-700 text-[10px] px-1.5 py-0">Menor</Badge>}
                        </div>
                        {paciente.alergias && paciente.alergias.length > 0 && (
                          <AllergyAlert alergias={paciente.alergias} compact className="mt-1" />
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-sm md:table-cell">{paciente.cpf || '—'}</TableCell>
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
                      <motion.div whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
                        <Button variant="ghost" size="icon" onClick={() => onView(paciente)} title="Ver detalhes" aria-label={`Ver detalhes de ${paciente.nome}`} className="h-11 w-11 rounded-full hover:bg-[#1080CA]/10 hover:text-[#1080CA]">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </motion.div>
                      {(() => {
                        const whatsapp = linkWhatsApp(paciente.telefone, `Olá, ${String(paciente.nome_social || paciente.nome || '').split(' ')[0]}! Aqui é da clínica.`);
                        return whatsapp ? (
                          <Button asChild variant="ghost" size="icon" title="Chamar no WhatsApp" className="h-11 w-11 rounded-full text-[#1080CA] hover:bg-[#1080CA]/10 hover:text-[#1080CA]">
                            <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Chamar ${paciente.nome} no WhatsApp`}><MessageCircle className="h-4 w-4" /></a>
                          </Button>
                        ) : null;
                      })()}
                      {podeGerarLinkPortal && paciente.ativo !== false && (
                        <motion.div whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
                          <Button variant="ghost" size="icon" onClick={() => onGeneratePortalLink(paciente.id, paciente.nome)} title="Link do portal" aria-label={`Gerar link do portal para ${paciente.nome}`} className="h-11 w-11 rounded-full hover:bg-[#1080CA]/10 hover:text-[#1080CA]">
                            <Link className="h-4 w-4" />
                          </Button>
                        </motion.div>
                      )}
                      {podeGerarLinkPortal && paciente.ativo !== false && (
                        <motion.div whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
                          <Button variant="ghost" size="icon" onClick={() => onRevokePortalLinks(paciente.id, paciente.nome)} title="Revogar links do portal" aria-label={`Revogar links do portal de ${paciente.nome}`} className="h-11 w-11 rounded-full text-destructive hover:bg-destructive/10">
                            <Unlink className="h-4 w-4" />
                          </Button>
                        </motion.div>
                      )}
                      {podeEditarPaciente && <motion.div whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
                        <Button variant="ghost" size="icon" onClick={() => onEdit(paciente)} title="Editar" aria-label={`Editar ${paciente.nome}`} className="h-11 w-11 rounded-full hover:bg-[#1080CA]/10 hover:text-[#1080CA]">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </motion.div>}
                      {podeEditarPaciente && onChangeStatus && <motion.div whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
                        <Button variant="ghost" size="icon" onClick={() => onChangeStatus(paciente)} title={paciente.ativo === false ? 'Reativar paciente' : 'Inativar paciente'} aria-label={`${paciente.ativo === false ? 'Reativar' : 'Inativar'} ${paciente.nome}`} className="h-11 w-11 rounded-full hover:bg-[#1080CA]/10 hover:text-[#1080CA]">
                          <Power className="h-4 w-4" />
                        </Button>
                      </motion.div>}
                      {podeExcluirPaciente && (
                        <motion.div whileHover={{ scale: 1.15, rotate: 5 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
                          <Button variant="ghost" size="icon" onClick={() => onDelete(paciente)} title="Excluir ficha vazia" aria-label={`Excluir ${paciente.nome}`} className="h-11 w-11 rounded-full hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </motion.div>
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
