import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { HOSTED_MODELS, hostedProvider, LOCAL_MODELS, localProvider, models, workspace } from '@/storybook/fixtures';
import { apiError, apiRequest } from '@/storybook/mock-api';
import { MemberModelsDialog } from './member-models-dialog.tsx';

const UPDATE_ROUTE = 'PATCH /api/workspaces/research';
const HOSTED_LISTING = 'GET /api/providers/openrouter/models';
const OPUS = 'anthropic/claude-opus-5-5';
const GPT = 'openai/gpt-5';

const routes = {
  'GET /api/providers/ollama/models': LOCAL_MODELS,
  [HOSTED_LISTING]: HOSTED_MODELS,
  [UPDATE_ROUTE]: () => workspace(),
};

const meta = {
  component: MemberModelsDialog,
  args: { open: true, onOpenChange: fn(), workspace: workspace(), provider: hostedProvider() },
  parameters: { api: routes },
} satisfies Meta<typeof MemberModelsDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const StartsFromTheStoredChoice: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Models of openrouter' }));
    await expect(dialog.getByText("Which of this provider's models Research serves.")).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: /Models/ })).toHaveTextContent(OPUS);
  },
};

export const AddsAModelToTheChoice: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Models of openrouter' }));
    await userEvent.click(dialog.getByRole('combobox', { name: /Models/ }));
    await userEvent.click(await body.findByRole('option', { name: GPT }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(dialog.getByRole('button', { name: 'Save models' }));

    // The whole member map is sent, so the other member is carried along unchanged.
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, {
        members: { ollama: { enabled: true }, openrouter: { enabled: true, models: [OPUS, GPT] } },
      }),
    );
    await waitFor(() => expect(body.getByText('Saved the models of openrouter')).toBeVisible());
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};

export const AnEmptyChoiceServesEveryModel: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Models of openrouter' }));
    await userEvent.click(dialog.getByRole('combobox', { name: /Models/ }));
    await userEvent.click(await body.findByRole('option', { name: OPUS }));
    await userEvent.keyboard('{Escape}');
    await expect(dialog.getByRole('combobox', { name: /Models/ })).toHaveTextContent('Every model');
    await userEvent.click(dialog.getByRole('button', { name: 'Save models' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, {
        members: { ollama: { enabled: true }, openrouter: { enabled: true } },
      }),
    );
  },
};

export const ForAMemberServingEveryModel: Story = {
  args: { provider: localProvider() },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Models of Ollama' }));
    await expect(dialog.getByRole('combobox', { name: /Models/ })).toHaveTextContent('Every model');
    await userEvent.click(dialog.getByRole('combobox', { name: /Models/ }));
    await expect(await body.findByRole('option', { name: 'qwen3:32b' })).toBeVisible();
    await expect(body.getByRole('option', { name: 'nomic-embed-text' })).toBeVisible();
  },
};

export const KeepsAStoredModelTheProviderNoLongerLists: Story = {
  parameters: { api: { ...routes, [HOSTED_LISTING]: () => models('openrouter', [GPT]) } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Models of openrouter' }));
    await userEvent.click(dialog.getByRole('combobox', { name: /Models/ }));
    await expect(await body.findByRole('option', { name: OPUS })).toBeChecked();
    await expect(await body.findByRole('option', { name: GPT })).not.toBeChecked();
  },
};

export const WhenTheProviderCannotBeListed: Story = {
  parameters: {
    api: {
      ...routes,
      [HOSTED_LISTING]: () => models('openrouter', [], [{ provider: 'openrouter', error: 'connect ECONNREFUSED' }]),
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Models of openrouter' }));
    // A warning, not a failure: the callout is a status, and the form still works.
    await expect(await dialog.findByText('Could not list the models of openrouter')).toBeVisible();
    await expect(dialog.getByText('connect ECONNREFUSED')).toBeVisible();
    await expect(dialog.queryByRole('alert')).not.toBeInTheDocument();
    // The stored choice is still there to keep or clear.
    await expect(dialog.getByRole('combobox', { name: /Models/ })).toHaveTextContent(OPUS);
  },
};

export const ShowsWhyTheServerRefused: Story = {
  parameters: {
    api: {
      ...routes,
      [UPDATE_ROUTE]: apiError(HttpStatus.NotFound, ErrorCode.NotFound, 'Workspace "research" not found'),
    },
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Models of openrouter' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Save models' }));
    const alert = within(await dialog.findByRole('alert'));
    await expect(alert.getByText('Could not save the models')).toBeVisible();
    await expect(alert.getByText('Workspace "research" not found')).toBeVisible();
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};
