import { Bell, ChevronDown, LogOut, User, Menu } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useDateFormat } from '@/lib/DateFormatContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { CompanySwitcher } from '@/components/CompanySwitcher';
import GlobalSearch from './GlobalSearch';

export default function Topbar({ pageTitle, onMenuClick }) {
  const { user, logout } = useAuth();
  const { dateFormat, toggleDateFormat } = useDateFormat();

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-3 md:gap-4">
        <button onClick={onMenuClick} className="md:hidden p-2 -ml-2 text-muted-foreground hover:bg-muted rounded-full touch-target">
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-foreground truncate max-w-[150px] md:max-w-none">{pageTitle}</h1>
      </div>

      <div className="flex items-center gap-3">
        <CompanySwitcher />
        
        {/* Search */}
        <GlobalSearch />

        {/* AD/BS Date Toggle */}
        <button
          onClick={toggleDateFormat}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-input bg-muted/50 hover:bg-muted text-xs font-bold transition-colors"
          title="Toggle date format between AD and BS"
        >
          <span className={dateFormat === 'AD' ? 'text-primary' : 'text-muted-foreground'}>AD</span>
          <span className="text-muted-foreground">/</span>
          <span className={dateFormat === 'BS' ? 'text-primary' : 'text-muted-foreground'}>BS</span>
        </button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4 h-4" />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 hover:bg-muted rounded-lg px-3 py-2 transition-colors">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center overflow-hidden">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-xs font-bold">
                    {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                )}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-foreground leading-none">{user?.full_name || 'User'}</p>
                <p className="text-xs text-muted-foreground mt-0.5 capitalize">{user?.job_title || user?.role || 'user'}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => window.location.href = "/profile"}>
              <User className="w-4 h-4 mr-2" /> Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => logout()}
            >
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}