import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { CardLayout } from '@/components/card-layout';
import { ConfirmButton } from '@/components/confirm-button';
import { EnabledSetting } from '@/components/domain/enabled/enabled-setting';
import { ConnectCard } from '@/components/domain/endpoint/connect-card';
import { ModelsCard } from '@/components/domain/model/models-card';
import { UsageCard } from '@/components/domain/usage/usage-card';
import { MembersCard } from '@/components/domain/workspace/members-card';
import { WorkspaceDialog } from '@/components/domain/workspace/workspace-dialog';
import { PageLayout } from '@/components/page-layout';
import { QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Pencil, Trash2 } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { useDeleteWorkspace, useUpdateWorkspace, useWorkspace, useWorkspaceModels } from '@/lib/queries';
import { useApiErrorToast } from '@/lib/toast';

/** The `/workspaces/$slug` route. */
export const Route = createFileRoute('/workspaces_/$slug')({
  component: WorkspaceDetailPage,
});

/** The page of one workspace: its switch, its providers, the models it serves, its usage and how to call it. */
function WorkspaceDetailPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const query = useWorkspace(slug);
  const { data: workspace } = query;
  const models = useWorkspaceModels(slug);
  const update = useUpdateWorkspace();
  const remove = useDeleteWorkspace();
  const toast = useToast();
  const toastApiError = useApiErrorToast();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const handleDelete = () => {
    remove.mutate(slug, {
      onSuccess: () => {
        toast(`Deleted workspace ${workspace?.name ?? slug}`, 'positive');
        navigate({ to: '/workspaces' });
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
          label="Back to workspaces"
          tooltip={false}
          linkSlot={<Link to="/workspaces" />}
          iconSlot={<ArrowLeft />}
        />
      }
      title={workspace?.name ?? slug}
      description={workspace?.description}
      loading={query.isPending}
      contentSlot={
        <div className="flex flex-col gap-6 py-4 md:py-6">
          <QueryState query={query} what="workspace" count={workspace ? 1 : 0} rows={1} />
          {workspace && (
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
                      label={`Delete ${workspace.name}`}
                      tooltip={false}
                      loading={remove.isPending}
                      title={`Delete workspace ${workspace.name}?`}
                      description={`The workspace's endpoint (${workspace.path}) stops responding. Its providers are not affected.`}
                      onConfirm={handleDelete}
                      iconSlot={<Trash2 className="text-negative" />}
                      content="Delete"
                    />
                  </span>
                }
                contentSlot={
                  <EnabledSetting
                    description="A disabled workspace's endpoint answers 404; its providers are not affected."
                    enabled={workspace.enabled}
                    saving={update.isPending}
                    onChange={(enabled) =>
                      update.mutate(
                        { slug, enabled },
                        {
                          onSuccess: () => toast(`${enabled ? 'Enabled' : 'Disabled'} ${workspace.name}`, 'positive'),
                          onError: toastApiError,
                        },
                      )
                    }
                  />
                }
              />

              <MembersCard workspace={workspace} />

              <ModelsCard
                query={models}
                title="Models"
                description="What this workspace serves right now, by the id a client asks for."
                emptyTitle="This workspace serves no models. Switch on a provider above."
              />

              <UsageCard scope={{ kind: 'workspace', id: slug }} />

              <ConnectCard
                path={workspace.path}
                model={models.data?.models[0]?.id}
                description="Point any OpenAI client at this workspace's base URL."
              />

              {isEditOpen && (
                <WorkspaceDialog
                  key={slug}
                  open
                  workspace={workspace}
                  onOpenChange={setIsEditOpen}
                  // A rename moves the workspace to a new slug, so follow it rather than stay on a page that is gone.
                  onSaved={(saved) => {
                    if (saved.slug !== slug) {
                      navigate({ to: '/workspaces/$slug', params: { slug: saved.slug }, replace: true });
                    }
                  }}
                />
              )}
            </>
          )}
        </div>
      }
    />
  );
}
