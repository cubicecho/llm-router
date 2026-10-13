import { GLOBAL_ENDPOINT_PATH, type ProviderStatus } from '@llm-router/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ServerIcon } from 'lucide-react';
import { ActionButton } from '@/components/action-button';
import { CardLayout } from '@/components/card-layout';
import { ConfirmButton } from '@/components/confirm-button';
import { EnabledBadge } from '@/components/domain/enabled/enabled-badge';
import { ConnectCard } from '@/components/domain/endpoint/connect-card';
import { ProviderDialog } from '@/components/domain/provider/provider-dialog';
import { ProviderModelCount } from '@/components/domain/provider/provider-model-count';
import { ProviderUsageText } from '@/components/domain/provider/provider-usage-text';
import { PageBody } from '@/components/layouts/page-body';
import { RowList, RowListItem } from '@/components/layouts/row-list';
import { ListItem } from '@/components/list-item';
import { EmptyState } from '@/components/page';
import { PageLayout } from '@/components/page-layout';
import { QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Plus, Trash2 } from '@/components/ui/icons';
import { NEW_DIALOG_KEY, useEntityDialog } from '@/lib/entity-dialog';
import { providerLabel } from '@/lib/provider-label';
import { useDeleteProvider, useProviders } from '@/lib/queries';
import { useApiErrorToast, useSuccessToast } from '@/lib/toast';

/** The `/` route. */
export const Route = createFileRoute('/')({
  component: ProvidersPage,
});

/** The Providers page: every provider with its base URL, token counts and live model count, the add/edit dialog, and how to call the global endpoint. */
function ProvidersPage() {
  const providers = useProviders();
  const { data } = providers;
  const remove = useDeleteProvider();
  const toastSuccess = useSuccessToast();
  const toastApiError = useApiErrorToast();
  const dialog = useEntityDialog<ProviderStatus>();
  const { openCreate } = dialog;

  return (
    <PageLayout
      title="Providers"
      description="The OpenAI-compatible servers this router forwards to. Each one's models are served as <provider>/<model>."
      actionSlot={<Button variant="info" onClick={openCreate} iconSlot={<Plus />} content="Add provider" />}
      contentSlot={
        <PageBody
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
                    actionSlot={
                      <Button variant="info" onClick={openCreate} iconSlot={<Plus />} content="Add provider" />
                    }
                  />
                }
              />

              {data && data.length > 0 && (
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
                                    <ConfirmButton
                                      variant="ghost"
                                      size="icon-sm"
                                      label={`Delete ${label}`}
                                      title={`Delete provider ${label}?`}
                                      description={`Its models (${provider.name}/…) stop being served, and it is removed from every workspace. The server itself is not affected.`}
                                      onConfirm={() =>
                                        remove.mutate(provider.name, {
                                          onSuccess: () => toastSuccess(`Deleted provider ${label}`),
                                          onError: toastApiError,
                                        })
                                      }
                                      iconSlot={<Trash2 className="text-negative" />}
                                    />
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
      }
    />
  );
}
