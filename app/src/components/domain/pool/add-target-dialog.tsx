import type { PoolStatus } from '@llm-router/shared';
import { useStore } from '@tanstack/react-form';
import { InputField, SelectField, useAppForm } from '@/components/app-form';
import { DialogLayout } from '@/components/dialog-layout';
import { providerLabel } from '@/components/domain/provider/provider-label';
import { FormDialogFooter } from '@/components/layouts/form-dialog-footer';
import { Alert } from '@/components/ui/alert';
import { FormElement } from '@/components/ui/form-element';
import { unsavedChangesOf, useServerError } from '@/lib/form-dialog';
import { listingFailure } from '@/lib/listing-failure';
import { useProviderModels, useProviders, useUpdatePool } from '@/lib/queries';
import { useSuccessToast } from '@/lib/toast';

/** Ties the submit button in the footer to the form in the body. */
const FORM_ID = 'add-target-form';

/** What the model field says it wants. */
const MODEL_REQUIRED = 'Choose a model';
/** What the provider field says when none is chosen; the placeholder already says "Choose a provider". */
const PROVIDER_REQUIRED = 'Pick the provider the model runs on';

interface AddTargetDialogProps {
  /** Whether the dialog is showing. */
  open: boolean;
  /** Called when the dialog asks to open or close. */
  onOpenChange: (open: boolean) => void;
  /** The pool the target is added to. */
  pool: PoolStatus;
}

/**
 * Dialog that adds a target to a pool: a provider, then one of its models. When the provider cannot be listed, the
 * model's id is typed instead.
 */
export function AddTargetDialog({ open, onOpenChange, pool }: AddTargetDialogProps) {
  const providers = useProviders();
  const update = useUpdatePool();
  const toastSuccess = useSuccessToast();
  const { serverError, submit } = useServerError();

  const form = useAppForm({
    defaultValues: { provider: '', model: '' },
    onSubmit: ({ value }) => {
      const target = { provider: value.provider, model: value.model.trim() };
      return submit(async () => {
        await update.mutateAsync({ name: pool.name, targets: [...pool.targets, target] });
        toastSuccess(`Added ${target.provider}/${target.model} to ${pool.name}`);
        onOpenChange(false);
      });
    },
  });
  const providerName = useStore(form.store, (state) => state.values.provider);
  const hasProvider = providerName !== '';
  const listing = useProviderModels(providerName, { enabled: hasProvider });
  const listingError = hasProvider ? listingFailure(listing) : undefined;

  const providerOptions = (providers.data ?? []).map((provider) => ({
    value: provider.name,
    label: providerLabel(provider),
  }));
  // A model the pool already sends to on this provider is not offered twice.
  const modelOptions = (listing.data?.models ?? [])
    .filter((model) => {
      const isTargeted = pool.targets.some(
        (target) => target.provider === providerName && target.model === model.upstreamId,
      );
      return isTargeted === false;
    })
    .map((model) => ({ value: model.upstreamId, label: model.upstreamId, className: 'font-mono' }));
  const canPickModel = modelOptions.length > 0;
  const requireModel = ({ value }: { value: string }) => (value.trim() === '' ? MODEL_REQUIRED : undefined);

  return (
    <DialogLayout
      open={open}
      onOpenChange={onOpenChange}
      title={`Add a target to ${pool.name}`}
      description="A target is a provider and the model's id there. Add the same model on each server that runs it."
      hasUnsavedChanges={unsavedChangesOf(form)}
      footerActionsSlot={(close) => (
        <FormDialogFooter
          onCancel={close}
          submitSlot={
            <form.AppForm>
              <form.SubmitButton form={FORM_ID} content="Add target" />
            </form.AppForm>
          }
        />
      )}
      contentSlot={
        <FormElement id={FORM_ID} onSubmit={() => form.handleSubmit()} className="gap-5">
          {serverError && <Alert variant="destructive" title="Could not add the target" description={serverError} />}
          {listingError && (
            <Alert
              variant="warning"
              title={`Could not list the models of ${providerName}`}
              description={`${listingError} Type the model's id instead.`}
            />
          )}

          <SelectField
            form={form}
            name="provider"
            label="Provider"
            required
            options={providerOptions}
            placeholder="Choose a provider"
            validators={{ onChange: ({ value }) => (value === '' ? PROVIDER_REQUIRED : undefined) }}
          />

          {canPickModel ? (
            <SelectField
              key="pick"
              form={form}
              name="model"
              label="Model"
              required
              options={modelOptions}
              placeholder={MODEL_REQUIRED}
              validators={{ onChange: requireModel }}
            />
          ) : (
            <InputField
              key="type"
              form={form}
              name="model"
              label="Model id"
              required
              disabled={hasProvider === false || listing.isPending}
              className="font-mono"
              placeholder="qwen3:32b"
              description="The model's id at the provider."
              validators={{ onChange: requireModel }}
            />
          )}
        </FormElement>
      }
    />
  );
}
