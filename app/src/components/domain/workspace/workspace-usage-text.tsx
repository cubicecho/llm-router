import { UsageText } from '@/components/domain/usage/usage-text';
import { useUsage } from '@/lib/queries';

interface WorkspaceUsageTextProps {
  /** The workspace's slug. */
  slug: string;
}

/** What has gone through a workspace's endpoint so far, on its row. Nothing for one never called, or while unknown. */
export function WorkspaceUsageText({ slug }: WorkspaceUsageTextProps) {
  const { data } = useUsage();
  const usage = data?.workspaces.find((entry) => entry.workspace === slug);

  if (usage === undefined) {
    return null;
  }
  return <UsageText usage={usage} />;
}
