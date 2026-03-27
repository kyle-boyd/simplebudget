import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 bg-background border-b flex items-center px-4">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
          </SheetContent>
        </Sheet>
        <img src="/logo.svg" alt="Logo" className="h-[20px] ml-4" />
      </div>

      {/* Main Content */}
      <main className="flex-1 px-4 lg:px-6 pb-6 pt-16 lg:pt-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}

