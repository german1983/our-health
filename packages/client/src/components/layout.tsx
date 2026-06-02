import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, Navigate } from 'react-router-dom';
import {
  Apple,
  BookOpen,
  CalendarDays,
  CreditCard,
  Home,
  LogOut,
  Menu,
  Receipt,
  Refrigerator,
  Sparkles,
  Store,
  Tags,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Tint when active — matches the section accent. */
  section: 'home' | 'fitness' | 'finance' | 'admin';
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: Home, section: 'home' },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays, section: 'home' },
  // Fitness module — food in, food cooked, food eaten.
  { path: '/intake', label: 'Intake', icon: Apple, section: 'fitness' },
  { path: '/recipes', label: 'Recipes', icon: BookOpen, section: 'fitness' },
  { path: '/storage', label: 'Storage', icon: Refrigerator, section: 'fitness' },
  { path: '/products', label: 'Products', icon: Tags, section: 'fitness' },
  // Finance module — money flow.
  { path: '/finance', label: 'Finance', icon: Wallet, section: 'finance' },
  { path: '/receipts', label: 'Receipts', icon: Receipt, section: 'finance' },
  { path: '/payment-methods', label: 'Payments', icon: CreditCard, section: 'finance' },
  { path: '/chains', label: 'Chains', icon: Store, section: 'finance' },
  // Admin / settings.
  { path: '/household', label: 'Household', icon: Users, section: 'admin' },
];

/** Mobile bottom tabs — keep to the 4 most-used; everything else lives in More. */
const BOTTOM_TABS: NavItem[] = [
  navItems.find((i) => i.path === '/intake')!,
  navItems.find((i) => i.path === '/recipes')!,
  navItems.find((i) => i.path === '/storage')!,
  navItems.find((i) => i.path === '/finance')!,
];

const SECTION_LABEL: Record<NavItem['section'], string> = {
  home: 'Home',
  fitness: 'Fitness',
  finance: 'Finance',
  admin: 'Admin',
};

function isActive(pathname: string, target: string): boolean {
  return pathname === target || pathname.startsWith(target + '/');
}

export function Layout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the More drawer on any route change.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  const sections: NavItem['section'][] = ['fitness', 'finance', 'admin'];
  const itemsBySection: Record<NavItem['section'], NavItem[]> = {
    home: navItems.filter((i) => i.section === 'home'),
    fitness: navItems.filter((i) => i.section === 'fitness'),
    finance: navItems.filter((i) => i.section === 'finance'),
    admin: navItems.filter((i) => i.section === 'admin'),
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ====== Top header ====== */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex h-14 items-center px-3 sm:px-4 gap-2 max-w-7xl mx-auto">
          <Link to="/dashboard" className="flex items-center gap-2 mr-2 sm:mr-4">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="font-semibold tracking-tight">Personal Budget</span>
          </Link>

          {/* Desktop grouped nav */}
          <nav className="hidden md:flex items-center gap-5 flex-1">
            <div className="flex items-center gap-1">
              {itemsBySection.home.map((item) => (
                <NavLink key={item.path} item={item} location={location} />
              ))}
            </div>
            {sections.map((sec) => (
              <SectionGroup key={sec} label={SECTION_LABEL[sec]} section={sec} items={itemsBySection[sec]} location={location} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <span className="text-sm text-muted-foreground hidden lg:inline truncate max-w-[10rem]">
              {user.name}
            </span>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground rounded-md px-2 py-1"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* ====== Main ====== */}
      <main className="max-w-7xl mx-auto p-3 sm:p-4 pb-24 md:pb-6">
        <Outlet />
      </main>

      {/* ====== Mobile bottom tab bar ====== */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur safe-bottom"
        aria-label="Primary"
      >
        <div className="grid grid-cols-5">
          {BOTTOM_TABS.map((item) => (
            <BottomTab key={item.path} item={item} active={isActive(location.pathname, item.path)} />
          ))}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={cn(
              'flex flex-col items-center justify-center py-2 text-[11px] transition-colors',
              drawerOpen ? 'text-primary' : 'text-muted-foreground',
            )}
            aria-label="Open more menu"
          >
            <Menu className="h-5 w-5 mb-0.5" />
            More
          </button>
        </div>
      </nav>

      {/* ====== Mobile More drawer ====== */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex items-end"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative w-full rounded-t-2xl bg-card border-t border-border safe-bottom shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-medium">Menu</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-4 py-3 space-y-5 max-h-[70vh] overflow-y-auto">
              <DrawerGroup
                label="Home"
                section="home"
                items={itemsBySection.home}
                location={location}
              />
              <DrawerGroup
                label={SECTION_LABEL.fitness}
                section="fitness"
                items={itemsBySection.fitness}
                location={location}
              />
              <DrawerGroup
                label={SECTION_LABEL.finance}
                section="finance"
                items={itemsBySection.finance}
                location={location}
              />
              <DrawerGroup
                label={SECTION_LABEL.admin}
                section="admin"
                items={itemsBySection.admin}
                location={location}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ====== Sub-components ======

function NavLink({ item, location }: { item: NavItem; location: ReturnType<typeof useLocation> }) {
  const Icon = item.icon;
  const active = isActive(location.pathname, item.path);
  return (
    <Link
      to={item.path}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

function SectionGroup({
  label,
  section,
  items,
  location,
}: {
  label: string;
  section: NavItem['section'];
  items: NavItem[];
  location: ReturnType<typeof useLocation>;
}) {
  const isFitness = section === 'fitness';
  const isFinance = section === 'finance';
  const sectionDot = isFitness ? 'bg-fitness' : isFinance ? 'bg-finance' : 'bg-muted-foreground';
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="hidden xl:inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 mr-1"
        title={label}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', sectionDot)} />
        {label}
      </span>
      {items.map((item) => (
        <NavLink key={item.path} item={item} location={location} />
      ))}
    </div>
  );
}

function BottomTab({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      className={cn(
        'flex flex-col items-center justify-center py-2 text-[11px] transition-colors',
        active ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <Icon className={cn('h-5 w-5 mb-0.5', active && 'stroke-[2.25]')} />
      {item.label}
    </Link>
  );
}

function DrawerGroup({
  label,
  section,
  items,
  location,
}: {
  label: string;
  section: NavItem['section'];
  items: NavItem[];
  location: ReturnType<typeof useLocation>;
}) {
  const sectionDot =
    section === 'fitness'
      ? 'bg-fitness'
      : section === 'finance'
        ? 'bg-finance'
        : 'bg-muted-foreground';
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground/80">
        <span className={cn('h-1.5 w-1.5 rounded-full', sectionDot)} />
        {label}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(location.pathname, item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border text-sm transition-colors',
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card hover:bg-muted/60',
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
