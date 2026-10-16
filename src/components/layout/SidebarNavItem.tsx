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
  groupColor?: string;
  onNavigate?: () => void;
}

export function SidebarNavItem({ item, collapsed, groupColor, onNavigate }: SidebarNavItemProps) {
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
          'group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150',
          'text-[#171717]/80 hover:text-[#171717] hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]/50 focus-visible:ring-offset-1',
          itemIsActive && !item.external && 'font-semibold',
          collapsed && 'justify-center px-2',
          !collapsed && 'ml-1'
        );
      }}
      style={({ isActive: routeIsActive }) => {
        const isActive = isItemActive(routeIsActive);
        if (!isActive || item.external) return {};
        const color = groupColor ?? '#1080CA';
        return {
          backgroundColor: `${color}14`,
          color: color,
        };
      }}
    >
      {({ isActive: routeIsActive }) => {
        const isActive = isItemActive(routeIsActive);
        return (
        <>
          {/* Icon with hover glow */}
          <motion.div
            aria-hidden="true"
            tabIndex={-1}
            whileHover={{ scale: 1.15, rotate: isActive ? 0 : 6 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200"
            style={isActive && !item.external ? { backgroundColor: `${groupColor ?? '#1080CA'}22` } : undefined}
          >
            <Icon className="h-[17px] w-[17px] shrink-0 transition-colors duration-200" />
          </motion.div>

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
                    ? 'min-w-[18px] text-white ring-transparent'
                    : 'min-w-[18px] bg-[#171717] text-white ring-transparent'
                  : 'bg-black/[0.04] text-[#171717]/70 ring-black/[0.08] uppercase tracking-wide'
              )}
              style={isActive && typeof item.badge === 'number' ? { backgroundColor: groupColor ?? '#1080CA' } : undefined}
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
              <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-black/5 px-1 text-[9px] font-bold text-[#171717]">
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
