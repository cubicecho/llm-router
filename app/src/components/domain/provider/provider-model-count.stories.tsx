import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { LOCAL_MODELS, localProvider, models } from '@/storybook/fixtures';
import { apiError, apiRequest, pending } from '@/storybook/mock-api';
import { ProviderModelCount } from './provider-model-count.tsx';

const MODELS_ROUTE = 'GET /api/providers/ollama/models';

const meta = {
  component: ProviderModelCount,
  args: { provider: localProvider() },
  parameters: { api: { [MODELS_ROUTE]: LOCAL_MODELS } },
} satisfies Meta<typeof ProviderModelCount>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CountsTheModels: Story = {
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('2 models')).toBeVisible();
  },
};

export const WhileChecking: Story = {
  parameters: { api: { [MODELS_ROUTE]: pending() } },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('status')).toHaveTextContent('Checking models…');
  },
};

export const WithNoModels: Story = {
  parameters: { api: { [MODELS_ROUTE]: () => models('ollama', []) } },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('0 models')).toBeVisible();
  },
};

export const WhenTheProviderCannotBeListed: Story = {
  parameters: {
    api: { [MODELS_ROUTE]: () => models('ollama', [], [{ provider: 'ollama', error: 'connect ECONNREFUSED' }]) },
  },
  play: async ({ canvasElement }) => {
    const badge = await within(canvasElement).findByText('listing failed');
    await expect(badge).toBeVisible();
    // The reason is on hover here and in full on the provider's page.
    await expect(badge.closest('[title]')).toHaveAttribute('title', 'connect ECONNREFUSED');
  },
};

export const WhenTheRouterFails: Story = {
  parameters: {
    api: { [MODELS_ROUTE]: apiError(HttpStatus.InternalServerError, ErrorCode.Internal, 'providers are unreadable') },
  },
  play: async ({ canvasElement }) => {
    const badge = await within(canvasElement).findByText('listing failed');
    await expect(badge.closest('[title]')).toHaveAttribute('title', 'providers are unreadable');
  },
};

export const ADisabledProviderIsNotAsked: Story = {
  args: { provider: localProvider({ enabled: false }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toBeEmptyDOMElement();
    await expect(apiRequest).not.toHaveBeenCalledWith(MODELS_ROUTE, undefined);
  },
};
