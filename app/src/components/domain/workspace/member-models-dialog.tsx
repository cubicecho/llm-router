import type { ProviderStatus, WorkspaceStatus } from '@llm-router/shared';
import { useAppForm } from '@/components/app-form';
import { DialogLayout } from '@/components/dialog-layout';
import { FormDialogFooter } from '@/components/layouts/form-dialog-footer';
import { MultiSelectField } from '@/components/multi-select-field';
import { Alert } from '@/components/ui/alert';
import { FormElement } from '@/components/ui/form-element';
import { unsavedChangesOf, useServerError } from '@/lib/form-dialog';
import { listingFailure } from '@/lib/listing-failure';
import { providerLabel } from '@/lib/provider-label';
import { useProviderModels, useUpdateWorkspace } from '@/lib/queries';
import { useSuccessToast } from '@/lib/toast';

/** Ties the submit button in the footer to the form in the body. */
const FORM_ID = 'member-models-form';

interface MemberModelsDialogProps {
  /** Whether the dialog is showing. */
  open: boolean;
  /** Called when the dialog asks to open or close. */
  onOpenChange: (open: boolean) => void;
  /** The workspace the member belongs to. */
  workspace: WorkspaceStatus;
  /** The member whose models are chosen. */
  provider: ProviderStatus;
}

/**
 * Dialog that picks which of a member's models a workspace serves. An empty choice serves every model the provider
 * lists, including ones it adds later.
 */
export function MemberModelsDialog({ open, onOpenChange, workspace, provider }: MemberModelsDialogProps) {
  const update = useUpdateWorkspace();
  const toastSuccess = useSuccessToast();
  const listing = useProviderModels(provider.name);
  const { serverError, submit } = useServerError();
  const member = workspace.members[provider.name];
  const stored = member?.models ?? [];
  const label = providerLabel(provider);

  // A stored model the provider no longer lists stays choosable, so opening the dialog never drops it silently.
  const listed = (listing.data?.models ?? []).map((model) => model.upstreamId);
  const options = [...new Set([...listed, ...stored])].map((upstreamId) => ({ value: upstreamId, label: upstreamId }));
  const listingError = listingFailure(listing);

  const form = useAppForm({
    defaultValues: { models: stored as readonly string[] },
    onSubmit: ({ value }) => {
      const models = value.models.length > 0 ? [...value.models] : undefined;
      return submit(async () => {
        await update.mutateAsync({
          slug: workspace.slug,
          members: { ...workspace.members, [provider.name]: { enabled: member?.enabled ?? true, models } },
        });
        toastSuccess(`Saved the models of ${label}`);
        onOpenChange(false);
      });
    },
  });

  return (
    <DialogLayout
      open={open}
      onOpenChange={onOpenChange}
      title={`Models of ${label}`}
      description={`Which of this provider's models ${workspace.name} serves.`}
      hasUnsavedChanges={unsavedChangesOf(form)}
      footerActionsSlot={(close) => (
        <FormDialogFooter
          onCancel={close}
          submitSlot={
            <form.AppForm>
              <form.SubmitButton form={FORM_ID} content="Save models" />
            </form.AppForm>
          }
        />
      )}
      contentSlot={
        <FormElement id={FORM_ID} onSubmit={() => form.handleSubmit()} className="gap-5">
          {serverError && <Alert variant="destructive" title="Could not save the models" description={serverError} />}
          {listingError && (
            <Alert variant="warning" title={`Could not list the models of ${label}`} description={listingError} />
          )}
          <MultiSelectField
            form={form}
            name="models"
            label="Models"
            options={options}
            placeholder="Every model"
            searchPlaceholder="Search models…"
            emptyMessage={listing.isPending ? 'Loading models…' : 'No models.'}
            description="Leave empty to serve every model the provider lists, including ones it adds later."
          />
        </FormElement>
      }
    />
  );
}
