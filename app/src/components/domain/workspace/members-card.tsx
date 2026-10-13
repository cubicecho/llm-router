import type { ProviderStatus, WorkspaceStatus } from '@llm-router/shared';
import { Link } from '@tanstack/react-router';
import { CardLayout } from '@/components/card-layout';
import { MemberModelsDialog } from '@/components/domain/workspace/member-models-dialog';
import { EmptyState } from '@/components/page';
import { QueryState } from '@/components/query-state';
import { SettingRow } from '@/components/setting-row';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { useEntityDialog } from '@/lib/entity-dialog';
import { formatCount } from '@/lib/format';
import { providerLabel } from '@/lib/provider-label';
import { useProviders, useUpdateWorkspace } from '@/lib/queries';
import { apiErrorMessage } from '@/lib/toast';

/**
 * Says what a member contributes.
 *
 * @param provider - The provider.
 * @param isMember - Whether the workspace serves it.
 * @param allowed - The member's model allowlist; empty means every model.
 * @returns One line for under the provider's name.
 */
function memberSummary(provider: ProviderStatus, isMember: boolean, allowed: string[]): string {
  if (provider.enabled === false) {
    return 'This provider is disabled, so it serves no models anywhere.';
  }
  if (isMember === false) {
    return 'Not served by this workspace.';
  }
  return allowed.length > 0 ? `${formatCount(allowed.length, 'model')} allowed` : 'Every model it lists';
}

/**
 * A workspace's members: every provider with a switch that puts it in the workspace, and the choice of which of its
 * models are served. A switch saves at once; the models are chosen in a dialog.
 */
export function MembersCard({ workspace }: { workspace: WorkspaceStatus }) {
  const providers = useProviders();
  const update = useUpdateWorkspace();
  const toast = useToast();
  const modelsDialog = useEntityDialog<ProviderStatus>();

  const setMember = (provider: ProviderStatus, isOn: boolean) => {
    // A member switched off keeps its entry, and with it the models chosen for it.
    const member = { ...workspace.members[provider.name], enabled: isOn };
    update.mutate(
      { slug: workspace.slug, members: { ...workspace.members, [provider.name]: member } },
      { onError: (error) => toast(apiErrorMessage(error)) },
    );
  };

  return (
    <CardLayout
      level={2}
      title="Providers"
      description="The providers whose models this workspace serves."
      contentClassName="gap-4"
      contentSlot={
        <>
          <QueryState
            query={providers}
            what="providers"
            count={providers.data?.length ?? 0}
            emptySlot={
              <EmptyState
                compact
                title="No providers yet."
                actionSlot={<Button variant="outline" size="sm" linkSlot={<Link to="/" />} content="Add a provider" />}
              />
            }
          />
          {providers.data?.map((provider) => {
            const member = workspace.members[provider.name];
            const isMember = member?.enabled === true;
            const label = providerLabel(provider);
            return (
              <SettingRow
                key={provider.name}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {label}
                    {provider.enabled === false && <Badge variant="secondary">disabled</Badge>}
                  </span>
                }
                description={memberSummary(provider, isMember, member?.models ?? [])}
                actionSlot={
                  <>
                    {isMember && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => modelsDialog.openEdit(provider)}
                        content="Choose models"
                        aria-label={`Choose models of ${label}`}
                      />
                    )}
                    <Switch
                      checked={isMember}
                      // Each save sends every member: a second one sent before the first lands would undo it.
                      disabled={update.isPending}
                      onCheckedChange={(isOn) => setMember(provider, isOn)}
                      aria-label={`Serve ${label}`}
                    />
                  </>
                }
              />
            );
          })}
          {modelsDialog.entity && (
            <MemberModelsDialog
              key={modelsDialog.entity.name}
              open
              onOpenChange={modelsDialog.onOpenChange}
              workspace={workspace}
              provider={modelsDialog.entity}
            />
          )}
        </>
      }
    />
  );
}
