import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const CAMPAIGN_KEY = 'elolab-maintenance-v2-2026-10-07';
const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

function isAnnouncementActive(now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = `${values.year}-${values.month}-${values.day}`;
  const hour = Number(values.hour);

  return date === '2026-10-07' || (date === '2026-10-08' && hour < 6);
}

export function MaintenanceAnnouncement() {
  const { user, isLoading } = useSupabaseAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    setOpen(false);
    if (!user || !isAnnouncementActive(new Date())) return;

    const storageKey = `${CAMPAIGN_KEY}:${user.id}`;
    try {
      if (window.localStorage.getItem(storageKey)) return;
      // Persist when shown so a refresh or a new session does not repeat it.
      window.localStorage.setItem(storageKey, 'shown');
    } catch {
      // Keep the notice usable if browser storage is unavailable.
    }
    setOpen(true);

    // 06:00 em São Paulo corresponde a 09:00 UTC nesta data.
    const expiresAt = Date.UTC(2026, 9, 8, 9, 0, 0);
    const timeout = window.setTimeout(() => setOpen(false), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [isLoading, user]);

  if (!open) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarClock className="h-5 w-5" aria-hidden="true" />
          </div>
          <AlertDialogTitle>Atualização programada</AlertDialogTitle>
          <AlertDialogDescription className="text-left leading-relaxed">
            O EloLab será atualizado para a versão 2.0 hoje, 7 de outubro, às 18h, até amanhã, 8 de outubro, às 6h.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => setOpen(false)}>Entendi</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
