import { slugify, type WorkspaceStatus, workspaceEndpointPath } from '@llm-router/shared';
import { useStore } from '@tanstack/react-form';
import { InputField, SwitchField, useAppForm } from '@/components/app-form';
import { DialogLayout } from '@/components/dialog-layout';
import { FormDialogFooter } from '@/components/layouts/form-dialog-footer';
import { Alert } from '@/components/ui/alert';
import { FormElement } from '@/components/ui/form-element';
import { unsavedChangesOf, useServerError } from '@/lib/form-dialog';
import { useCreateWorkspace, useUpdateWorkspace } from '@/lib/queries';
import { useSuccessToast } from '@/lib/toast';

/** Ties the submit button in the footer to the form in the body. */
const FORM_ID = 'workspace-form';

interface WorkspaceDialogProps {
  /** Whether the dialog is showing. */
  open: boolean;
  /** Called when the dialog asks to open or close. */
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing workspace; omitted when creating. */
  workspace?: WorkspaceStatus;
  /** Called with the saved workspace before the dialog closes, so a page can follow a rename. */
  onSaved?: (workspace: WorkspaceStatus) => void;
}

/**
 * Dialog that creates a workspace or edits its name, description and enabled switch. The URL slug follows the name, so
 * renaming a workspace moves its endpoint.
 */
export function WorkspaceDialog({ open, onOpenChange, workspace, onSaved }: WorkspaceDialogProps) {
  const isEdit = workspace !== undefined;
  const create = useCreateWorkspace();
  const update = useUpdateWorkspace();
  const toastSuccess = useSuccessToast();
  const { serverError, submit } = useServerError();

  const form = useAppForm({
    defaultValues: {
      name: workspace?.name ?? '',
      description: workspace?.description ?? '',
      enabled: workspace?.enabled ?? true,
    },
    onSubmit: ({ value }) => {
      const name = value.name.trim();
      const description = value.description.trim();
      return submit(async () => {
        if (isEdit) {
          // An edit sends the description even when empty: left out, the server would keep the old one.
          const saved = await update.mutateAsync({ slug: workspace.slug, name, description, enabled: value.enabled });
          toastSuccess(`Saved workspace ${saved.name}`);
          onSaved?.(saved);
        } else {
          const saved = await create.mutateAsync({
            name,
            description: description || undefined,
            enabled: value.enabled,
          });
          toastSuccess(`Created workspace ${saved.name}`);
          onSaved?.(saved);
        }
        onOpenChange(false);
      });
    },
  });
  const name = useStore(form.store, (state) => state.values.name);

  // In edit mode the URL only moves once the name actually changes, so show the stored slug until then.
  const slug = isEdit && name === workspace.name ? workspace.slug : slugify(name);
  const isSlugValid = slug.length > 0;
  const isMoved = isEdit && isSlugValid && slug !== workspace.slug;

  return (
    <DialogLayout
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit ${workspace.name}` : 'New workspace'}
      description="A workspace serves the models of the providers you choose at its own OpenAI base URL."
      hasUnsavedChanges={unsavedChangesOf(form)}
      footerActionsSlot={(close) => (
        <FormDialogFooter
          onCancel={close}
          submitSlot={
            <form.AppForm>
              <form.SubmitButton form={FORM_ID} content={isEdit ? 'Save changes' : 'Create workspace'} />
            </form.AppForm>
          }
        />
      )}
      contentSlot={
        <FormElement id={FORM_ID} onSubmit={() => form.handleSubmit()} className="gap-5">
          {serverError && (
            <Alert variant="destructive" title="Could not save the workspace" description={serverError} />
          )}

          <InputField
            form={form}
            name="name"
            label="Workspace name"
            required
            placeholder="Research"
            descriptionClassName="font-mono"
            description={
              <>
                {isSlugValid ? workspaceEndpointPath(slug) : 'Enter a name to generate the URL'}
                {isMoved && ' (renaming moves the URL)'}
              </>
            }
            validators={{
              onChange: ({ value }) =>
                slugify(value).length > 0 ? undefined : 'Enter a workspace name that produces a valid URL slug',
            }}
          />

          <InputField
            form={form}
            name="description"
            label="Description (optional)"
            placeholder="What this workspace is for"
          />

          <SwitchField
            form={form}
            name="enabled"
            label="Enabled"
            description="When off, the workspace's endpoint answers 404 without deleting it."
          />
        </FormElement>
      }
    />
  );
}
