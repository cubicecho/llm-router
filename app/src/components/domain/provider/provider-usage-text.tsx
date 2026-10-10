import { UsageText } from '@/components/domain/usage/usage-text';
import { useUsage } from '@/lib/queries';

interface ProviderUsageTextProps {
  /** The provider's name. */
  name: string;
}

/** What a provider has been asked for so far, on its row. Nothing for one that has not been called, or while unknown. */
export function ProviderUsageText({ name }: ProviderUsageTextProps) {
  const { data } = useUsage();
  const usage = data?.providers.find((entry) => entry.provider === name);

  if (usage === undefined) {
    return null;
  }
  return <UsageText usage={usage} />;
}
