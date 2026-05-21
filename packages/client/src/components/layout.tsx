import { Link, Outlet, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { path: '/grocery', label: 'Grocery', icon: 'ShoppingCart' },
  { path: '/receipts', label: 'Receipts', icon: 'Receipt' },
  { path: '/storage', label: 'Storage', icon: 'Package' },
  { path: '/recipes', label: 'Recipes', icon: 'ChefHat' },
  { path: '/intake', label: 'Intake', icon: 'Utensils' },
  { path: '/finance', label: 'Finance', icon: 'DollarSign' },
  { path: '/payment-methods', label: 'Payment', icon: 'CreditCard' },
  { path: '/chains', label: 'Chains', icon: 'Store' },
  { path: '/household', label: 'Household', icon: 'Users' },
];

export function Layout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top navbar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center px-4 max-w-7xl mx-auto">
          <Link to="/dashboard" className="font-bold text-lg mr-8">
            PersonalBudget
          </Link>
          <nav className="hidden md:flex gap-1 flex-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'px-3 py-2 text-sm rounded-md transition-colors',
                  location.pathname.startsWith(item.path)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user.name}</span>
            <button
              onClick={logout}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background">
        <div className="flex justify-around py-2">
          {navItems.slice(0, 5).map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center py-1 px-2 text-xs transition-colors',
                location.pathname.startsWith(item.path)
                  ? 'text-primary'
                  : 'text-muted-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto p-4 pb-20 md:pb-4">
        <Outlet />
      </main>
    </div>
  );
}
