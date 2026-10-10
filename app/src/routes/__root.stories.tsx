import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { getToken, setToken } from '@/lib/auth';
import { appRoutes, routerStatus } from '@/storybook/fixtures';
import { type ApiRoutes, apiError } from '@/storybook/mock-api';

const TOKEN = 'correct-token';
const LOCK_LABEL = 'Lock (forget the stored token)';

/** A router with auth on: every route answers 401 until the stored token is the right one. */
function lockedRoutes(): ApiRoutes {
  const open: ApiRoutes = appRoutes();
  const locked: ApiRoutes = {};
  for (const [key, answer] of Object.entries(open)) {
    locked[key] = () =>
      getToken() === TOKEN ? answer : apiError(HttpStatus.Unauthorized, ErrorCode.Unauthenticated, 'Token required');
  }
  return locked;
}

const meta = {
  title: 'routes/root',
  parameters: { route: '/', api: appRoutes() },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsTheAppFrame: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('navigation', { name: 'Main' })).toBeVisible();
    for (const name of ['Providers', 'Workspaces', 'Settings']) {
      await expect(canvas.getByRole('link', { name })).toBeVisible();
    }
    // The status is drawn in the sidebar and in the narrow-screen bar; one of the two is on screen.
    await waitFor(() =>
      expect(canvas.getAllByText('2 providers · 1 workspace').some((line) => line.checkVisibility())).toBe(true),
    );
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const WithAuthOffThereIsNoTokenToForget: Story = {
  parameters: { api: { ...appRoutes(), 'GET /api/status': routerStatus({ authEnabled: false }) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Providers' })).toBeVisible();
    await waitFor(() =>
      expect(canvas.getAllByText('2 providers · 1 workspace').some((line) => line.checkVisibility())).toBe(true),
    );
    await expect(canvas.queryByRole('button', { name: LOCK_LABEL })).not.toBeInTheDocument();
  },
};

export const NavigatesWithTheSidebar: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('link', { name: 'Providers', current: 'page' })).toBeVisible();
    await userEvent.click(canvas.getByRole('link', { name: 'Workspaces' }));
    await expect(await canvas.findByRole('heading', { name: 'Workspaces' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Workspaces', current: 'page' })).toBeVisible();
    await expect(canvas.queryByRole('link', { name: 'Providers', current: 'page' })).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('link', { name: 'Settings' }));
    await expect(await canvas.findByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Settings', current: 'page' })).toBeVisible();
  },
};

export const AsksForTheTokenAndUnlocks: Story = {
  parameters: { api: lockedRoutes() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Authentication required' })).toBeVisible();
    await expect(canvas.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();

    await userEvent.type(canvas.getByLabelText('Token'), TOKEN);
    await userEvent.click(canvas.getByRole('button', { name: 'Unlock' }));
    await expect(await canvas.findByRole('heading', { name: 'Providers' })).toBeVisible();
    await expect(await canvas.findByText('Ollama')).toBeVisible();
  },
};

export const LocksAgain: Story = {
  parameters: { api: lockedRoutes() },
  beforeEach: () => {
    setToken(TOKEN);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [lock] = await canvas.findAllByRole('button', { name: LOCK_LABEL });
    await userEvent.click(lock as HTMLElement);
    await expect(await canvas.findByRole('heading', { name: 'Authentication required' })).toBeVisible();
    await expect(getToken()).toBeNull();
  },
};
