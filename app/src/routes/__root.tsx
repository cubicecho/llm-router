import { useQueryClient } from '@tanstack/react-query';
import { createLink, createRootRoute, Outlet, useLocation } from '@tanstack/react-router';
import { LayersIcon, ServerIcon } from 'lucide-react';
import { ActionButton } from '@/components/action-button';
import { TokenForm } from '@/components/domain/auth/token-form';
import { AppLayout } from '@/components/layouts/app-layout';
import { BarNavItem, SidebarNavItem } from '@/components/sidebar';
import { Lock, Settings } from '@/components/ui/icons';
import { useThemePreference } from '@/components/ui/theme-preference';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { lock, unlock, useNeedsAuth } from '@/lib/auth';
import { formatCount, joinStats } from '@/lib/format';
import { useRouterStatus } from '@/lib/queries';

/** The root route: the app frame, or the token screen, around every page. */
export const Route = createRootRoute({
  component: RootComponent,
});

/** The places of the app, in the order the navigation lists them. */
const NAV_ITEMS = [
  { to: '/', label: 'Providers', icon: ServerIcon },
  { to: '/workspaces', label: 'Workspaces', icon: LayersIcon },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

/** A sidebar item that navigates like a router link. */
const SidebarLink = createLink(SidebarNavItem);
/** A bar item that navigates like a router link. */
const BarLink = createLink(BarNavItem);

/**
 * The root of every screen: the token screen while the router wants a token, else the app frame, with the tooltip and
 * toast providers around it.
 */
function RootComponent() {
  // Applies the stored theme on every screen and keeps System in step with the device.
  useThemePreference();
  const needsAuth = useNeedsAuth();
  const queryClient = useQueryClient();

  // Any API call that comes back 401 swaps the app for the token screen; a token brings it back and refetches.
  const unlockAndRefetch = (token: string) => {
    unlock(token);
    queryClient.invalidateQueries();
  };

  return (
    <TooltipProvider>
      <ToastProvider>{needsAuth ? <TokenForm onUnlock={unlockAndRefetch} /> : <AppFrame />}</ToastProvider>
    </TooltipProvider>
  );
}

/**
 * The signed-in app: the layout with its navigation, the provider and workspace counts, the lock button and the page.
 *
 * @remarks
 * The lock button is offered only when the router reports auth as enabled.
 */
function AppFrame() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { data } = useRouterStatus();
  const status = data
    ? joinStats(formatCount(data.providerCount, 'provider'), formatCount(data.workspaceCount, 'workspace'))
    : undefined;
  // Providers owns "/" and the detail pages under /providers; every other place owns the paths under it.
  const isActive = (to: string) =>
    to === '/'
      ? pathname === '/' || pathname.startsWith('/providers/')
      : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <AppLayout
      sidebarNavSlot={NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <SidebarLink key={to} to={to} label={label} iconSlot={<Icon />} active={isActive(to)} />
      ))}
      barNavSlot={NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <BarLink key={to} to={to} label={label} iconSlot={<Icon />} active={isActive(to)} />
      ))}
      status={status}
      actionSlot={
        data?.authEnabled === true && (
          <ActionButton
            variant="ghost"
            size="icon-sm"
            label="Lock (forget the stored token)"
            hint="Lock — forget the stored token"
            // For shared machines: the token is forgotten and the token screen comes back.
            onClick={lock}
            iconSlot={<Lock />}
          />
        )
      }
      contentSlot={<Outlet />}
    />
  );
}
