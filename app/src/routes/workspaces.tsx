import type { WorkspaceStatus } from '@llm-router/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { LayersIcon } from 'lucide-react';
import { useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { CardLayout } from '@/components/card-layout';
import { ConfirmButton } from '@/components/confirm-button';
import { WorkspaceDialog } from '@/components/domain/workspace/workspace-dialog';
import { WorkspaceUsageText } from '@/components/domain/workspace/workspace-usage-text';
import { ListItem } from '@/components/list-item';
import { EmptyState } from '@/components/page';
import { PageLayout } from '@/components/page-layout';
import { QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Plus, Trash2 } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { formatCount, joinStats } from '@/lib/format';
import { useDeleteWorkspace, useWorkspaces } from '@/lib/queries';
import { apiErrorMessage } from '@/lib/toast';

/** The `/workspaces` route. */
export const Route = createFileRoute('/workspaces')({
  component: WorkspacesPage,
});

/** create → the New button; edit → a specific workspace; null → closed. */
type DialogState = { mode: 'create' } | { mode: 'edit'; workspace: WorkspaceStatus } | null;

/** The Workspaces page: every workspace with its path, provider count and usage, and the create/edit dialog. */
function WorkspacesPage() {
  const workspaces = useWorkspaces();
  const { data } = workspaces;
  const remove = useDeleteWorkspace();
  const toast = useToast();
  const [dialog, setDialog] = useState<DialogState>(null);
  const openCreate = () => setDialog({ mode: 'create' });

  return (
    <PageLayout
      title="Workspaces"
      description="Each workspace serves the models of a chosen set of providers at its own OpenAI base URL."
      actionSlot={<Button variant="info" onClick={openCreate} iconSlot={<Plus />} content="New workspace" />}
      contentSlot={
        <div className="flex flex-col gap-6 py-4 md:py-6">
          <QueryState
            query={workspaces}
            what="workspaces"
            count={data?.length ?? 0}
            emptySlot={
              <EmptyState
                icon={LayersIcon}
                title="No workspaces yet"
                description="Create a workspace to give one client or team its own endpoint with only the models it should see."
                actionSlot={<Button variant="info" onClick={openCreate} iconSlot={<Plus />} content="New workspace" />}
              />
            }
          />

          {data && data.length > 0 && (
            <CardLayout
              level={2}
              title="All workspaces"
              contentSlot={
                <ul className="flex flex-col divide-y divide-foreground/10">
                  {data.map((workspace) => {
                    const memberCount = Object.values(workspace.members).filter((member) => member.enabled).length;
                    return (
                      <li key={workspace.slug} className="py-1">
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
                              {workspace.enabled ? (
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
                                label={`Edit ${workspace.name}`}
                                onClick={() => setDialog({ mode: 'edit', workspace })}
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
                                    onSuccess: () => toast(`Deleted workspace ${workspace.name}`, 'positive'),
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

          {dialog && (
            <WorkspaceDialog
              key={dialog.mode === 'edit' ? dialog.workspace.slug : 'new'}
              open
              onOpenChange={(open) => open === false && setDialog(null)}
              workspace={dialog.mode === 'edit' ? dialog.workspace : undefined}
            />
          )}
        </div>
      }
    />
  );
}
