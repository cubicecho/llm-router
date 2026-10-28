import {
  MIN_LOAD_FACTOR,
  POOL_DEFAULTS,
  PoolAffinity,
  type PoolStatus,
  PoolStrategy,
  poolNameSchema,
} from '@llm-router/shared';
import { useStore } from '@tanstack/react-form';
import { InputField, NumberField, SelectField, SwitchField, useAppForm } from '@/components/app-form';
import { DialogLayout } from '@/components/dialog-layout';
import { FormDialogFooter } from '@/components/layouts/form-dialog-footer';
import { Alert } from '@/components/ui/alert';
import { FormElement } from '@/components/ui/form-element';
import { unsavedChangesOf, useServerError } from '@/lib/form-dialog';
import { useCreatePool, useUpdatePool } from '@/lib/queries';
import { useSuccessToast } from '@/lib/toast';
import { AFFINITY_TEXT, STRATEGY_TEXT } from './pool-text.ts';

/** Ties the submit button in the footer to the form in the body. */
const FORM_ID = 'pool-form';

/** The step of the load factor's arrows. */
const LOAD_FACTOR_STEP = 0.05;

/** The strategies as select options, in the order the vocabulary lists them. */
const STRATEGY_OPTIONS = Object.values(PoolStrategy).map((strategy) => ({
  value: strategy,
  label: STRATEGY_TEXT[strategy].label,
}));

/** The affinities as select options. */
const AFFINITY_OPTIONS = Object.values(PoolAffinity).map((affinity) => ({
  value: affinity,
  label: AFFINITY_TEXT[affinity].label,
}));

interface PoolDialogProps {
  /** Whether the dialog is showing. */
  open: boolean;
  /** Called when the dialog asks to open or close. */
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing pool; omitted when creating. */
  pool?: PoolStatus;
}

/**
 * Dialog that creates a pool or edits how it places requests: its strategy, its affinity, its bounded load, its
 * description and its enabled switch. A pool's name is the model id clients ask for, so it is set once.
 */
export function PoolDialog({ open, onOpenChange, pool }: PoolDialogProps) {
  const isEdit = pool !== undefined;
  const create = useCreatePool();
  const update = useUpdatePool();
  const toastSuccess = useSuccessToast();
  const { serverError, submit } = useServerError();

  const form = useAppForm({
    defaultValues: {
      name: pool?.name ?? '',
      description: pool?.description ?? '',
      strategy: pool?.strategy ?? PoolStrategy.LeastBusy,
      affinity: pool?.affinity ?? PoolAffinity.Sticky,
      isBounded: pool?.maxLoadFactor !== undefined,
      loadFactor: pool?.maxLoadFactor ?? POOL_DEFAULTS.suggestedLoadFactor,
      enabled: pool?.enabled ?? true,
    },
    onSubmit: ({ value }) => {
      const description = value.description.trim();
      const { strategy, affinity } = value;
      const isBounded = affinity === PoolAffinity.Sticky && value.isBounded;
      return submit(async () => {
        if (isEdit) {
          // Null turns bounded load off; left out, the server would keep the old factor.
          const saved = await update.mutateAsync({
            name: pool.name,
            description,
            strategy,
            affinity,
            maxLoadFactor: isBounded ? value.loadFactor : null,
            enabled: value.enabled,
          });
          toastSuccess(`Saved pool ${saved.name}`);
        } else {
          const saved = await create.mutateAsync({
            name: value.name.trim(),
            description: description || undefined,
            strategy,
            affinity,
            maxLoadFactor: isBounded ? value.loadFactor : undefined,
            enabled: value.enabled,
          });
          toastSuccess(`Created pool ${saved.name}`);
        }
        onOpenChange(false);
      });
    },
  });
  const strategy = useStore(form.store, (state) => state.values.strategy);
  const affinity = useStore(form.store, (state) => state.values.affinity);
  const isBounded = useStore(form.store, (state) => state.values.isBounded);
  const isSticky = affinity === PoolAffinity.Sticky;
  const shouldShowLoadFactor = isSticky && isBounded;

  return (
    <DialogLayout
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit ${pool.name}` : 'New pool'}
      description="A pool serves one model from several targets under one name, and picks the target for each request."
      hasUnsavedChanges={unsavedChangesOf(form)}
      footerActionsSlot={(close) => (
        <FormDialogFooter
          onCancel={close}
          submitSlot={
            <form.AppForm>
              <form.SubmitButton form={FORM_ID} content={isEdit ? 'Save changes' : 'Create pool'} />
            </form.AppForm>
          }
        />
      )}
      contentSlot={
        <FormElement id={FORM_ID} onSubmit={() => form.handleSubmit()} className="gap-5">
          {serverError && <Alert variant="destructive" title="Could not save the pool" description={serverError} />}

          {isEdit === false && (
            <InputField
              form={form}
              name="name"
              label="Pool name"
              required
              placeholder="qwen3"
              className="font-mono"
              description="The model id clients ask for. It cannot hold a slash, and cannot be changed later."
              validators={{
                onChange: ({ value }) =>
                  poolNameSchema.safeParse(value).success
                    ? undefined
                    : 'Use lowercase letters, digits, dots, dashes and underscores, starting with a letter or digit',
              }}
            />
          )}

          <InputField
            form={form}
            name="description"
            label="Description (optional)"
            placeholder="What this pool serves"
          />

          <SelectField
            form={form}
            name="strategy"
            label="Strategy"
            options={STRATEGY_OPTIONS}
            description={STRATEGY_TEXT[strategy].description}
          />

          <SelectField
            form={form}
            name="affinity"
            label="Affinity"
            options={AFFINITY_OPTIONS}
            description={AFFINITY_TEXT[affinity].description}
          />

          {isSticky && (
            <SwitchField
              form={form}
              name="isBounded"
              label="Bounded load"
              description="Lets a conversation leave a target that is much busier than the rest."
            />
          )}

          {shouldShowLoadFactor && (
            <NumberField
              form={form}
              name="loadFactor"
              label="Load factor"
              required
              min={MIN_LOAD_FACTOR}
              step={LOAD_FACTOR_STEP}
              description="A conversation moves on when its target has more than this times the average in flight."
              validators={{
                onChange: ({ value }) => (value >= MIN_LOAD_FACTOR ? undefined : `Use ${MIN_LOAD_FACTOR} or more`),
              }}
            />
          )}

          <SwitchField
            form={form}
            name="enabled"
            label="Enabled"
            description="When off, no endpoint serves the pool, without deleting it."
          />
        </FormElement>
      }
    />
  );
}
