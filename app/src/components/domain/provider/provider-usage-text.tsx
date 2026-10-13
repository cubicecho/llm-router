import { useScopeUsage } from '@/components/domain/usage/scope-usage';
import { UsageText } from '@/components/domain/usage/usage-text';

interface ProviderUsageTextProps {
  /** The provider's name. */
  name: string;
}

/** What a provider has been asked for so far, on its row. Nothing for one that has not been called, or while unknown. */
export function ProviderUsageText({ name }: ProviderUsageTextProps) {
  const { usage } = useScopeUsage({ kind: 'provider', id: name });

  if (usage === undefined) {
    return null;
  }
  return <UsageText usage={usage.totals} />;
}
