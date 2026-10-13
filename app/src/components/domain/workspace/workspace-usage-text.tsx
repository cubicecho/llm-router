import { useScopeUsage } from '@/components/domain/usage/scope-usage';
import { UsageText } from '@/components/domain/usage/usage-text';

interface WorkspaceUsageTextProps {
  /** The workspace's slug. */
  slug: string;
}

/** What has gone through a workspace's endpoint so far, on its row. Nothing for one never called, or while unknown. */
export function WorkspaceUsageText({ slug }: WorkspaceUsageTextProps) {
  const { usage } = useScopeUsage({ kind: 'workspace', id: slug });

  if (usage === undefined) {
    return null;
  }
  return <UsageText usage={usage.totals} />;
}
