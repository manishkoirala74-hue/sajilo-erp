import { Bell, Search, ChevronDown, LogOut, User } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useDateFormat } from '@/lib/DateFormatContext';
import { sajilo } from '@/api/sajiloClient';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { CompanySwitcher } from '@/components/CompanySwitcher';

export default function Topbar({ pageTitle }) {
  const { user, logout } = useAuth();
  const { dateFormat, toggleDateFormat } = useDateFormat();

  return (
    <header className="h-16 bg-white border-b border-border flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-foreground">{pageTitle}</h1>
      </div>

      <div className="flex items-center gap-3">
        <CompanySwitcher />
        {/* Search */}
        <div className="hidden md:flex items-center gap-2 bg-muted rounded-lg px-3 py-2 w-56">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Quick search..."
            className="bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground w-full"
          />
        </div>

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