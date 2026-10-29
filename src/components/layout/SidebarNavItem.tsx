import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MenuItem } from '@/config/sidebarMenu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SidebarNavItemProps {
  item: MenuItem;
  collapsed: boolean;
  onNavigate?: () => void;
}

export function SidebarNavItem({ item, collapsed, onNavigate }: SidebarNavItemProps) {
  const Icon = item.icon;
  const location = useLocation();
  const targetUrl = new URL(item.href, window.location.origin);
  const isItemActive = (routeIsActive: boolean) => targetUrl.search
    ? location.pathname === targetUrl.pathname && location.search === targetUrl.search
    : item.exact
      ? routeIsActive && location.search === targetUrl.search
      : routeIsActive;

  const linkContent = (
    <NavLink
      to={item.href}
      end={item.exact}
      aria-label={collapsed ? item.label : undefined}
      target={item.external ? '_blank' : undefined}
      rel={item.external ? 'noopener noreferrer' : undefined}
      onClick={onNavigate}
      className={({ isActive }) => {
        const itemIsActive = isItemActive(isActive);
        return cn(
          'group relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
          'text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar',
          itemIsActive && !item.external && 'font-semibold',
          itemIsActive && !item.external && 'bg-card text-sidebar-accent-foreground shadow-xs ring-1 ring-sidebar-border',
          collapsed && 'justify-center px-2',
          !collapsed && 'ml-1'
        );
      }}
    >
      {({ isActive: routeIsActive }) => {
        const isActive = isItemActive(routeIsActive);
        return (
        <>
          <div
            aria-hidden="true"
            tabIndex={-1}
            className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-150', isActive && !item.external && 'text-sidebar-primary')}
          >
            <Icon className="h-[17px] w-[17px] shrink-0 transition-colors duration-200" />
          </div>

          {/* Label */}
          {!collapsed && (
            <span className="truncate flex-1 transition-colors duration-200">
              {item.label}
            </span>
          )}

          {/* Badge — número (contador) ou texto curto (ex.: "Em breve") */}
          {!collapsed && item.badge != null && item.badge !== 0 && item.badge !== '' && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              className={cn(
                'ml-auto flex h-5 items-center justify-center rounded-full px-2 text-[10px] font-bold tabular-nums ring-1',
                typeof item.badge === 'number'
                  ? isActive
                    ? 'min-w-[18px] bg-sidebar-primary text-sidebar-primary-foreground ring-transparent'
                    : 'min-w-[18px] bg-sidebar-muted text-sidebar-foreground ring-transparent'
                  : 'bg-sidebar-muted text-sidebar-foreground/80 ring-sidebar-border uppercase tracking-wide'
              )}
            >
              {item.badge}
            </motion.span>
          )}

          {/* Hover shine effect */}
        </>
        );
      }}
    </NavLink>
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent
            side="right"
            className="flex items-center gap-2 font-medium text-xs"
          >
            {item.label}
            {item.badge != null && item.badge !== 0 && item.badge !== '' && (
              <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-sidebar-muted px-1 text-[9px] font-bold text-sidebar-foreground">
                {item.badge}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return linkContent;
}
