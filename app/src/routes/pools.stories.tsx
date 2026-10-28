import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { appRoutes } from '@/storybook/fixtures';
import { apiRequest, pending } from '@/storybook/mock-api';

const POOLS_ROUTE = 'GET /api/pools';
const DELETE_ROUTE = 'DELETE /api/pools/qwen3';

const meta = {
  title: 'routes/pools',
  parameters: { route: '/pools', api: appRoutes() },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const ListsThePools: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Pools', level: 1 })).toBeVisible();
    await expect(await canvas.findByRole('link', { name: /qwen3/ })).toBeVisible();
    await expect(canvas.getByText('Least busy · sticky · bounded at 1.25× · 2 targets')).toBeVisible();
    await expect(canvas.getByText('enabled')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Pools', current: 'page' })).toBeVisible();
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const OpensAPool: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('link', { name: /qwen3/ }));
    await expect(await canvas.findByRole('heading', { name: 'qwen3', level: 1 })).toBeVisible();
    await expect(await canvas.findByRole('heading', { name: 'Targets' })).toBeVisible();
  },
};

export const WhileLoading: Story = {
  parameters: { api: { ...appRoutes(), [POOLS_ROUTE]: pending() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('status', { name: 'Loading' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'New pool' })).toBeVisible();
  },
};

export const WithNoPools: Story = {
  parameters: { api: { ...appRoutes(), [POOLS_ROUTE]: () => [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('No pools yet')).toBeVisible();
    // One in the page header, one in the empty state.
    await expect(canvas.getAllByRole('button', { name: 'New pool' })).toHaveLength(2);
  },
};

export const DeletesAPool: Story = {
  parameters: { api: { ...appRoutes(), [DELETE_ROUTE]: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Delete qwen3' }));
    const confirm = within(await body.findByRole('alertdialog', { name: 'Delete pool qwen3?' }));
    await userEvent.click(confirm.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(DELETE_ROUTE, undefined));
    await waitFor(() => expect(body.getByText('Deleted pool qwen3')).toBeVisible());
  },
};
