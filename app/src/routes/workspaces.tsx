import type { WorkspaceStatus } from '@llm-router/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { LayersIcon } from 'lucide-react';
import { ActionButton } from '@/components/action-button';
import { CardLayout } from '@/components/card-layout';
import { ConfirmButton } from '@/components/confirm-button';
import { EnabledBadge } from '@/components/domain/enabled/enabled-badge';
import { WorkspaceDialog } from '@/components/domain/workspace/workspace-dialog';
import { WorkspaceUsageText } from '@/components/domain/workspace/workspace-usage-text';
import { PageBody } from '@/components/layouts/page-body';
import { RowList, RowListItem } from '@/components/layouts/row-list';
import { ListItem } from '@/components/list-item';
import { EmptyState } from '@/components/page';
import { PageLayout } from '@/components/page-layout';
import { QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { Pencil, Plus, Trash2 } from '@/components/ui/icons';
import { NEW_DIALOG_KEY, useEntityDialog } from '@/lib/entity-dialog';
import { formatCount, joinStats } from '@/lib/format';
import { useDeleteWorkspace, useWorkspaces } from '@/lib/queries';
import { useApiErrorToast, useSuccessToast } from '@/lib/toast';

/** The `/workspaces` route. */
export const Route = createFileRoute('/workspaces')({
  component: WorkspacesPage,
});

/** The Workspaces page: every workspace with its path, provider count and usage, and the create/edit dialog. */
function WorkspacesPage() {
  const workspaces = useWorkspaces();
  const { data } = workspaces;
  const hasWorkspaces = data !== undefined && data.length > 0;
  const remove = useDeleteWorkspace();
  const toastSuccess = useSuccessToast();
  const toastApiError = useApiErrorToast();
  const dialog = useEntityDialog<WorkspaceStatus>();
  const { openCreate } = dialog;

  return (
    <PageLayout
      title="Workspaces"
      description="Each workspace serves the models of a chosen set of providers at its own OpenAI base URL."
      actionSlot={<Button variant="info" onClick={openCreate} iconSlot={<Plus />} content="New workspace" />}
      contentSlot={
        <PageBody
          contentSlot={
            <>
              <QueryState
                query={workspaces}
                what="workspaces"
                count={data?.length ?? 0}
                emptySlot={
                  <EmptyState
                    icon={LayersIcon}
                    title="No workspaces yet"
                    description="Create a workspace to give one client or team its own endpoint with only the models it should see."
                    actionSlot={
                      <Button variant="info" onClick={openCreate} iconSlot={<Plus />} content="New workspace" />
                    }
                  />
                }
              />

              {hasWorkspaces && (
                <CardLayout
                  level={2}
                  title="All workspaces"
                  contentSlot={
                    <RowList
                      contentSlot={data.map((workspace) => {
                        const memberCount = Object.values(workspace.members).filter((member) => member.enabled).length;
                        return (
                          <RowListItem
                            key={workspace.slug}
                            contentSlot={
                              <ListItem
                                title={workspace.name}
                                description={
                                  <span className="text-foreground/60 text-xs">
                                    {joinStats(workspace.path, formatCount(memberCount, 'provider'))}
                                  </span>
                                }
                                linkSlot={<Link to="/workspaces/$slug" params={{ slug: workspace.slug }} />}
                                meta={
                                  <span className="flex flex-wrap items-center justify-end gap-1">
                                    <WorkspaceUsageText slug={workspace.slug} />
                                    <EnabledBadge enabled={workspace.enabled} />
                                  </span>
                                }
                                actionSlot={
                                  <>
                                    <ActionButton
                                      variant="ghost"
                                      size="icon-sm"
                                      label={`Edit ${workspace.name}`}
                                      onClick={() => dialog.openEdit(workspace)}
                                      iconSlot={<Pencil />}
                                    />
                                    <ConfirmButton
                                      variant="ghost"
                                      size="icon-sm"
                                      label={`Delete ${workspace.name}`}
                                      title={`Delete workspace ${workspace.name}?`}
                                      description={`The workspace's endpoint (${workspace.path}) stops responding. Its providers are not affected.`}
                                      onConfirm={() =>
                                        remove.mutate(workspace.slug, {
                                          onSuccess: () => toastSuccess(`Deleted workspace ${workspace.name}`),
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

              {dialog.isOpen && (
                <WorkspaceDialog
                  key={dialog.entity?.slug ?? NEW_DIALOG_KEY}
                  open
                  onOpenChange={dialog.onOpenChange}
                  workspace={dialog.entity}
                />
              )}
            </>
          }
        />
      }
    />
  );
}
