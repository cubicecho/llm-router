import { Badge } from '@/components/ui/badge';

interface EnabledBadgeProps {
  /** Whether the provider or workspace is on. */
  enabled: boolean;
}

/** Says on a row whether a provider or a workspace is enabled. */
export function EnabledBadge({ enabled }: EnabledBadgeProps) {
  return enabled ? <Badge variant="positive">enabled</Badge> : <Badge variant="secondary">disabled</Badge>;
}
