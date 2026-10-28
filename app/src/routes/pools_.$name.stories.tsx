import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { appRoutes, pool } from '@/storybook/fixtures';
import { apiError, apiRequest, pending } from '@/storybook/mock-api';

const POOL_ROUTE = 'GET /api/pools/qwen3';
const UPDATE_ROUTE = 'PATCH /api/pools/qwen3';
const DELETE_ROUTE = 'DELETE /api/pools/qwen3';

const meta = {
  title: 'routes/pools-name',
  parameters: { route: '/pools/qwen3', api: appRoutes() },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsThePool: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'qwen3', level: 1 })).toBeVisible();
    await expect(canvas.getByText('Qwen3 32B on both GPU boxes.')).toBeVisible();
    await expect(await canvas.findByRole('switch', { name: 'Enabled' })).toBeChecked();
    await expect(canvas.getByText('Least busy')).toBeVisible();
    await expect(canvas.getByText('Sticky')).toBeVisible();
    await expect(canvas.getByText('1.25× the average')).toBeVisible();
    await expect(await canvas.findByText('3 requests in flight')).toBeVisible();
    await expect(canvas.getByText(`${window.location.origin}/v1`)).toBeVisible();
    // The examples ask for the pool by its name.
    await expect(canvas.getByText(/model="qwen3"/)).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Pools', current: 'page' })).toBeVisible();
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const ShowsBoundedLoadOffWithoutAffinity: Story = {
  parameters: { api: { ...appRoutes(), [POOL_ROUTE]: () => pool({ affinity: 'none' }) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('None')).toBeVisible();
    await expect(canvas.getByText('Off')).toBeVisible();
  },
};

export const WhileLoading: Story = {
  parameters: { api: { ...appRoutes(), [POOL_ROUTE]: pending() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('status', { name: 'Loading' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Back to pools' })).toBeVisible();
  },
};

export const WhenThePoolDoesNotExist: Story = {
  parameters: {
    route: '/pools/missing',
    api: {
      ...appRoutes(),
      'GET /api/pools/missing': apiError(HttpStatus.NotFound, ErrorCode.NotFound, 'Unknown pool "missing"'),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = within(await canvas.findByRole('alert'));
    await expect(alert.getByText('Could not load pool')).toBeVisible();
    await expect(alert.getByText('Unknown pool "missing"')).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument();
  },
};

export const SwitchesThePoolOff: Story = {
  parameters: { api: { ...appRoutes(), [UPDATE_ROUTE]: () => pool({ enabled: false }) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('switch', { name: 'Enabled' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, { enabled: false }));
    await waitFor(() => expect(body.getByText('Disabled qwen3')).toBeVisible());
  },
};

export const DeletesThePoolAndGoesBack: Story = {
  parameters: { api: { ...appRoutes(), [DELETE_ROUTE]: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Delete qwen3' }));
    const confirm = within(await body.findByRole('alertdialog', { name: 'Delete pool qwen3?' }));
    await userEvent.click(confirm.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(DELETE_ROUTE, undefined));
    await expect(await canvas.findByRole('heading', { name: 'Pools', level: 1 })).toBeVisible();
  },
};
