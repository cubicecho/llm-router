import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { appRoutes, models, workspace } from '@/storybook/fixtures';
import { apiError, apiRequest, pending } from '@/storybook/mock-api';

const WORKSPACE_ROUTE = 'GET /api/workspaces/research';
const MODELS_ROUTE = 'GET /api/workspaces/research/models';
const UPDATE_ROUTE = 'PATCH /api/workspaces/research';
const DELETE_ROUTE = 'DELETE /api/workspaces/research';
const RENAMED = workspace({ name: 'Research Lab', slug: 'research-lab', path: '/w/research-lab/v1' });

const meta = {
  title: 'routes/workspaces-slug',
  parameters: { route: '/workspaces/research', api: appRoutes() },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsTheWorkspace: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Research', level: 1 })).toBeVisible();
    await expect(canvas.getByText('Models for the research agents.')).toBeVisible();
    await expect(await canvas.findByRole('switch', { name: 'Enabled' })).toBeChecked();
    await expect(await canvas.findByRole('switch', { name: 'Serve Ollama' })).toBeChecked();
    await expect(canvas.getByRole('switch', { name: 'Serve openrouter' })).toBeChecked();
    await expect(await canvas.findByText('openrouter/anthropic/claude-opus-5-5')).toBeVisible();
    await expect(canvas.getByText('3 models')).toBeVisible();
    await expect(canvas.getByText(`${window.location.origin}/w/research/v1`)).toBeVisible();
    // The examples ask for a model the workspace really serves.
    await expect(canvas.getByText(/model="ollama\/qwen3:32b"/)).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Workspaces', current: 'page' })).toBeVisible();
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const WhileLoading: Story = {
  parameters: { api: { ...appRoutes(), [WORKSPACE_ROUTE]: pending() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('status', { name: 'Loading' })).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument();
    // The way back does not wait for the answer.
    await expect(canvas.getByRole('link', { name: 'Back to workspaces' })).toBeVisible();
  },
};

export const WhenTheWorkspaceDoesNotExist: Story = {
  parameters: {
    route: '/workspaces/missing',
    api: {
      ...appRoutes(),
      'GET /api/workspaces/missing': apiError(HttpStatus.NotFound, ErrorCode.NotFound, 'Workspace "missing" not found'),
      'GET /api/workspaces/missing/models': apiError(
        HttpStatus.NotFound,
        ErrorCode.NotFound,
        'Workspace "missing" not found',
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = within(await canvas.findByRole('alert'));
    await expect(alert.getByText('Could not load workspace')).toBeVisible();
    await expect(alert.getByText('Workspace "missing" not found')).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'missing' })).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument();
  },
};

export const WithNoMembers: Story = {
  parameters: {
    api: {
      ...appRoutes(),
      // Functions, so the answers replace the default ones and are not merged into them.
      [WORKSPACE_ROUTE]: () => workspace({ members: {} }),
      [MODELS_ROUTE]: () => models('ollama', []),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('switch', { name: 'Serve Ollama' })).not.toBeChecked();
    await expect(canvas.getByRole('switch', { name: 'Serve openrouter' })).not.toBeChecked();
    await expect(await canvas.findByText('This workspace serves no models. Switch on a provider above.')).toBeVisible();
    // With nothing served, the examples fall back to a placeholder.
    await expect(canvas.getByText(/model="<provider>\/<model>"/)).toBeVisible();
  },
};

export const SwitchesTheWorkspaceOff: Story = {
  parameters: { api: { ...appRoutes(), [UPDATE_ROUTE]: () => workspace({ enabled: false }) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('switch', { name: 'Enabled' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, { enabled: false }));
    await waitFor(() => expect(body.getByText('Disabled Research')).toBeVisible());
  },
};

export const SwitchesAMemberOff: Story = {
  parameters: { api: { ...appRoutes(), [UPDATE_ROUTE]: () => workspace() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('switch', { name: 'Serve Ollama' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, {
        members: {
          ollama: { enabled: false },
          openrouter: { enabled: true, models: ['anthropic/claude-opus-5-5'] },
        },
      }),
    );
  },
};

export const FollowsARenameToTheNewUrl: Story = {
  parameters: {
    api: {
      ...appRoutes(),
      [UPDATE_ROUTE]: () => RENAMED,
      'GET /api/workspaces/research-lab': () => RENAMED,
      'GET /api/workspaces/research-lab/models': () => models('ollama', ['qwen3:32b']),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Edit' }));
    const dialog = within(await body.findByRole('dialog', { name: 'Edit Research' }));
    await userEvent.type(dialog.getByRole('textbox', { name: /^Workspace name/ }), ' Lab');
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }));
    await expect(await canvas.findByRole('heading', { name: 'Research Lab', level: 1 })).toBeVisible();
    await expect(await canvas.findByText(`${window.location.origin}/w/research-lab/v1`)).toBeVisible();
  },
};

export const DeletesTheWorkspaceAndGoesBack: Story = {
  parameters: { api: { ...appRoutes(), [DELETE_ROUTE]: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Delete Research' }));
    const confirm = within(await body.findByRole('alertdialog', { name: 'Delete workspace Research?' }));
    await userEvent.click(confirm.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(DELETE_ROUTE, undefined));
    await expect(await canvas.findByRole('heading', { name: 'Workspaces', level: 1 })).toBeVisible();
  },
};
