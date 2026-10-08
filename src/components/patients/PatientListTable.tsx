import { memo } from 'react';
import { motion } from 'framer-motion';
import { Eye, Edit, Trash2, Link, Phone, Mail, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PatientPhoto, AllergyAlert } from '@/components/clinical';

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
  onView: (paciente: any) => void;
  onEdit: (paciente: any) => void;
  onDelete: (paciente: any) => void;
  podeExcluirPaciente?: boolean;
  onGeneratePortalLink: (id: string, nome: string) => void;
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
  pacientes, totalPacientes, totalPacientesCarregado, hasFiltrosAtivos = false, onLimparFiltros, onView, onEdit, onDelete, onGeneratePortalLink,
  podeGerarLinkPortal = true, podeExcluirPaciente = false, getConvenioNome, calcularIdade,
  pagina, hasMore, isLoading = false, hasError = false, onPaginaChange,
}: PatientListTableProps) {
  const tamanhoPagina = 50;
  const paginaAtual = pagina;
  const pacientesVisiveis = pacientes;

  return (
    <div>
      <div className="divide-y sm:hidden">
        {isLoading ? <div className="px-4 py-12 text-center text-muted-foreground">Carregando pacientes…</div> : hasError ? <div className="px-4 py-12 text-center text-destructive">Não foi possível carregar esta página.</div> : pacientes.length === 0 ? (
          <div className="px-4 py-12 text-center text-muted-foreground">
            <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p>{!totalPacientesCarregado
              ? 'Verificando o cadastro de pacientes…'
              : totalPacientes === 0
                ? 'Ainda não há pacientes cadastrados'
                : totalPacientes === null
                  ? 'Não foi possível confirmar se há pacientes cadastrados. Atualize os indicadores e tente novamente.'
                  : 'Nenhum paciente corresponde à busca e aos filtros atuais'}</p>
            {hasFiltrosAtivos && totalPacientes !== 0 && <Button variant="link" onClick={onLimparFiltros} className="mt-2 h-11">Limpar busca e filtros</Button>}
          </div>
        ) : pacientesVisiveis.map((paciente) => {
          const idade = calcularIdade(paciente.data_nascimento);
          return (
            <article key={paciente.id} className="p-4">
              <button type="button" className="flex min-h-11 w-full items-start gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onView(paciente)}>
                <PatientPhoto pacienteId={paciente.id} pacienteNome={paciente.nome} currentPhotoUrl={paciente.foto_url} size="sm" editable={false} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{paciente.nome}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {paciente.data_nascimento && <span>{Number.isFinite(idade) && idade >= 0 ? `${idade} anos` : 'Nascimento inválido'}</span>}
                    <Badge variant="outline" className="max-w-full truncate text-[10px]">{getConvenioNome(paciente.convenio_id)}</Badge>
                  </span>
                  {paciente.telefone && <span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{paciente.telefone}</span>}
                </span>
                <Eye className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
              {paciente.alergias?.length > 0 && <AllergyAlert alergias={paciente.alergias} compact className="mt-2" />}
              <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                {podeGerarLinkPortal && (
                  <Button variant="outline" onClick={() => onGeneratePortalLink(paciente.id, paciente.nome)} className="h-11 min-w-0 flex-1 gap-1 px-2 text-xs" aria-label={`Gerar link do portal para ${paciente.nome}`}>
                    <Link className="h-4 w-4" /> Portal
                  </Button>
                )}
                <Button variant="outline" onClick={() => onEdit(paciente)} className="h-11 min-w-0 flex-1 gap-1 px-2 text-xs" aria-label={`Editar ${paciente.nome}`}>
                  <Edit className="h-4 w-4" /> Editar
                </Button>
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
      <div className="hidden overflow-x-auto sm:block">
      <Table>
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
              <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>{!totalPacientesCarregado
                  ? 'Verificando o cadastro de pacientes…'
                  : totalPacientes === 0
                    ? 'Ainda não há pacientes cadastrados'
                    : totalPacientes === null
                      ? 'Não foi possível confirmar se há pacientes cadastrados. Atualize os indicadores e tente novamente.'
                      : 'Nenhum paciente corresponde à busca e aos filtros atuais'}</p>
                {hasFiltrosAtivos && totalPacientes !== 0 && <Button variant="link" onClick={onLimparFiltros} className="mt-2 h-11">Limpar busca e filtros</Button>}
              </TableCell>
            </TableRow>
          ) : (
            pacientesVisiveis.map((paciente) => {
              const idade = calcularIdade(paciente.data_nascimento);
              return (
                <TableRow key={paciente.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onView(paciente)}>
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
                  <TableCell className="hidden md:table-cell text-sm">{paciente.cpf || '—'}</TableCell>
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
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="outline" className="text-xs">
                      {getConvenioNome(paciente.convenio_id)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm tabular-nums">
                      {paciente.data_nascimento
                        ? Number.isFinite(idade) && idade >= 0 ? `${idade} anos` : <span className="text-muted-foreground">Data inválida</span>
                        : <span className="text-muted-foreground">N/I</span>}
                    </span>
                  </TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      <motion.div whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
                        <Button variant="ghost" size="icon" onClick={() => onView(paciente)} title="Ver detalhes" aria-label={`Ver detalhes de ${paciente.nome}`} className="h-11 w-11 rounded-xl hover:bg-primary/10 hover:text-primary">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </motion.div>
                      {podeGerarLinkPortal && (
                        <motion.div whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
                          <Button variant="ghost" size="icon" onClick={() => onGeneratePortalLink(paciente.id, paciente.nome)} title="Link do portal" aria-label={`Gerar link do portal para ${paciente.nome}`} className="h-11 w-11 rounded-xl hover:bg-accent/60">
                            <Link className="h-4 w-4" />
                          </Button>
                        </motion.div>
                      )}
                      <motion.div whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
                        <Button variant="ghost" size="icon" onClick={() => onEdit(paciente)} title="Editar" aria-label={`Editar ${paciente.nome}`} className="h-11 w-11 rounded-xl hover:bg-accent/60">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </motion.div>
                      {podeExcluirPaciente && (
                        <motion.div whileHover={{ scale: 1.15, rotate: 5 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
                          <Button variant="ghost" size="icon" onClick={() => onDelete(paciente)} title="Excluir ficha vazia" aria-label={`Excluir ${paciente.nome}`} className="h-11 w-11 rounded-xl hover:bg-destructive/10">
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
              className="h-11 gap-1"
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
              className="h-11 gap-1"
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
