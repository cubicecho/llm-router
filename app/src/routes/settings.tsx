import { type EditableSettings, MS_PER_SECOND } from '@llm-router/shared';
import { createFileRoute } from '@tanstack/react-router';
import { NumberField, SwitchField, TextareaField, useAppForm } from '@/components/app-form';
import { CardLayout } from '@/components/card-layout';
import { DescriptionList, PropertyRow } from '@/components/description-list';
import { PageLayout } from '@/components/page-layout';
import { QueryError, QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Code, CodeBlock } from '@/components/ui/code';
import { FormElement } from '@/components/ui/form-element';
import { RefreshCw } from '@/components/ui/icons';
import { ThemePicker } from '@/components/ui/theme-picker';
import { useToast } from '@/components/ui/toast';
import { formatCount, formatDuration } from '@/lib/format';
import { useReloadConfig, useRouterStatus, useSettings, useUpdateSettings } from '@/lib/queries';
import { apiErrorMessage } from '@/lib/toast';

/** The `/settings` route. */
export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

const CONFIG_TREE = `config/
├── settings.json        # port, auth token, auth enabled, timeouts, allowed origins
├── providers/
│   └── <name>.json      # one file per provider, API key included
└── workspaces/
    └── <slug>.json      # one file per workspace`;

/**
 * Reads the origins out of a textarea.
 *
 * @param text - One origin per line.
 * @returns The non-empty lines, trimmed.
 */
function originsOf(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** The form over the settings the router can change while running. */
function SettingsForm({ settings }: { settings: EditableSettings }) {
  const update = useUpdateSettings();
  const toast = useToast();
  const form = useAppForm({
    defaultValues: {
      authEnabled: settings.authEnabled,
      responseTimeoutSeconds: (settings.responseTimeoutMs / MS_PER_SECOND) as number | null,
      allowedOrigins: settings.allowedOrigins.join('\n'),
    },
    onSubmit: async ({ value }) => {
      try {
        await update.mutateAsync({
          authEnabled: value.authEnabled,
          responseTimeoutMs: Math.round((value.responseTimeoutSeconds ?? 0) * MS_PER_SECOND),
          allowedOrigins: originsOf(value.allowedOrigins),
        });
        toast('Settings saved', 'positive');
      } catch (error) {
        toast(apiErrorMessage(error));
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

/** The Settings page: router status, the editable settings, the config-file layout with a reload, and the theme. */
function SettingsPage() {
  const status = useRouterStatus();
  const settings = useSettings();
  const reload = useReloadConfig();
  const toast = useToast();
  const { data } = status;

  const handleReload = () => {
    reload.mutate(undefined, {
      onSuccess: (reloaded) =>
        toast(
          `Configuration reloaded: ${formatCount(reloaded.providerCount, 'provider')}, ${formatCount(reloaded.workspaceCount, 'workspace')}`,
          'positive',
        ),
      onError: (error) => toast(apiErrorMessage(error)),
    });
  };

  return (
    <PageLayout
      title="Settings"
      description="Router status and configuration."
      width="prose"
      contentSlot={
        <div className="flex flex-col gap-6 py-4 md:py-6">
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

          <CardLayout level={2} title="Appearance" contentSlot={<ThemePicker variant="compact" />} />
        </div>
      }
    />
  );
}
