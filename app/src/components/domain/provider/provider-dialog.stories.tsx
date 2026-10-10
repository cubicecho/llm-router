import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { hostedProvider, localProvider } from '@/storybook/fixtures';
import { apiError, apiRequest, pending } from '@/storybook/mock-api';
import { ProviderDialog } from './provider-dialog.tsx';

const CREATE_ROUTE = 'POST /api/providers';
const UPDATE_ROUTE = 'PATCH /api/providers/openrouter';
const HEADERS = 'Extra headers (Name: value per line)';

const routes = {
  [CREATE_ROUTE]: localProvider({ displayName: undefined, description: undefined }),
  [UPDATE_ROUTE]: hostedProvider(),
};

const meta = {
  component: ProviderDialog,
  args: { open: true, onOpenChange: fn() },
  parameters: { api: routes },
} satisfies Meta<typeof ProviderDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const StartsEmpty: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Add provider' }));
    await expect(dialog.getByRole('textbox', { name: /^Name/ })).toHaveValue('');
    await expect(dialog.getByRole('textbox', { name: /^Base URL/ })).toHaveValue('');
    await expect(dialog.getByLabelText('API key')).toHaveValue('');
    await expect(dialog.getByRole('switch', { name: 'Enabled' })).toBeChecked();
    // There is no stored key to remove yet.
    await expect(dialog.queryByRole('checkbox', { name: 'Remove the stored key' })).not.toBeInTheDocument();
  },
};

export const AddsAProvider: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Add provider' }));
    await userEvent.type(dialog.getByRole('textbox', { name: /^Name/ }), 'ollama');
    await userEvent.type(dialog.getByRole('textbox', { name: /^Base URL/ }), 'http://localhost:11434/v1');
    await userEvent.type(dialog.getByLabelText('API key'), 'sk-secret');
    await userEvent.type(dialog.getByRole('textbox', { name: HEADERS }), 'X-Title: llm-router');
    await userEvent.click(dialog.getByRole('button', { name: 'Add provider' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(CREATE_ROUTE, {
        name: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        enabled: true,
        headers: { 'X-Title': 'llm-router' },
        apiKey: 'sk-secret',
      }),
    );
    await waitFor(() => expect(body.getByText('Added provider ollama')).toBeVisible());
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};

export const RejectsABadNameAndUrl: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Add provider' }));
    const name = dialog.getByRole('textbox', { name: /^Name/ });
    const url = dialog.getByRole('textbox', { name: /^Base URL/ });
    await userEvent.type(name, 'Open Router');
    await userEvent.type(url, 'localhost:11434');
    await userEvent.type(dialog.getByRole('textbox', { name: HEADERS }), 'no colon here');
    await userEvent.click(dialog.getByRole('button', { name: 'Add provider' }));

    await expect(await dialog.findByText(/^Use lowercase letters, digits, dots/)).toBeVisible();
    await expect(dialog.getByText('Enter an http:// or https:// URL')).toBeVisible();
    await expect(dialog.getByText('Write each header as Name: value')).toBeVisible();
    await expect(name).toBeInvalid();
    await expect(url).toBeInvalid();
    await expect(apiRequest).not.toHaveBeenCalledWith(CREATE_ROUTE, expect.anything());
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};

export const EditsAProviderAndKeepsItsKey: Story = {
  args: { provider: hostedProvider() },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Edit openrouter' }));
    // The name is the provider's identity, so an edit does not offer it.
    await expect(dialog.queryByRole('textbox', { name: /^Name/ })).not.toBeInTheDocument();
    await expect(dialog.getByRole('textbox', { name: /^Base URL/ })).toHaveValue('https://openrouter.ai/api/v1');
    // The stored key is never sent to the browser.
    await expect(dialog.getByLabelText('API key')).toHaveValue('');
    await expect(dialog.getByRole('textbox', { name: HEADERS })).toHaveValue('X-Title: llm-router');

    await userEvent.type(dialog.getByRole('textbox', { name: 'Display name (optional)' }), 'OpenRouter');
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, {
        baseUrl: 'https://openrouter.ai/api/v1',
        enabled: true,
        headers: { 'X-Title': 'llm-router' },
        displayName: 'OpenRouter',
        description: '',
      }),
    );
    await waitFor(() => expect(body.getByText('Saved provider openrouter')).toBeVisible());
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};

export const ReplacesTheStoredKey: Story = {
  args: { provider: hostedProvider() },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Edit openrouter' }));
    await userEvent.type(dialog.getByLabelText('API key'), 'sk-new');
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, expect.objectContaining({ apiKey: 'sk-new' })),
    );
  },
};

export const RemovesTheStoredKey: Story = {
  args: { provider: hostedProvider() },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Edit openrouter' }));
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Remove the stored key' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, expect.objectContaining({ apiKey: null })),
    );
  },
};

export const ShowsWhyTheServerRefused: Story = {
  parameters: {
    api: {
      ...routes,
      [CREATE_ROUTE]: apiError(HttpStatus.Conflict, ErrorCode.Conflict, 'Provider "ollama" already exists'),
    },
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Add provider' }));
    await userEvent.type(dialog.getByRole('textbox', { name: /^Name/ }), 'ollama');
    await userEvent.type(dialog.getByRole('textbox', { name: /^Base URL/ }), 'http://localhost:11434/v1');
    await userEvent.click(dialog.getByRole('button', { name: 'Add provider' }));
    const alert = within(await dialog.findByRole('alert'));
    await expect(alert.getByText('Could not save the provider')).toBeVisible();
    await expect(alert.getByText('Provider "ollama" already exists')).toBeVisible();
    // The dialog stays open with what was typed.
    await expect(args.onOpenChange).not.toHaveBeenCalled();
    await expect(dialog.getByRole('textbox', { name: /^Name/ })).toHaveValue('ollama');
  },
};

export const WhileSaving: Story = {
  parameters: { api: { ...routes, [CREATE_ROUTE]: pending() } },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Add provider' }));
    await userEvent.type(dialog.getByRole('textbox', { name: /^Name/ }), 'ollama');
    await userEvent.type(dialog.getByRole('textbox', { name: /^Base URL/ }), 'http://localhost:11434/v1');
    await userEvent.click(dialog.getByRole('button', { name: 'Add provider' }));
    await expect(await dialog.findByRole('button', { name: /Saving…/ })).toBeDisabled();
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};
