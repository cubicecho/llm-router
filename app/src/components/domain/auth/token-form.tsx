import { useAppForm } from '@/components/app-form';
import { CenteredLayout } from '@/components/centered-layout';
import { PasswordField } from '@/components/password-field';
import { Code } from '@/components/ui/code';
import { FormElement } from '@/components/ui/form-element';
import { KeyRound } from '@/components/ui/icons';

interface TokenFormProps {
  /** Called with the trimmed token when the form is submitted with one. */
  onUnlock: (token: string) => void;
}

/** The token-entry screen shown when the router asks for its bearer token. */
export function TokenForm({ onUnlock }: TokenFormProps) {
  const form = useAppForm({
    defaultValues: { token: '' },
    onSubmit: ({ value, formApi }) => {
      const token = value.token.trim();
      const isBlank = token === '';
      if (isBlank) {
        return;
      }
      formApi.reset();
      onUnlock(token);
    },
  });

  return (
    <CenteredLayout
      iconSlot={<KeyRound />}
      title="Authentication required"
      description={
        <>
          Enter the router token (from <Code>LLM_ROUTER_TOKEN</Code> or <Code>settings.json</Code>).
        </>
      }
      contentSlot={
        <FormElement onSubmit={() => form.handleSubmit()} className="gap-4">
          <PasswordField
            form={form}
            name="token"
            label="Token"
            autoFocus
            placeholder="Bearer token"
            showLabel="Show token"
            hideLabel="Hide token"
          />
          <form.Subscribe selector={(state) => state.values.token.trim().length === 0}>
            {(empty) => (
              <form.AppForm>
                <form.SubmitButton disabled={empty} pendingLabel="Unlocking…" content="Unlock" />
              </form.AppForm>
            )}
          </form.Subscribe>
        </FormElement>
      }
    />
  );
}
