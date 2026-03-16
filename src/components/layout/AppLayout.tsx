import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, FilePlus, LogOut, Menu, X, Shield, 
  User, ChevronDown 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import logo from '@/assets/logo.jpg';

const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'New Case', path: '/new-case', icon: FilePlus },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 border-b bg-card flex items-center justify-between px-4 lg:px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <button 
            className="lg:hidden p-1.5 rounded-md hover:bg-muted" 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link to="/dashboard" className="flex items-center gap-2">
            <img src={logo} alt="Myeloma GeneSight" className="h-8 w-auto" />
            <div className="hidden sm:block">
              <span className="font-semibold text-sm tracking-tight">Myeloma</span>
              <span className="font-semibold text-sm tracking-tight text-primary ml-0.5">GeneSight</span>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1 ml-6">
            {navItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    active 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/10 text-accent text-xs font-medium">
            <Shield className="h-3 w-3" />
            Clinical Decision Support
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="hidden md:inline text-sm truncate max-w-[150px]">
                  {user?.email || 'User'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="text-xs text-muted-foreground" disabled>
                {user?.email}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="lg:hidden border-b bg-card px-4 py-2 z-40">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}

      <main className="flex-1 overflow-auto">{children}</main>

      <footer className="border-t bg-card px-4 py-2 text-center">
        <p className="text-[10px] text-muted-foreground max-w-3xl mx-auto">
          For clinical decision support only. Not a diagnostic device. All findings require physician review.
        </p>
      </footer>
    </div>
  );
}
