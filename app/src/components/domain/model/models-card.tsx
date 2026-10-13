import type { ModelsResponse } from '@llm-router/shared';
import { CardLayout } from '@/components/card-layout';
import { RowList, RowListItem } from '@/components/layouts/row-list';
import { ListItem } from '@/components/list-item';
import { EmptyState } from '@/components/page';
import { QueryState } from '@/components/query-state';
import { Alert } from '@/components/ui/alert';
import { CopyButton } from '@/components/ui/copy-button';
import { useToast } from '@/components/ui/toast';
import { formatCount } from '@/lib/format';
import { COPY_FAILED_MESSAGE } from '@/lib/toast';
import type { SlotNode } from '@/lib/utils';

/** What the card needs off a model-listing query. */
interface ModelsQuery {
  data?: ModelsResponse;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

interface ModelsCardProps {
  /** The model-listing query of a provider or a workspace. */
  query: ModelsQuery;
  title: string;
  description?: string;
  /** The card header's far end, e.g. a refresh button. */
  actionSlot?: SlotNode;
  /** What the card says when the listing came back with no models and nothing skipped. */
  emptyTitle: string;
}

/** The models an endpoint serves, by the id a client asks for, with the providers that could not be listed. */
export function ModelsCard({ query, title, description, actionSlot, emptyTitle }: ModelsCardProps) {
  const toast = useToast();
  const models = query.data?.models ?? [];
  const skipped = query.data?.skipped ?? [];

  return (
    <CardLayout
      level={2}
      title={title}
      description={description}
      actionSlot={actionSlot}
      contentClassName="gap-3"
      contentSlot={
        <>
          <QueryState
            query={query}
            what="models"
            // A skipped provider is something to read, so the card is not empty while there is one.
            count={models.length + skipped.length}
            emptySlot={<EmptyState compact title={emptyTitle} />}
          />
          {skipped.map(({ provider, error }) => (
            <Alert key={provider} variant="warning" title={`Could not list ${provider}`} description={error} />
          ))}
          {models.length > 0 && (
            <>
              <p className="text-foreground/60 text-xs">{formatCount(models.length, 'model')}</p>
              <RowList
                contentSlot={models.map((model) => (
                  <RowListItem
                    key={model.id}
                    contentSlot={
                      <ListItem
                        title={model.id}
                        titleClassName="font-mono"
                        actionSlot={
                          <CopyButton
                            variant="ghost"
                            value={model.id}
                            label={`Copy ${model.id}`}
                            onError={() => toast(COPY_FAILED_MESSAGE)}
                          />
                        }
                      />
                    }
                  />
                ))}
              />
            </>
          )}
        </>
      }
    />
  );
}
