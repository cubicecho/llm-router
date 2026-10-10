import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Button } from '@/components/ui/button';
import { LOCAL_MODELS, models } from '@/storybook/fixtures';
import { ModelsCard } from './models-card.tsx';

const loaded = { isPending: false, isError: false, error: null, refetch: fn() };

const meta = {
  component: ModelsCard,
  args: {
    title: 'Models',
    description: 'What the provider lists right now.',
    emptyTitle: 'The provider lists no models.',
    query: { ...loaded, data: LOCAL_MODELS },
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModelsCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ListsTheModelsByTheIdAClientAsksFor: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Models', level: 2 })).toBeVisible();
    await expect(canvas.getByText('2 models')).toBeVisible();
    await expect(canvas.getByText('ollama/qwen3:32b')).toBeVisible();
    await expect(canvas.getByText('ollama/nomic-embed-text')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Copy ollama/qwen3:32b' })).toBeVisible();
  },
};

export const WithAnAction: Story = {
  args: { actionSlot: <Button variant="outline" size="sm" content="Refresh" /> },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Refresh' })).toBeVisible();
  },
};

export const WhileLoading: Story = {
  args: { query: { ...loaded, isPending: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status', { name: 'Loading' })).toBeVisible();
    await expect(canvas.queryByText(/models?$/)).not.toBeInTheDocument();
  },
};

export const WithNoModels: Story = {
  args: { query: { ...loaded, data: models('ollama', []) } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('The provider lists no models.')).toBeVisible();
  },
};

export const WhenTheListingFails: Story = {
  args: { query: { ...loaded, isError: true, error: new Error('Provider "ollama" not found') } },
  play: async ({ args, canvasElement }) => {
    const alert = within(within(canvasElement).getByRole('alert'));
    await expect(alert.getByText('Could not load models')).toBeVisible();
    await expect(alert.getByText('Provider "ollama" not found')).toBeVisible();
    await userEvent.click(alert.getByRole('button', { name: 'Try again' }));
    await expect(args.query.refetch).toHaveBeenCalled();
  },
};

export const NamesAProviderThatCouldNotBeListed: Story = {
  args: {
    query: {
      ...loaded,
      data: models('ollama', ['qwen3:32b'], [{ provider: 'openrouter', error: 'connect ECONNREFUSED' }]),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Could not list openrouter')).toBeVisible();
    await expect(canvas.getByText('connect ECONNREFUSED')).toBeVisible();
    // The providers that did answer are still listed.
    await expect(canvas.getByText('ollama/qwen3:32b')).toBeVisible();
    await expect(canvas.getByText('1 model')).toBeVisible();
  },
};

export const WithOnlySkippedProviders: Story = {
  args: { query: { ...loaded, data: models('ollama', [], [{ provider: 'ollama', error: 'timed out' }]) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Could not list ollama')).toBeVisible();
    // A failure is not "no models".
    await expect(canvas.queryByText('The provider lists no models.')).not.toBeInTheDocument();
  },
};
