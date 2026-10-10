import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { LOCAL_USAGE, usage } from '@/storybook/fixtures';
import { apiError, pending } from '@/storybook/mock-api';
import { UsageCard } from './usage-card.tsx';

const USAGE_ROUTE = 'GET /api/usage';
/** The totals row and the fixture's two models. */
const MODEL_ROW_COUNT = 3;
/** The fixture's two days. */
const DAY_ROW_COUNT = 2;
/** How many days a card lists before it is asked for all of them. */
const RECENT_DAY_COUNT = 14;
/** More days than a card lists at first: the whole of September. */
const MONTH_DAY_COUNT = 30;
const DAY_DIGITS = 2;

/**
 * Builds a provider that was called once a day through September.
 *
 * @returns The local provider's usage with thirty days, newest first.
 */
function aMonthOfUsage() {
  const days = Array.from({ length: MONTH_DAY_COUNT }, (_, index) => ({
    day: `2026-09-${String(MONTH_DAY_COUNT - index).padStart(DAY_DIGITS, '0')}`,
    requests: 1,
    inputTokens: 100,
    outputTokens: 10,
  }));
  return usage({ providers: [{ ...LOCAL_USAGE, days }] });
}

const meta = {
  component: UsageCard,
  args: { scope: { provider: 'ollama' } },
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

export const ShowsTheTotalsEachModelAndEachDay: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Usage', level: 2 })).toBeVisible();
    // The totals first, then one row per model.
    const models = within(await canvas.findByRole('list', { name: 'Usage by model' })).getAllByRole('listitem');
    await expect(models).toHaveLength(MODEL_ROW_COUNT);
    await expect(models[0]).toHaveTextContent('All models42 requests · 1.3M in · 340.1K out');
    await expect(models[1]).toHaveTextContent('nomic-embed-text2 requests · 300 in · 0 out');
    await expect(models[2]).toHaveTextContent('qwen3:32b40 requests · 1.3M in · 340.1K out');
    // Then the days, newest first.
    const days = within(canvas.getByRole('list', { name: 'Usage by day' })).getAllByRole('listitem');
    await expect(days).toHaveLength(DAY_ROW_COUNT);
    await expect(days[0]).toHaveTextContent('Oct 9, 202630 requests · 1M in · 300K out');
    await expect(days[1]).toHaveTextContent('Oct 8, 202612 requests · 250.3K in · 40.1K out');
    // Two days fit, so there is nothing more to ask for.
    await expect(canvas.queryByRole('button', { name: /^Show all/ })).not.toBeInTheDocument();
  },
};

export const OfAWorkspace: Story = {
  args: { scope: { workspace: 'research' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const models = within(await canvas.findByRole('list', { name: 'Usage by model' })).getAllByRole('listitem');
    await expect(models[0]).toHaveTextContent('All models12 requests · 250.3K in · 40.1K out');
    // A workspace's models go by the id a client asks for.
    await expect(models[1]).toHaveTextContent('ollama/qwen3:32b12 requests · 250.3K in · 40.1K out');
    const days = within(canvas.getByRole('list', { name: 'Usage by day' })).getAllByRole('listitem');
    await expect(days[0]).toHaveTextContent('Oct 8, 202612 requests · 250.3K in · 40.1K out');
  },
};

export const ShowsTheRecentDaysUntilAskedForAll: Story = {
  parameters: { api: { [USAGE_ROUTE]: aMonthOfUsage } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const days = within(await canvas.findByRole('list', { name: 'Usage by day' }));
    await expect(days.getAllByRole('listitem')).toHaveLength(RECENT_DAY_COUNT);
    await expect(days.getAllByRole('listitem')[0]).toHaveTextContent('Sep 30, 2026');

    await userEvent.click(canvas.getByRole('button', { name: 'Show all 30 days' }));
    await expect(days.getAllByRole('listitem')).toHaveLength(MONTH_DAY_COUNT);
    await expect(days.getByText('Sep 1, 2026')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Show the last 14 days' }));
    await expect(days.getAllByRole('listitem')).toHaveLength(RECENT_DAY_COUNT);
  },
};

export const WithNoDaysKept: Story = {
  parameters: { api: { [USAGE_ROUTE]: () => usage({ providers: [{ ...LOCAL_USAGE, days: [] }] }) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Counts from before the router kept days, or older than it keeps them: the totals stand alone.
    await expect(await canvas.findByText('All models')).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'By day' })).not.toBeInTheDocument();
  },
};

export const BeforeAnyRequest: Story = {
  args: { scope: { provider: 'openrouter' } },
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
