import { type EditableSettings, MS_PER_SECOND } from '@llm-router/shared';
import { createFileRoute } from '@tanstack/react-router';
import { NumberField, SwitchField, TextareaField, useAppForm } from '@/components/app-form';
import { CardLayout } from '@/components/card-layout';
import { ConfirmButton } from '@/components/confirm-button';
import { DescriptionList, PropertyRow } from '@/components/description-list';
import { PAGE_BODY_CLASS } from '@/components/layouts/page-body';
import { PageLayout } from '@/components/page-layout';
import { QueryError, QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Code, CodeBlock } from '@/components/ui/code';
import { FormElement } from '@/components/ui/form-element';
import { RefreshCw, Trash2 } from '@/components/ui/icons';
import { ThemePicker } from '@/components/ui/theme-picker';
import { formatCount, formatDuration } from '@/lib/format';
import { nonBlankLines } from '@/lib/lines';
import { useReloadConfig, useResetUsage, useRouterStatus, useSettings, useUpdateSettings } from '@/lib/queries';
import { useApiErrorToast, useSuccessToast } from '@/lib/toast';

/** The `/settings` route. */
export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

/** The layout of the config directory, as the settings page draws it. */
const CONFIG_TREE = `config/
├── settings.json        # port, auth token, auth enabled, timeouts, allowed origins
├── providers/
│   └── <name>.json      # one file per provider, API key included
└── workspaces/
    └── <slug>.json      # one file per workspace`;

/** What the settings form edits. */
interface SettingsFormValues {
  /** Whether the router asks for its token. */
  authEnabled: boolean;
  /** The response timeout in seconds; null while the field is empty. */
  responseTimeoutSeconds: number | null;
  /** The allowed browser origins, one per line. */
  allowedOrigins: string;
}

/** The form over the settings the router can change while running. */
function SettingsForm({ settings }: { settings: EditableSettings }) {
  const update = useUpdateSettings();
  const toastSuccess = useSuccessToast();
  const toastApiError = useApiErrorToast();
  const defaultValues: SettingsFormValues = {
    authEnabled: settings.authEnabled,
    responseTimeoutSeconds: settings.responseTimeoutMs / MS_PER_SECOND,
    allowedOrigins: settings.allowedOrigins.join('\n'),
  };
  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      try {
        await update.mutateAsync({
          authEnabled: value.authEnabled,
          responseTimeoutMs: Math.round((value.responseTimeoutSeconds ?? 0) * MS_PER_SECOND),
          allowedOrigins: nonBlankLines(value.allowedOrigins),
        });
        toastSuccess('Settings saved');
      } catch (error) {
        toastApiError(error);
      }
    },
  });

  return (
    <FormElement onSubmit={() => form.handleSubmit()} className="gap-5">
      <SwitchField
        form={form}
        name="authEnabled"
        label="Require the token"
        description="When off, anyone who can reach the router can use every endpoint and change this configuration."
      />
      <NumberField
        form={form}
        name="responseTimeoutSeconds"
        label="Response timeout (seconds)"
        required
        className="max-w-40"
        description="How long a provider may take to start answering. A stream that has started is never cut off."
        validators={{
          onChange: ({ value }) => (value !== null && value > 0 ? undefined : 'Enter a number of seconds above zero'),
        }}
      />
      <TextareaField
        form={form}
        name="allowedOrigins"
        label="Allowed browser origins (one per line)"
        rows={3}
        placeholder="https://chat.example.com"
        className="font-mono"
        description="Web pages on these origins may call the router from a browser. Same-origin and non-browser clients always may."
      />
      <div>
        <form.AppForm>
          <form.SubmitButton content="Save settings" />
        </form.AppForm>
      </div>
    </FormElement>
  );
}

/**
 * The Settings page: router status, the editable settings, the config-file layout with a reload, the usage reset, and
 * the theme.
 */
function SettingsPage() {
  const status = useRouterStatus();
  const settings = useSettings();
  const reload = useReloadConfig();
  const resetUsage = useResetUsage();
  const toastSuccess = useSuccessToast();
  const toastApiError = useApiErrorToast();
  const { data } = status;

  const handleReload = () => {
    reload.mutate(undefined, {
      onSuccess: (reloaded) =>
        toastSuccess(
          `Configuration reloaded: ${formatCount(reloaded.providerCount, 'provider')}, ${formatCount(reloaded.workspaceCount, 'workspace')}`,
        ),
      onError: toastApiError,
    });
  };

  const handleResetUsage = () => {
    resetUsage.mutate(undefined, {
      onSuccess: () => toastSuccess('Usage counts reset'),
      onError: toastApiError,
    });
  };

  return (
    <PageLayout
      title="Settings"
      description="Router status and configuration."
      width="prose"
      contentClassName={PAGE_BODY_CLASS}
      contentSlot={
        <>
          <CardLayout
            level={2}
            title="Router"
            loading={status.isPending}
            contentSlot={
              status.error ? (
                <QueryError error={status.error} onRetry={() => status.refetch()} what="status" />
              ) : (
                data && (
                  <DescriptionList
                    contentSlot={
                      <>
                        <PropertyRow label="Version" value={data.version} />
                        <PropertyRow label="Uptime" value={formatDuration(data.uptimeSeconds)} />
                        <PropertyRow label="Providers" value={String(data.providerCount)} />
                        <PropertyRow label="Workspaces" value={String(data.workspaceCount)} />
                        <PropertyRow
                          label="Auth"
                          value={
                            data.authEnabled ? (
                              <Badge variant="positive">enabled</Badge>
                            ) : (
                              <Badge variant="warning">disabled</Badge>
                            )
                          }
                          hint={
                            <>
                              The bearer token is set with the <Code>LLM_ROUTER_TOKEN</Code> environment variable or in{' '}
                              <Code>settings.json</Code>. It protects <Code>/api</Code> and every <Code>/v1</Code>, and
                              is what a client sends as its OpenAI API key.
                            </>
                          }
                        />
                      </>
                    }
                  />
                )
              )
            }
          />

          <CardLayout
            level={2}
            title="Configuration"
            contentSlot={
              <>
                <QueryState query={settings} what="settings" count={settings.data ? 1 : 0} rows={3} />
                {settings.data && <SettingsForm key={JSON.stringify(settings.data)} settings={settings.data} />}
              </>
            }
          />

          <CardLayout
            level={2}
            title="Configuration files"
            description={
              <>
                All configuration lives in flat, hand-editable JSON files under <Code>DATA_DIR/config</Code>:
              </>
            }
            contentClassName="flex flex-col gap-4"
            contentSlot={
              <>
                <CodeBlock content={CONFIG_TREE} />
                <p className="text-foreground/60 text-sm">
                  The files are watched, so a hand edit is picked up by itself. A reload re-reads everything from disk
                  at once and forgets the cached model lists.
                </p>
                <div>
                  <Button
                    variant="outline"
                    loading={reload.isPending}
                    loadingLabel="Reloading…"
                    onClick={handleReload}
                    iconSlot={<RefreshCw />}
                    content="Reload config"
                  />
                </div>
              </>
            }
          />

          <CardLayout
            level={2}
            title="Usage"
            description={
              <>
                Request and token counts are kept in <Code>DATA_DIR/usage.json</Code>, per provider, model, workspace
                and day.
              </>
            }
            contentSlot={
              <div>
                <ConfirmButton
                  variant="outline"
                  label="Reset usage"
                  tooltip={false}
                  loading={resetUsage.isPending}
                  loadingLabel="Resetting…"
                  title="Reset the usage counts?"
                  description="Every request and token count is set back to zero, for all providers, workspaces and days. This cannot be undone."
                  confirmLabel="Reset usage"
                  onConfirm={handleResetUsage}
                  iconSlot={<Trash2 className="text-negative" />}
                  content="Reset usage"
                />
              </div>
            }
          />

          <CardLayout level={2} title="Appearance" contentSlot={<ThemePicker variant="compact" />} />
        </>
      }
    />
  );
}
