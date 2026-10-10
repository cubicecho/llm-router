import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { usage } from '@/storybook/fixtures';
import { apiError, pending } from '@/storybook/mock-api';
import { UsageCard } from './usage-card.tsx';

const USAGE_ROUTE = 'GET /api/usage';
/** The totals row and the fixture's two models. */
const ROW_COUNT = 3;

const meta = {
  component: UsageCard,
  args: { provider: 'ollama' },
  parameters: { api: { [USAGE_ROUTE]: usage() } },
  decorators: [
    (Story) => (
      <div className="max-w-3xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UsageCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsTheTotalsAndEachModel: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Usage', level: 2 })).toBeVisible();
    // The totals first, then one row per model.
    const rows = await canvas.findAllByRole('listitem');
    await expect(rows).toHaveLength(ROW_COUNT);
    await expect(rows[0]).toHaveTextContent('All models42 requests · 1.3M in · 340.1K out');
    await expect(rows[1]).toHaveTextContent('nomic-embed-text2 requests · 300 in · 0 out');
    await expect(rows[2]).toHaveTextContent('qwen3:32b40 requests · 1.3M in · 340.1K out');
  },
};

export const BeforeAnyRequest: Story = {
  args: { provider: 'openrouter' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('No requests yet.')).toBeVisible();
    await expect(canvas.queryByText('All models')).not.toBeInTheDocument();
  },
};

export const WhileLoading: Story = {
  parameters: { api: { [USAGE_ROUTE]: pending() } },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('status', { name: 'Loading' })).toBeVisible();
  },
};

export const WhenTheCountsCannotBeRead: Story = {
  parameters: {
    api: { [USAGE_ROUTE]: apiError(HttpStatus.InternalServerError, ErrorCode.Internal, 'usage is unreadable') },
  },
  play: async ({ canvasElement }) => {
    const alert = within(await within(canvasElement).findByRole('alert'));
    await expect(alert.getByText('Could not load usage')).toBeVisible();
    await expect(alert.getByText('usage is unreadable')).toBeVisible();
  },
};
