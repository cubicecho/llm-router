import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { appRoutes, workspace } from '@/storybook/fixtures';
import { apiError, apiRequest, pending } from '@/storybook/mock-api';

const WORKSPACES_ROUTE = 'GET /api/workspaces';
const DELETE_ROUTE = 'DELETE /api/workspaces/research';

const meta = {
  title: 'routes/workspaces',
  parameters: { route: '/workspaces', api: appRoutes() },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const ListsTheWorkspaces: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Workspaces', level: 1 })).toBeVisible();
    await expect(await canvas.findByRole('link', { name: /Research/ })).toBeVisible();
    await expect(canvas.getByText('/w/research/v1 · 2 providers')).toBeVisible();
    await expect(await canvas.findByText('12 requests · 250.3K in · 40.1K out')).toBeVisible();
    await expect(canvas.getByText('enabled')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Workspaces', current: 'page' })).toBeVisible();
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const OpensAWorkspace: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('link', { name: /Research/ }));
    await expect(await canvas.findByRole('heading', { name: 'Research', level: 1 })).toBeVisible();
    await expect(await canvas.findByRole('heading', { name: 'Overview' })).toBeVisible();
  },
};

export const WhileLoading: Story = {
  parameters: { api: { ...appRoutes(), [WORKSPACES_ROUTE]: pending() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('status', { name: 'Loading' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'New workspace' })).toBeVisible();
  },
};

export const WithNoWorkspaces: Story = {
  parameters: { api: { ...appRoutes(), [WORKSPACES_ROUTE]: () => [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('No workspaces yet')).toBeVisible();
    await expect(canvas.getAllByRole('button', { name: 'New workspace' })).toHaveLength(2);
  },
};

export const WhenTheWorkspacesFail: Story = {
  parameters: {
    api: {
      ...appRoutes(),
      [WORKSPACES_ROUTE]: apiError(HttpStatus.InternalServerError, ErrorCode.Internal, 'workspaces are unreadable'),
    },
  },
  play: async ({ canvasElement }) => {
    const alert = within(await within(canvasElement).findByRole('alert'));
    await expect(alert.getByText('Could not load workspaces')).toBeVisible();
    await expect(alert.getByText('workspaces are unreadable')).toBeVisible();
  },
};

export const CountsOnlyTheMembersThatAreOn: Story = {
  parameters: {
    api: {
      ...appRoutes(),
      [WORKSPACES_ROUTE]: () => [
        workspace({ enabled: false, members: { ollama: { enabled: true }, openrouter: { enabled: false } } }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('/w/research/v1 · 1 provider')).toBeVisible();
    await expect(canvas.getByText('disabled')).toBeVisible();
  },
};

export const OpensTheCreateDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole('link', { name: /Research/ });
    await userEvent.click(canvas.getByRole('button', { name: 'New workspace' }));
    await expect(await body.findByRole('dialog', { name: 'New workspace' })).toBeVisible();
  },
};

export const OpensTheEditDialogOfARow: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Edit Research' }));
    const dialog = within(await body.findByRole('dialog', { name: 'Edit Research' }));
    await expect(dialog.getByRole('textbox', { name: /^Workspace name/ })).toHaveValue('Research');
  },
};

export const DeletesAWorkspaceAfterConfirming: Story = {
  parameters: { api: { ...appRoutes(), [DELETE_ROUTE]: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Delete Research' }));
    const confirm = within(await body.findByRole('alertdialog', { name: 'Delete workspace Research?' }));
    await userEvent.click(confirm.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(DELETE_ROUTE, undefined));
    await waitFor(() => expect(body.getByText('Deleted workspace Research')).toBeVisible());
  },
};
