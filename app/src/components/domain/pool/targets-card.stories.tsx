import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { POOL_LOAD, pool } from '@/storybook/fixtures';
import { apiRequest } from '@/storybook/mock-api';
import { TargetsCard } from './targets-card.tsx';

const LOAD_ROUTE = 'GET /api/pools/qwen3/load';
const UPDATE_ROUTE = 'PATCH /api/pools/qwen3';

const routes = {
  [LOAD_ROUTE]: POOL_LOAD,
  [UPDATE_ROUTE]: () => pool(),
};

const meta = {
  component: TargetsCard,
  args: { pool: pool() },
  parameters: { api: routes },
  decorators: [
    (Story) => (
      <div className="max-w-3xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TargetsCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsEachTargetWithItsLoad: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const targets = within(canvas.getByRole('list', { name: 'Targets' }));
    await expect(targets.getByText('ollama/qwen3:32b')).toBeVisible();
    await expect(await targets.findByText('3 requests in flight')).toBeVisible();
    await expect(targets.getByText('0 requests in flight')).toBeVisible();
  },
};

export const MarksATargetThePoolSkips: Story = {
  parameters: {
    api: {
      ...routes,
      [LOAD_ROUTE]: () => ({
        targets: [
          POOL_LOAD.targets[0],
          { provider: 'openrouter', model: 'qwen/qwen3-32b', inFlight: 0, available: false },
        ],
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Its provider is disabled or gone, so the pool skips it.')).toBeVisible();
    await expect(canvas.getByText('disabled')).toBeVisible();
  },
};

export const RemovesATargetAfterAsking: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove openrouter/qwen/qwen3-32b' }));
    const confirm = within(
      await body.findByRole('alertdialog', { name: 'Remove openrouter/qwen/qwen3-32b from qwen3?' }),
    );
    await userEvent.click(confirm.getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, { targets: [{ provider: 'ollama', model: 'qwen3:32b' }] }),
    );
  },
};

export const WithNoTargets: Story = {
  args: { pool: pool({ targets: [] }) },
  parameters: { api: { ...routes, [LOAD_ROUTE]: () => ({ targets: [] }) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No targets yet. Requests for this pool answer 503 until it has one.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Add target' })).toBeVisible();
  },
};
