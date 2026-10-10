import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { appRoutes, localProvider } from '@/storybook/fixtures';
import { apiError, apiRequest, pending } from '@/storybook/mock-api';

const PROVIDERS_ROUTE = 'GET /api/providers';
const DELETE_ROUTE = 'DELETE /api/providers/ollama';

const meta = {
  title: 'routes/index',
  parameters: { route: '/', api: appRoutes() },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const ListsTheProviders: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Providers', level: 1 })).toBeVisible();
    await expect(await canvas.findByRole('link', { name: /Ollama/ })).toBeVisible();
    await expect(canvas.getByText('http://localhost:11434/v1')).toBeVisible();
    await expect(canvas.getByRole('link', { name: /openrouter/ })).toBeVisible();
    // Only the hosted provider has a key, and neither key is on the page.
    await expect(canvas.getAllByText('key set')).toHaveLength(1);
    await expect(canvas.getByRole('heading', { name: 'Connect a client' })).toBeVisible();
    await expect(canvas.getByText(`${window.location.origin}/v1`)).toBeVisible();
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const OpensAProvider: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('link', { name: /Ollama/ }));
    await expect(await canvas.findByRole('heading', { name: 'Ollama', level: 1 })).toBeVisible();
    await expect(await canvas.findByRole('heading', { name: 'Overview' })).toBeVisible();
  },
};

export const WhileLoading: Story = {
  parameters: { api: { ...appRoutes(), [PROVIDERS_ROUTE]: pending() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('status', { name: 'Loading' })).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'All providers' })).not.toBeInTheDocument();
    // Adding one does not wait for the list.
    await expect(canvas.getByRole('button', { name: 'Add provider' })).toBeVisible();
  },
};

export const WithNoProviders: Story = {
  parameters: { api: { ...appRoutes(), [PROVIDERS_ROUTE]: () => [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('No providers yet')).toBeVisible();
    await expect(canvas.getAllByRole('button', { name: 'Add provider' })).toHaveLength(2);
    await expect(canvas.queryByRole('heading', { name: 'All providers' })).not.toBeInTheDocument();
  },
};

export const WhenTheProvidersFail: Story = {
  parameters: {
    api: {
      ...appRoutes(),
      [PROVIDERS_ROUTE]: apiError(HttpStatus.InternalServerError, ErrorCode.Internal, 'providers are unreadable'),
    },
  },
  play: async ({ canvasElement }) => {
    const alert = within(await within(canvasElement).findByRole('alert'));
    await expect(alert.getByText('Could not load providers')).toBeVisible();
    await expect(alert.getByText('providers are unreadable')).toBeVisible();
  },
};

export const OpensTheAddDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole('link', { name: /Ollama/ });
    await userEvent.click(canvas.getByRole('button', { name: 'Add provider' }));
    await expect(await body.findByRole('dialog', { name: 'Add provider' })).toBeVisible();
  },
};

export const OpensTheEditDialogOfARow: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Edit Ollama' }));
    const dialog = within(await body.findByRole('dialog', { name: 'Edit ollama' }));
    await expect(dialog.getByRole('textbox', { name: /^Base URL/ })).toHaveValue('http://localhost:11434/v1');
  },
};

export const DeletesAProviderAfterConfirming: Story = {
  parameters: { api: { ...appRoutes(), [DELETE_ROUTE]: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Delete Ollama' }));
    const confirm = within(await body.findByRole('alertdialog', { name: 'Delete provider Ollama?' }));
    await expect(apiRequest).not.toHaveBeenCalledWith(DELETE_ROUTE, undefined);
    await userEvent.click(confirm.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(DELETE_ROUTE, undefined));
    await waitFor(() => expect(body.getByText('Deleted provider Ollama')).toBeVisible());
  },
};

export const MarksADisabledProvider: Story = {
  parameters: { api: { ...appRoutes(), [PROVIDERS_ROUTE]: () => [localProvider({ enabled: false })] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('disabled')).toBeVisible();
    await expect(canvas.queryByText('enabled')).not.toBeInTheDocument();
  },
};
