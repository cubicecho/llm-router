import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { CardLayout } from '@/components/card-layout';
import { ConfirmButton } from '@/components/confirm-button';
import { DescriptionList, PropertyRow } from '@/components/description-list';
import { EnabledSetting } from '@/components/domain/enabled/enabled-setting';
import { ModelsCard } from '@/components/domain/model/models-card';
import { ProviderDialog } from '@/components/domain/provider/provider-dialog';
import { UsageCard } from '@/components/domain/usage/usage-card';
import { PageLayout } from '@/components/page-layout';
import { QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Pencil, RefreshCw, Trash2 } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { providerLabel } from '@/lib/provider-label';
import {
  useDeleteProvider,
  useProvider,
  useProviderModels,
  useRefreshProviderModels,
  useUpdateProvider,
} from '@/lib/queries';
import { useApiErrorToast } from '@/lib/toast';

/** The `/providers/$name` route. */
export const Route = createFileRoute('/providers/$name')({
  component: ProviderDetailPage,
});

/** The page of one provider: where it is, whether it is on, the models it lists right now, and what it has been asked for. */
function ProviderDetailPage() {
  const { name } = Route.useParams();
  const navigate = useNavigate();
  const query = useProvider(name);
  const { data: provider } = query;
  const models = useProviderModels(name, { enabled: provider?.enabled === true });
  const update = useUpdateProvider();
  const remove = useDeleteProvider();
  const refresh = useRefreshProviderModels();
  const toast = useToast();
  const toastApiError = useApiErrorToast();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const label = provider ? providerLabel(provider) : name;
  const headers = Object.entries(provider?.headers ?? {});

  const handleDelete = () => {
    remove.mutate(name, {
      onSuccess: () => {
        toast(`Deleted provider ${label}`, 'positive');
        navigate({ to: '/' });
      },
      onError: toastApiError,
    });
  };

  return (
    <PageLayout
      iconSlot={
        <ActionButton
          variant="ghost"
          size="icon-sm"
          label="Back to providers"
          tooltip={false}
          linkSlot={<Link to="/" />}
          iconSlot={<ArrowLeft />}
        />
      }
      title={label}
      description={provider?.description}
      loading={query.isPending}
      contentSlot={
        <div className="flex flex-col gap-6 py-4 md:py-6">
          <QueryState query={query} what="provider" count={provider ? 1 : 0} rows={1} />
          {provider && (
            <>
              <CardLayout
                level={2}
                title="Overview"
                actionSlot={
                  <span className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditOpen(true)}
                      iconSlot={<Pencil />}
                      content="Edit"
                    />
                    <ConfirmButton
                      variant="outline"
                      size="sm"
                      label={`Delete ${label}`}
                      tooltip={false}
                      loading={remove.isPending}
                      title={`Delete provider ${label}?`}
                      description={`Its models (${provider.name}/…) stop being served, and it is removed from every workspace. The server itself is not affected.`}
                      onConfirm={handleDelete}
                      iconSlot={<Trash2 className="text-negative" />}
                      content="Delete"
                    />
                  </span>
                }
                contentClassName="gap-4"
                contentSlot={
                  <>
                    <DescriptionList
                      contentSlot={
                        <>
                          <PropertyRow label="Name" value={provider.name} valueClassName="font-mono" />
                          <PropertyRow label="Base URL" value={provider.baseUrl} valueClassName="break-all font-mono" />
                          <PropertyRow
                            label="API key"
                            value={
                              provider.apiKeySet ? (
                                <Badge variant="outline">set</Badge>
                              ) : (
                                <Badge variant="secondary">none</Badge>
                              )
                            }
                            hint="A stored key is never shown. Edit the provider to replace or remove it."
                          />
                          {headers.length > 0 && (
                            <PropertyRow
                              label="Extra headers"
                              valueClassName="break-all font-mono"
                              value={
                                <span className="flex flex-col">
                                  {headers.map(([header, value]) => (
                                    <span key={header}>
                                      {header}: {value}
                                    </span>
                                  ))}
                                </span>
                              }
                            />
                          )}
                        </>
                      }
                    />
                    <EnabledSetting
                      description="A disabled provider's models are served nowhere; its settings are kept."
                      enabled={provider.enabled}
                      saving={update.isPending}
                      onChange={(enabled) =>
                        update.mutate(
                          { name, enabled },
                          {
                            onSuccess: () => toast(`${enabled ? 'Enabled' : 'Disabled'} ${label}`, 'positive'),
                            onError: toastApiError,
                          },
                        )
                      }
                    />
                  </>
                }
              />

              {provider.enabled ? (
                <ModelsCard
                  query={models}
                  title="Models"
                  description="What the provider lists right now, by the id a client asks for."
                  emptyTitle="The provider lists no models."
                  actionSlot={
                    <Button
                      variant="outline"
                      size="sm"
                      loading={refresh.isPending}
                      loadingLabel="Refreshing…"
                      onClick={() => refresh.mutate(name, { onError: toastApiError })}
                      iconSlot={<RefreshCw />}
                      content="Refresh"
                    />
                  }
                />
              ) : (
                <CardLayout
                  level={2}
                  title="Models"
                  contentSlot={
                    <p className="text-foreground/60 text-sm">Enable the provider to list and serve its models.</p>
                  }
                />
              )}

              <UsageCard scope={{ kind: 'provider', id: name }} />

              {isEditOpen && <ProviderDialog key={name} open provider={provider} onOpenChange={setIsEditOpen} />}
            </>
          )}
        </div>
      }
    />
  );
}
