import type { ProviderStatus } from '@llm-router/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ServerIcon } from 'lucide-react';
import { useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { CardLayout } from '@/components/card-layout';
import { ConfirmButton } from '@/components/confirm-button';
import { ConnectCard } from '@/components/domain/endpoint/connect-card';
import { ProviderDialog } from '@/components/domain/provider/provider-dialog';
import { ProviderModelCount } from '@/components/domain/provider/provider-model-count';
import { ProviderUsageText } from '@/components/domain/provider/provider-usage-text';
import { ListItem } from '@/components/list-item';
import { EmptyState } from '@/components/page';
import { PageLayout } from '@/components/page-layout';
import { QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Plus, Trash2 } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { GLOBAL_ENDPOINT_PATH } from '@/lib/endpoint';
import { providerLabel } from '@/lib/provider-label';
import { useDeleteProvider, useProviders } from '@/lib/queries';
import { apiErrorMessage } from '@/lib/toast';

/** The `/` route. */
export const Route = createFileRoute('/')({
  component: ProvidersPage,
});

/** create → the Add button; edit → a specific provider; null → closed. */
type DialogState = { mode: 'create' } | { mode: 'edit'; provider: ProviderStatus } | null;

/** The Providers page: every provider with its base URL, token counts and live model count, the add/edit dialog, and how to call the global endpoint. */
function ProvidersPage() {
  const providers = useProviders();
  const { data } = providers;
  const remove = useDeleteProvider();
  const toast = useToast();
  const [dialog, setDialog] = useState<DialogState>(null);
  const openCreate = () => setDialog({ mode: 'create' });

  return (
    <PageLayout
      title="Providers"
      description="The OpenAI-compatible servers this router forwards to. Each one's models are served as <provider>/<model>."
      actionSlot={<Button variant="info" onClick={openCreate} iconSlot={<Plus />} content="Add provider" />}
      contentSlot={
        <div className="flex flex-col gap-6 py-4 md:py-6">
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

          {data && data.length > 0 && (
            <CardLayout
              level={2}
              title="All providers"
              contentSlot={
                <ul className="flex flex-col divide-y divide-foreground/10">
                  {data.map((provider) => {
                    const label = providerLabel(provider);
                    return (
                      <li key={provider.name} className="py-1">
                        <ListItem
                          title={label}
                          description={<span className="break-all font-mono text-xs">{provider.baseUrl}</span>}
                          linkSlot={<Link to="/providers/$name" params={{ name: provider.name }} />}
                          meta={
                            <span className="flex flex-wrap items-center justify-end gap-1">
                              <ProviderUsageText name={provider.name} />
                              <ProviderModelCount provider={provider} />
                              {provider.apiKeySet && <Badge variant="outline">key set</Badge>}
                              {provider.enabled ? (
                                <Badge variant="positive">enabled</Badge>
                              ) : (
                                <Badge variant="secondary">disabled</Badge>
                              )}
                            </span>
                          }
                          actionSlot={
                            <>
                              <ActionButton
                                variant="ghost"
                                size="icon-sm"
                                label={`Edit ${label}`}
                                onClick={() => setDialog({ mode: 'edit', provider })}
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
                                    onSuccess: () => toast(`Deleted provider ${label}`, 'positive'),
                                    onError: (error) => toast(apiErrorMessage(error)),
                                  })
                                }
                                iconSlot={<Trash2 className="text-negative" />}
                              />
                            </>
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              }
            />
          )}

          <ConnectCard
            path={GLOBAL_ENDPOINT_PATH}
            description="The global endpoint serves every enabled provider. A workspace serves a chosen subset at its own URL."
          />

          {dialog && (
            <ProviderDialog
              key={dialog.mode === 'edit' ? dialog.provider.name : 'new'}
              open
              onOpenChange={(open) => open === false && setDialog(null)}
              provider={dialog.mode === 'edit' ? dialog.provider : undefined}
            />
          )}
        </div>
      }
    />
  );
}
