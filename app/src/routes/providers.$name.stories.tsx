import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { appRoutes, hostedProvider, localProvider, models } from '@/storybook/fixtures';
import { apiError, apiRequest, pending } from '@/storybook/mock-api';

const PROVIDER_ROUTE = 'GET /api/providers/ollama';
const MODELS_ROUTE = 'GET /api/providers/ollama/models';
const UPDATE_ROUTE = 'PATCH /api/providers/ollama';
const DELETE_ROUTE = 'DELETE /api/providers/ollama';

const meta = {
  title: 'routes/providers-name',
  parameters: { route: '/providers/ollama', api: appRoutes() },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsTheProvider: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Ollama', level: 1 })).toBeVisible();
    await expect(canvas.getByText('Models on the workstation.')).toBeVisible();
    await expect(await canvas.findByText('http://localhost:11434/v1')).toBeVisible();
    await expect(canvas.getByText('none')).toBeVisible();
    await expect(canvas.getByRole('switch', { name: 'Enabled' })).toBeChecked();
    await expect(await canvas.findByText('ollama/qwen3:32b')).toBeVisible();
    await expect(canvas.getByText('2 models')).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Usage', level: 2 })).toBeVisible();
    await expect(await canvas.findByText('40 requests · 1.3M in · 340.1K out')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Providers', current: 'page' })).toBeVisible();
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const ShowsThatAKeyIsSetWithoutShowingIt: Story = {
  parameters: { route: '/providers/openrouter' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'openrouter', level: 1 })).toBeVisible();
    await expect(await canvas.findByText('set')).toBeVisible();
    await expect(canvas.getByText('X-Title: llm-router')).toBeVisible();
    await expect(await canvas.findByText('openrouter/anthropic/claude-opus-5-5')).toBeVisible();
    await expect(canvas.getByText('No requests yet.')).toBeVisible();
  },
};

export const WhileLoading: Story = {
  parameters: { api: { ...appRoutes(), [PROVIDER_ROUTE]: pending() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('status', { name: 'Loading' })).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument();
    // The way back does not wait for the answer.
    await expect(canvas.getByRole('link', { name: 'Back to providers' })).toBeVisible();
  },
};

export const WhenTheProviderDoesNotExist: Story = {
  parameters: {
    route: '/providers/missing',
    api: {
      ...appRoutes(),
      'GET /api/providers/missing': apiError(HttpStatus.NotFound, ErrorCode.NotFound, 'Provider "missing" not found'),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = within(await canvas.findByRole('alert'));
    await expect(alert.getByText('Could not load provider')).toBeVisible();
    await expect(alert.getByText('Provider "missing" not found')).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument();
  },
};

export const WhenTheProviderCannotBeListed: Story = {
  parameters: {
    api: {
      ...appRoutes(),
      [MODELS_ROUTE]: () => models('ollama', [], [{ provider: 'ollama', error: 'connect ECONNREFUSED' }]),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Could not list ollama')).toBeVisible();
    await expect(canvas.getByText('connect ECONNREFUSED')).toBeVisible();
  },
};

export const WithNoModels: Story = {
  parameters: { api: { ...appRoutes(), [MODELS_ROUTE]: () => models('ollama', []) } },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('The provider lists no models.')).toBeVisible();
  },
};

export const ADisabledProviderListsNothing: Story = {
  parameters: { api: { ...appRoutes(), [PROVIDER_ROUTE]: () => localProvider({ enabled: false }) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('switch', { name: 'Enabled' })).not.toBeChecked();
    await expect(canvas.getByText('Enable the provider to list and serve its models.')).toBeVisible();
    await expect(apiRequest).not.toHaveBeenCalledWith(MODELS_ROUTE, undefined);
  },
};

export const RefreshesTheModels: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('ollama/qwen3:32b');
    apiRequest.mockClear();
    await userEvent.click(canvas.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(MODELS_ROUTE, undefined));
  },
};

export const SwitchesTheProviderOff: Story = {
  parameters: { api: { ...appRoutes(), [UPDATE_ROUTE]: () => localProvider({ enabled: false }) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('switch', { name: 'Enabled' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, { enabled: false }));
    await waitFor(() => expect(body.getByText('Disabled Ollama')).toBeVisible());
  },
};

export const OpensTheEditDialog: Story = {
  parameters: {
    route: '/providers/openrouter',
    api: { ...appRoutes(), 'GET /api/providers/openrouter': hostedProvider },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Edit' }));
    const dialog = within(await body.findByRole('dialog', { name: 'Edit openrouter' }));
    await expect(dialog.getByRole('checkbox', { name: 'Remove the stored key' })).not.toBeChecked();
  },
};

export const DeletesTheProviderAndGoesBack: Story = {
  parameters: { api: { ...appRoutes(), [DELETE_ROUTE]: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Delete Ollama' }));
    const confirm = within(await body.findByRole('alertdialog', { name: 'Delete provider Ollama?' }));
    await userEvent.click(confirm.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(DELETE_ROUTE, undefined));
    await expect(await canvas.findByRole('heading', { name: 'Providers', level: 1 })).toBeVisible();
  },
};
