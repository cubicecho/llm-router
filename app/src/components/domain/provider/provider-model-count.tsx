import type { ProviderStatus } from '@llm-router/shared';
import { Badge } from '@/components/ui/badge';
import { formatCount } from '@/lib/format';
import { useProviderModels } from '@/lib/queries';
import { apiErrorMessage } from '@/lib/toast';

interface ProviderModelCountProps {
  /** The provider to count the models of. A disabled one is not asked and shows nothing. */
  provider: ProviderStatus;
}

/** How many models a provider lists right now, which doubles as proof that its URL and key work. */
export function ProviderModelCount({ provider }: ProviderModelCountProps) {
  const listing = useProviderModels(provider.name, { enabled: provider.enabled });

  if (provider.enabled === false) {
    return null;
  }
  if (listing.isPending) {
    return (
      <span role="status" className="text-foreground/60 text-xs">
        Checking models…
      </span>
    );
  }
  // The router answers 200 with the provider under `skipped` when the provider itself could not be listed.
  if (listing.isError) {
    return (
      <Badge variant="destructive" title={apiErrorMessage(listing.error)}>
        listing failed
      </Badge>
    );
  }
  const failure = listing.data.skipped[0]?.error;
  if (failure !== undefined) {
    return (
      <Badge variant="destructive" title={failure}>
        listing failed
      </Badge>
    );
  }
  return <Badge variant="outline">{formatCount(listing.data.models.length, 'model')}</Badge>;
}
