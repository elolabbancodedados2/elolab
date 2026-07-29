import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Filter, RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  getAuditLog, 
  AuditEntry,
  COLLECTION_LABELS,
  ACTION_LABELS 
} from '@/lib/auditTrail';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { exportAuditEntriesAsCsv, exportAuditEntriesAsJson } from '@/lib/auditExport';

const ACTION_COLORS = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
};

export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filterCollection, setFilterCollection] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [filterUser, setFilterUser] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const loadEntries = async () => {
    setLoading(true);
    const filters: any = {};
    if (filterCollection !== 'all') filters.collection = filterCollection;
    if (filterAction !== 'all') filters.action = filterAction;
    if (filterStartDate) filters.startDate = new Date(`${filterStartDate}T00:00:00`).toISOString();
    if (filterEndDate) filters.endDate = new Date(`${filterEndDate}T23:59:59.999`).toISOString();

    const data = await getAuditLog(filters);
    setEntries(data);
    setLoading(false);
  };

  useEffect(() => {
    loadEntries();
  }, [filterCollection, filterAction, filterStartDate, filterEndDate]);

  const filteredEntries = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    const u = filterUser.trim().toLowerCase();

    return entries.filter((e) => {
      if (u) {
        const userHay = `${e.userName ?? ''} ${e.userId ?? ''}`.toLowerCase();
        if (!userHay.includes(u)) return false;
      }

      if (q) {
        const changesHay = (e.changes || [])
          .map((c) => `${c.field} ${String(c.oldValue ?? '')} ${String(c.newValue ?? '')}`)
          .join(' ')
          .toLowerCase();
        const hay = `${e.recordName ?? ''} ${e.collection} ${changesHay}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [entries, filterSearch, filterUser]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Alterações
            </CardTitle>
            <CardDescription>
              {filteredEntries.length} registro(s) encontrado(s) — dados persistidos no servidor
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadEntries} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportAuditEntriesAsCsv(filteredEntries, 'audit_log.csv')}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportAuditEntriesAsJson(filteredEntries, 'audit_log.json')}>
              <Download className="h-4 w-4 mr-1" /> JSON
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
          <Select value={filterCollection} onValueChange={setFilterCollection}>
            <SelectTrigger><SelectValue placeholder="Coleção" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(COLLECTION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger><SelectValue placeholder="Ação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} placeholder="De" />
          <Input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} placeholder="Até" />
          <Input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Buscar..." />
          <Input value={filterUser} onChange={(e) => setFilterUser(e.target.value)} placeholder="Usuário..." />
        </div>

        {/* Entries */}
        <ScrollArea className="h-[500px]">
          <AnimatePresence mode="popLayout">
            {filteredEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {loading ? 'Carregando registros...' : 'Nenhum registro encontrado neste período'}
              </div>
            ) : (
              filteredEntries.map((entry) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="border-b py-3 px-2"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge className={cn('text-xs', ACTION_COLORS[entry.action] || '')}>
                        {ACTION_LABELS[entry.action] || entry.action}
                      </Badge>
                      <span className="text-sm font-medium">
                        {COLLECTION_LABELS[entry.collection] || entry.collection}
                      </span>
                      {entry.recordName && (
                        <span className="text-sm text-muted-foreground">— {entry.recordName}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {entry.timestamp ? format(parseISO(entry.timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR }) : ''}
                    </span>
                  </div>
                  {entry.userName && (
                    <p className="text-xs text-muted-foreground mb-1">Por: {entry.userName}</p>
                  )}
                  {entry.changes && entry.changes.length > 0 && (
                    <div className="text-xs space-y-0.5 mt-1">
                      {entry.changes.slice(0, 5).map((c, i) => (
                        <div key={i} className="text-muted-foreground">
                          <span className="font-medium">{c.field}:</span>{' '}
                          <span className="line-through opacity-60">{String(c.oldValue ?? '—')}</span>
                          {' → '}
                          <span>{String(c.newValue ?? '—')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
