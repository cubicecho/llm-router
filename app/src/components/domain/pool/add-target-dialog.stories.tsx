import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { HOSTED_MODELS, hostedProvider, LOCAL_MODELS, localProvider, pool } from '@/storybook/fixtures';
import { apiError, apiRequest } from '@/storybook/mock-api';
import { AddTargetDialog } from './add-target-dialog.tsx';

const UPDATE_ROUTE = 'PATCH /api/pools/qwen3';
const ONE_TARGET = pool({ targets: [{ provider: 'ollama', model: 'qwen3:32b' }] });

const routes = {
  'GET /api/providers': [localProvider(), hostedProvider()],
  'GET /api/providers/ollama/models': LOCAL_MODELS,
  'GET /api/providers/openrouter/models': HOSTED_MODELS,
  [UPDATE_ROUTE]: () => pool(),
};

const meta = {
  component: AddTargetDialog,
  args: { open: true, onOpenChange: fn(), pool: ONE_TARGET },
  parameters: { api: routes },
} satisfies Meta<typeof AddTargetDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AddsAModelOfAProvider: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Add a target to qwen3' }));
    await userEvent.click(dialog.getByRole('combobox', { name: /Provider/ }));
    await userEvent.click(await body.findByRole('option', { name: 'openrouter' }));
    await userEvent.click(await dialog.findByRole('combobox', { name: /Model/ }));
    await userEvent.click(await body.findByRole('option', { name: 'openai/gpt-5' }));
    // The choice has landed and the list has closed before the dialog is submitted.
    await waitFor(() => expect(dialog.getByRole('combobox', { name: /Model/ })).toHaveTextContent('openai/gpt-5'));
    await userEvent.click(await dialog.findByRole('button', { name: 'Add target' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, {
        targets: [
          { provider: 'ollama', model: 'qwen3:32b' },
          { provider: 'openrouter', model: 'openai/gpt-5' },
        ],
      }),
    );
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};

export const DoesNotOfferAModelThePoolAlreadyHas: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Add a target to qwen3' }));
    await userEvent.click(dialog.getByRole('combobox', { name: /Provider/ }));
    await userEvent.click(await body.findByRole('option', { name: 'Ollama' }));
    await userEvent.click(await dialog.findByRole('combobox', { name: /Model/ }));
    await expect(await body.findByRole('option', { name: 'nomic-embed-text' })).toBeVisible();
    await expect(body.queryByRole('option', { name: 'qwen3:32b' })).not.toBeInTheDocument();
  },
};

export const TakesATypedIdWhenTheProviderCannotBeListed: Story = {
  parameters: {
    api: {
      ...routes,
      'GET /api/providers/openrouter/models': apiError(
        HttpStatus.BadGateway,
        ErrorCode.UpstreamFailed,
        'Could not list the models of provider "openrouter"',
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Add a target to qwen3' }));
    await userEvent.click(dialog.getByRole('combobox', { name: /Provider/ }));
    await userEvent.click(await body.findByRole('option', { name: 'openrouter' }));
    await expect(await dialog.findByText('Could not list the models of openrouter')).toBeVisible();
    await userEvent.type(await dialog.findByRole('textbox', { name: /^Model id/ }), 'qwen/qwen3-32b');
    await userEvent.click(dialog.getByRole('button', { name: 'Add target' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, {
        targets: [
          { provider: 'ollama', model: 'qwen3:32b' },
          { provider: 'openrouter', model: 'qwen/qwen3-32b' },
        ],
      }),
    );
  },
};

export const AsksForAProviderFirst: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Add a target to qwen3' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Add target' }));
    await expect(await dialog.findByText('Pick the provider the model runs on')).toBeVisible();
    await expect(apiRequest).not.toHaveBeenCalledWith(UPDATE_ROUTE, expect.anything());
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};
