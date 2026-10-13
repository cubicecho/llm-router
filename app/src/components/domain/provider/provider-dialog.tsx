import { httpUrlSchema, type ProviderStatus, providerNameSchema } from '@llm-router/shared';
import { CheckboxField, InputField, SwitchField, TextareaField, useAppForm } from '@/components/app-form';
import { DialogLayout } from '@/components/dialog-layout';
import { FormDialogFooter } from '@/components/layouts/form-dialog-footer';
import { PasswordField } from '@/components/password-field';
import { Alert } from '@/components/ui/alert';
import { FormElement } from '@/components/ui/form-element';
import { useToast } from '@/components/ui/toast';
import { unsavedChangesOf, useServerError } from '@/lib/form-dialog';
import { linesToRecord, malformedLines, recordToLines } from '@/lib/key-value';
import { useCreateProvider, useUpdateProvider } from '@/lib/queries';

/** Ties the submit button in the footer to the form in the body. */
const FORM_ID = 'provider-form';

interface ProviderDialogProps {
  /** Whether the dialog is showing. */
  open: boolean;
  /** Called when the dialog asks to open or close. */
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing provider; omitted when adding one. */
  provider?: ProviderStatus;
}

/**
 * Dialog that adds a provider or edits one. The API key is write-only: an edit that leaves it blank keeps the stored
 * key, and the stored key is never shown.
 */
export function ProviderDialog({ open, onOpenChange, provider }: ProviderDialogProps) {
  const isEdit = provider !== undefined;
  const create = useCreateProvider();
  const update = useUpdateProvider();
  const toast = useToast();
  const { serverError, submit } = useServerError();

  const form = useAppForm({
    defaultValues: {
      name: provider?.name ?? '',
      displayName: provider?.displayName ?? '',
      baseUrl: provider?.baseUrl ?? '',
      apiKey: '',
      shouldRemoveKey: false,
      headers: recordToLines(provider?.headers),
      description: provider?.description ?? '',
      enabled: provider?.enabled ?? true,
    },
    onSubmit: ({ value }) => {
      const apiKey = value.apiKey.trim();
      const common = {
        baseUrl: value.baseUrl.trim(),
        enabled: value.enabled,
        headers: linesToRecord(value.headers),
      };
      return submit(async () => {
        if (isEdit) {
          const keyChange = value.shouldRemoveKey ? { apiKey: null } : {};
          const saved = await update.mutateAsync({
            name: provider.name,
            ...common,
            // An edit sends the texts even when empty, which clears them: left out, the server would keep the old ones.
            displayName: value.displayName.trim(),
            description: value.description.trim(),
            ...(apiKey ? { apiKey } : keyChange),
          });
          toast(`Saved provider ${saved.name}`, 'positive');
        } else {
          const saved = await create.mutateAsync({
            name: value.name.trim(),
            ...common,
            displayName: value.displayName.trim() || undefined,
            description: value.description.trim() || undefined,
            apiKey: apiKey || undefined,
          });
          toast(`Added provider ${saved.name}`, 'positive');
        }
        onOpenChange(false);
      });
    },
  });

  return (
    <DialogLayout
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={isEdit ? `Edit ${provider.name}` : 'Add provider'}
      description="A provider is one OpenAI-compatible server. Its models are served as <name>/<model>."
      hasUnsavedChanges={unsavedChangesOf(form)}
      footerActionsSlot={(close) => (
        <FormDialogFooter
          onCancel={close}
          submitSlot={
            <form.AppForm>
              <form.SubmitButton form={FORM_ID} content={isEdit ? 'Save changes' : 'Add provider'} />
            </form.AppForm>
          }
        />
      )}
      contentSlot={
        <FormElement id={FORM_ID} onSubmit={() => form.handleSubmit()} className="gap-5">
          {serverError && <Alert variant="destructive" title="Could not save the provider" description={serverError} />}

          {isEdit === false && (
            <InputField
              form={form}
              name="name"
              label="Name"
              required
              placeholder="ollama"
              className="font-mono"
              description="The prefix of this provider's model ids. Lowercase letters, digits, dots, dashes and underscores."
              validators={{
                onChange: ({ value }) =>
                  providerNameSchema.safeParse(value.trim()).success
                    ? undefined
                    : 'Use lowercase letters, digits, dots, dashes and underscores, starting with a letter or digit',
              }}
            />
          )}

          <InputField
            form={form}
            name="baseUrl"
            label="Base URL"
            required
            placeholder="https://api.openai.com/v1"
            className="font-mono"
            description="The OpenAI-compatible base URL, version path included: the router calls <base URL>/models and <base URL>/chat/completions."
            validators={{
              onChange: ({ value }) =>
                httpUrlSchema.safeParse(value.trim()).success ? undefined : 'Enter an http:// or https:// URL',
            }}
          />

          <PasswordField
            form={form}
            name="apiKey"
            label="API key"
            placeholder={
              provider?.apiKeySet ? 'Leave blank to keep the stored key' : 'Leave blank for a server that needs none'
            }
            showLabel="Show API key"
            hideLabel="Hide API key"
            description="Sent to the provider as a bearer token. Stored in the provider's config file and never shown again."
          />

          {provider?.apiKeySet === true && (
            <CheckboxField
              form={form}
              name="shouldRemoveKey"
              label="Remove the stored key"
              description="The provider is then called without an Authorization header, unless a new key is entered above."
            />
          )}

          <TextareaField
            form={form}
            name="headers"
            label="Extra headers (Name: value per line)"
            rows={3}
            placeholder="HTTP-Referer: https://example.com"
            className="font-mono"
            description="Sent with every request to this provider. Stored and shown in plain text, so keep secrets in the API key."
            validators={{
              onChange: ({ value }) =>
                malformedLines(value).length === 0 ? undefined : 'Write each header as Name: value',
            }}
          />

          <InputField form={form} name="displayName" label="Display name (optional)" placeholder="Ollama" />

          <InputField
            form={form}
            name="description"
            label="Description (optional)"
            placeholder="What this provider is for"
          />

          <SwitchField
            form={form}
            name="enabled"
            label="Enabled"
            description="When off, the provider's models are served nowhere."
          />
        </FormElement>
      }
    />
  );
}
