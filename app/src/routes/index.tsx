import { GLOBAL_ENDPOINT_PATH, type ProviderStatus } from '@llm-router/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ServerIcon } from 'lucide-react';
import { ActionButton } from '@/components/action-button';
import { CardLayout } from '@/components/card-layout';
import { EnabledBadge } from '@/components/domain/enabled/enabled-badge';
import { ConnectCard } from '@/components/domain/endpoint/connect-card';
import { DeleteProviderButton } from '@/components/domain/provider/delete-provider-button';
import { ProviderDialog } from '@/components/domain/provider/provider-dialog';
import { providerLabel } from '@/components/domain/provider/provider-label';
import { ProviderModelCount } from '@/components/domain/provider/provider-model-count';
import { ProviderUsageText } from '@/components/domain/provider/provider-usage-text';
import { PAGE_BODY_CLASS } from '@/components/layouts/page-body';
import { RowList, RowListItem } from '@/components/layouts/row-list';
import { ListItem } from '@/components/list-item';
import { EmptyState } from '@/components/page';
import { PageLayout } from '@/components/page-layout';
import { QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Plus } from '@/components/ui/icons';
import { NEW_DIALOG_KEY, useEntityDialog } from '@/lib/entity-dialog';
import { useProviders } from '@/lib/queries';

/** The `/` route. */
export const Route = createFileRoute('/')({
  component: ProvidersPage,
});

/** The Providers page: every provider with its base URL, token counts and live model count, the add/edit dialog, and how to call the global endpoint. */
function ProvidersPage() {
  const providers = useProviders();
  const { data } = providers;
  const hasProviders = data !== undefined && data.length > 0;
  const dialog = useEntityDialog<ProviderStatus>();
  const { openCreate } = dialog;

  return (
    <PageLayout
      title="Providers"
      description="The OpenAI-compatible servers this router forwards to. Each one's models are served as <provider>/<model>."
      actionSlot={<Button variant="info" onClick={openCreate} iconSlot={<Plus />} content="Add provider" />}
      contentClassName={PAGE_BODY_CLASS}
      contentSlot={
        <>
          <QueryState
            query={providers}
            what="providers"
            count={data?.length ?? 0}
            emptySlot={
              <EmptyState
                icon={ServerIcon}
                title="No providers yet"
                description="Add an OpenAI-compatible server, such as Ollama, llama.cpp, OpenRouter or OpenAI, to serve its models."
                actionSlot={<Button variant="info" onClick={openCreate} iconSlot={<Plus />} content="Add provider" />}
              />
            }
          />

          {hasProviders && (
            <CardLayout
              level={2}
              title="All providers"
              contentSlot={
                <RowList
                  contentSlot={data.map((provider) => {
                    const label = providerLabel(provider);
                    return (
                      <RowListItem
                        key={provider.name}
                        contentSlot={
                          <ListItem
                            title={label}
                            description={<span className="break-all font-mono text-xs">{provider.baseUrl}</span>}
                            linkSlot={<Link to="/providers/$name" params={{ name: provider.name }} />}
                            meta={
                              <span className="flex flex-wrap items-center justify-end gap-1">
                                <ProviderUsageText name={provider.name} />
                                <ProviderModelCount provider={provider} />
                                {provider.apiKeySet && <Badge variant="outline">key set</Badge>}
                                <EnabledBadge enabled={provider.enabled} />
                              </span>
                            }
                            actionSlot={
                              <>
                                <ActionButton
                                  variant="ghost"
                                  size="icon-sm"
                                  label={`Edit ${label}`}
                                  onClick={() => dialog.openEdit(provider)}
                                  iconSlot={<Pencil />}
                                />
                                <DeleteProviderButton provider={provider} />
                              </>
                            }
                          />
                        }
                      />
                    );
                  })}
                />
              }
            />
          )}

          <ConnectCard
            path={GLOBAL_ENDPOINT_PATH}
            description="The global endpoint serves every enabled provider. A workspace serves a chosen subset at its own URL."
          />

          {dialog.isOpen && (
            <ProviderDialog
              key={dialog.entity?.name ?? NEW_DIALOG_KEY}
              open
              onOpenChange={dialog.onOpenChange}
              provider={dialog.entity}
            />
          )}
        </>
      }
    />
  );
}
