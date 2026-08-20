import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Sidebar } from './Sidebar';
import { RodapeLegal } from './RodapeLegal';
import { Navbar } from './Navbar';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { SkipLink } from '@/components/ui/skip-link';
import { RouteAccessibility } from '@/components/RouteAccessibility';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useRealtimePushNotifications } from '@/hooks/useRealtimePushNotifications';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { usePersonalPreferences } from '@/hooks/usePersonalPreferences';

export function MainLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  useSessionTimeout();
  useRealtimeSubscription();
  useRealtimePushNotifications();
  usePersonalPreferences();

  return (
    <div className="flex h-[100dvh] min-h-[100svh] overflow-hidden bg-background">
      <SkipLink targetId="main-content" />
      <RouteAccessibility />

      {/* Desktop Sidebar */}
      <nav className="hidden md:block" aria-label="Menu principal">
        <Sidebar />
      </nav>

      {/* Mobile Sidebar */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[min(86vw,320px)] border-r-0 p-0 pt-[env(safe-area-inset-top)]">
          <SheetTitle className="sr-only">Menu principal</SheetTitle>
          <SheetDescription className="sr-only">
            Navegue entre os módulos da clínica.
          </SheetDescription>
          <nav aria-label="Menu principal mobile">
            <Sidebar />
          </nav>
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar onMenuClick={() => setMobileMenuOpen(true)} />
        <ImpersonationBanner />
        <main 
          id="main-content" 
          className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain scroll-pt-20"
          role="main"
          tabIndex={-1}
        >
          <div className="container mx-auto max-w-7xl px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:p-4 md:p-6 lg:p-8">
            <Breadcrumbs />
            <div className="animate-fade-in">
              {/* Barreira POR TELA. Havia só um ErrorBoundary no topo do App,
                  envolvendo tudo: um registro com campo inesperado em Analytics
                  derrubava também a agenda, a fila e o caixa, e o usuário via a
                  tela de erro no lugar do sistema inteiro. Isso transformava
                  cada bug pequeno em "o sistema caiu".

                  A `key` pelo pathname remonta a barreira ao navegar: sem ela,
                  a tela de erro ficaria grudada mesmo depois de trocar de
                  módulo pelo menu, que continua funcionando. */}
              <ErrorBoundary key={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            </div>
            <RodapeLegal />
          </div>
        </main>
      </div>

      <ChatPanel />
      <OfflineIndicator />
    </div>
  );
}
