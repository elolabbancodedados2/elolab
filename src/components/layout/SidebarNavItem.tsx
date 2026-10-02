import { NavLink } from 'react-router-dom';
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

  const linkContent = (
    <NavLink
      to={item.href}
      end={item.exact}
      target={item.external ? '_blank' : undefined}
      rel={item.external ? 'noopener noreferrer' : undefined}
      onClick={onNavigate}
      style={({ isActive }: { isActive: boolean }) =>
        isActive && !item.external && groupColor
          ? { backgroundColor: `${groupColor}12`, '--active-color': groupColor } as React.CSSProperties
          : undefined
      }
      className={({ isActive }) =>
        cn(
          'group relative flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150',
          'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
          isActive && !item.external && 'font-semibold text-sidebar-foreground shadow-sm ring-1 ring-black/[0.04]',
          collapsed && 'justify-center px-2',
          !collapsed && 'ml-1'
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Active indicator — animated bar */}
          {isActive && !item.external && !collapsed && (
            <motion.div
              layoutId="sidebar-active-indicator"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
              style={{ backgroundColor: groupColor || 'hsl(var(--sidebar-primary))' }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            />
          )}

          {/* Icon with hover glow */}
          <motion.div
            whileHover={{ scale: 1.15, rotate: isActive ? 0 : 6 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className={cn(
              'flex items-center justify-center shrink-0 rounded-lg transition-all duration-200',
              isActive && !item.external
                ? 'h-7 w-7 shadow-sm'
                : 'h-7 w-7'
            )}
            style={
              isActive && !item.external && groupColor
                ? { backgroundColor: `${groupColor}18` }
                : undefined
            }
          >
            <Icon
              className="h-[15px] w-[15px] shrink-0 transition-colors duration-200"
              style={{
                color: isActive && !item.external
                  ? groupColor || 'hsl(var(--sidebar-primary))'
                  : groupColor
                    ? `${groupColor}80`
                    : undefined,
              }}
            />
          </motion.div>

          {/* Label */}
          {!collapsed && (
            <span
              className="truncate flex-1 transition-colors duration-200"
              style={isActive && !item.external && groupColor ? { color: groupColor } : undefined}
            >
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
                'ml-auto flex h-[18px] items-center justify-center rounded-full px-1.5 text-[9px] font-bold tabular-nums ring-1',
                typeof item.badge === 'number'
                  ? 'min-w-[18px] bg-primary/15 text-primary ring-primary/10'
                  : 'bg-muted text-muted-foreground ring-border uppercase tracking-wide'
              )}
            >
              {item.badge}
            </motion.span>
          )}

          {/* Hover shine effect */}
        </>
      )}
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
              <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-primary/10 px-1 text-[9px] font-bold text-primary">
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
