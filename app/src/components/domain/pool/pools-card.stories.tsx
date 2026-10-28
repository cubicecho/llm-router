import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { pool, workspace } from '@/storybook/fixtures';
import { apiRequest } from '@/storybook/mock-api';
import { PoolsCard } from './pools-card.tsx';

const POOLS_ROUTE = 'GET /api/pools';
const UPDATE_ROUTE = 'PATCH /api/workspaces/research';

const routes = {
  [POOLS_ROUTE]: [pool(), pool({ name: 'embed', enabled: false, affinity: 'none', strategy: 'round-robin' })],
  [UPDATE_ROUTE]: () => workspace({ pools: ['qwen3'] }),
};

const meta = {
  component: PoolsCard,
  args: { workspace: workspace() },
  parameters: { api: routes },
  decorators: [
    (Story) => (
      <div className="max-w-3xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PoolsCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsEveryPoolWithHowItPlacesRequests: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Pools', level: 2 })).toBeVisible();
    await expect(await canvas.findByRole('switch', { name: 'Serve qwen3' })).not.toBeChecked();
    await expect(canvas.getByText('Least busy · sticky · bounded at 1.25× · 2 targets')).toBeVisible();
    await expect(canvas.getByText('Round robin · 2 targets')).toBeVisible();
    await expect(canvas.getByText('disabled')).toBeVisible();
  },
};

export const ServesAPool: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('switch', { name: 'Serve qwen3' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, { pools: ['qwen3'] }));
  },
};

export const StopsServingAPool: Story = {
  args: { workspace: workspace({ pools: ['qwen3', 'embed'] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('switch', { name: 'Serve qwen3' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, { pools: ['embed'] }));
  },
};

export const WithNoPools: Story = {
  parameters: { api: { ...routes, [POOLS_ROUTE]: () => [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('No pools yet.')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Add a pool' })).toBeVisible();
  },
};
