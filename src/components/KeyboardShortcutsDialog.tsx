import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Keyboard } from 'lucide-react';
import { useShortcutsList, getShortcutsByCategory, formatShortcut } from '@/hooks/useKeyboardShortcuts';

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);
  const shortcuts = useShortcutsList();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const isQuestion = event.key === '?' && event.shiftKey;
      const isSlash = event.key === '/' && (event.ctrlKey || event.metaKey);
      if (isQuestion || isSlash) {
        event.preventDefault();
        setOpen((prev) => !prev);
      } else if (event.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const categories = getShortcutsByCategory(shortcuts);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            Atalhos de Teclado
          </DialogTitle>
          <DialogDescription>
            Use estes atalhos para navegar mais rápido. Pressione <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded">Shift + ?</kbd> ou <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded">Ctrl + /</kbd> a qualquer momento para abrir esta janela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {Object.entries(categories).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {category}
              </h3>
              <div className="space-y-1">
                {items.map((shortcut) => (
                  <div
                    key={`${shortcut.category}-${shortcut.key}-${shortcut.description}`}
                    className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/40 transition-colors"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <kbd className="px-2 py-1 text-xs font-mono bg-muted border border-border rounded shadow-sm">
                      {formatShortcut(shortcut)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Geral
            </h3>
            <div className="space-y-1">
              <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/40">
                <span className="text-sm">Abrir esta janela de atalhos</span>
                <kbd className="px-2 py-1 text-xs font-mono bg-muted border border-border rounded shadow-sm">
                  Shift + ?
                </kbd>
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/40">
                <span className="text-sm">Fechar diálogos</span>
                <kbd className="px-2 py-1 text-xs font-mono bg-muted border border-border rounded shadow-sm">
                  Esc
                </kbd>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
