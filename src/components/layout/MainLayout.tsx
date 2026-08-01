import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { RodapeLegal } from './RodapeLegal';
import { Navbar } from './Navbar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SkipLink } from '@/components/ui/skip-link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useRealtimePushNotifications } from '@/hooks/useRealtimePushNotifications';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';

export function MainLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useSessionTimeout();
  useRealtimeSubscription();
  useRealtimePushNotifications();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SkipLink targetId="main-content" />

      {/* Desktop Sidebar */}
      <nav className="hidden md:block" aria-label="Menu principal">
        <Sidebar />
      </nav>

      {/* Mobile Sidebar */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="p-0 w-[260px] border-r-0">
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
          className="flex-1 overflow-auto overscroll-contain"
          role="main"
          tabIndex={-1}
        >
          <div className="container mx-auto p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl">
            <Breadcrumbs />
            <div className="animate-fade-in">
              <Outlet />
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
