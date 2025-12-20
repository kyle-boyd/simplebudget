import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  Sidebar as SidebarComponent,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarItem,
} from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, Wallet, LogOut } from 'lucide-react';

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const location = useLocation();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNavigation = () => {
    if (onNavigate) {
      onNavigate();
    }
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <SidebarComponent className="fixed left-0 top-0 h-screen lg:static lg:h-screen">
      <SidebarHeader>
        <img src="/logo.svg" alt="Logo" className="h-[20px]" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarItem
          asChild
          variant={isActive('/dashboard') ? 'active' : 'default'}
        >
          <Link to="/dashboard" onClick={handleNavigation}>
            <LayoutDashboard className="h-5 w-5" />
            Dashboard
          </Link>
        </SidebarItem>
        <SidebarItem
          asChild
          variant={isActive('/transactions') ? 'active' : 'default'}
        >
          <Link to="/transactions" onClick={handleNavigation}>
            <Receipt className="h-5 w-5" />
            Transactions
          </Link>
        </SidebarItem>
        <SidebarItem
          asChild
          variant={isActive('/budget') ? 'active' : 'default'}
        >
          <Link to="/budget" onClick={handleNavigation}>
            <Wallet className="h-5 w-5" />
            Budget
          </Link>
        </SidebarItem>
      </SidebarContent>
      <SidebarFooter>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start gap-3"
        >
          <LogOut className="h-5 w-5" />
          Log Out
        </Button>
      </SidebarFooter>
    </SidebarComponent>
  );
}

