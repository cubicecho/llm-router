import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { workspace } from '@/storybook/fixtures';
import { apiError, apiRequest, pending } from '@/storybook/mock-api';
import { WorkspaceDialog } from './workspace-dialog.tsx';

const CREATE_ROUTE = 'POST /api/workspaces';
const UPDATE_ROUTE = 'PATCH /api/workspaces/research';
const BACKEND = workspace({ name: 'Backend', slug: 'backend', path: '/w/backend/v1', members: {} });

const routes = {
  // A function, so the answer replaces the meta's and is not merged into it.
  [CREATE_ROUTE]: () => BACKEND,
  [UPDATE_ROUTE]: () => workspace(),
};

const meta = {
  component: WorkspaceDialog,
  args: { open: true, onOpenChange: fn(), onSaved: fn() },
  parameters: { api: routes },
} satisfies Meta<typeof WorkspaceDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const StartsEmpty: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'New workspace' }));
    await expect(dialog.getByRole('textbox', { name: /^Workspace name/ })).toHaveValue('');
    await expect(dialog.getByText('Enter a name to generate the URL')).toBeVisible();
    await expect(dialog.getByRole('switch', { name: 'Enabled' })).toBeChecked();
  },
};

export const CreatesAWorkspace: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'New workspace' }));
    await userEvent.type(dialog.getByRole('textbox', { name: /^Workspace name/ }), 'Backend');
    await expect(dialog.getByText('/w/backend/v1')).toBeVisible();
    await userEvent.type(dialog.getByRole('textbox', { name: 'Description (optional)' }), 'Team models');
    await userEvent.click(dialog.getByRole('button', { name: 'Create workspace' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(CREATE_ROUTE, {
        name: 'Backend',
        description: 'Team models',
        enabled: true,
      }),
    );
    await waitFor(() => expect(body.getByText('Created workspace Backend')).toBeVisible());
    await expect(args.onSaved).toHaveBeenCalledWith(BACKEND);
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};

export const RejectsANameThatMakesNoUrl: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'New workspace' }));
    const name = dialog.getByRole('textbox', { name: /^Workspace name/ });
    await userEvent.type(name, '!!!');
    await userEvent.click(dialog.getByRole('button', { name: 'Create workspace' }));
    await expect(await dialog.findByText('Enter a workspace name that produces a valid URL slug')).toBeVisible();
    await expect(name).toBeInvalid();
    await expect(apiRequest).not.toHaveBeenCalledWith(CREATE_ROUTE, expect.anything());
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};

export const EditsAnExistingWorkspace: Story = {
  args: { workspace: workspace() },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Edit Research' }));
    await expect(dialog.getByRole('textbox', { name: /^Workspace name/ })).toHaveValue('Research');
    await expect(dialog.getByText('/w/research/v1')).toBeVisible();
    await userEvent.click(dialog.getByRole('switch', { name: 'Enabled' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }));

    // The members are left out, so the server keeps them.
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, {
        name: 'Research',
        description: 'Models for the research agents.',
        enabled: false,
      }),
    );
    await waitFor(() => expect(body.getByText('Saved workspace Research')).toBeVisible());
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};

export const ClearsTheDescription: Story = {
  args: { workspace: workspace() },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Edit Research' }));
    await userEvent.clear(dialog.getByRole('textbox', { name: /^Description/ }));
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }));
    // Sent empty rather than left out, which the server would read as "keep the old one".
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, expect.objectContaining({ description: '' })),
    );
  },
};

export const WarnsThatRenamingMovesTheUrl: Story = {
  args: { workspace: workspace() },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Edit Research' }));
    await userEvent.type(dialog.getByRole('textbox', { name: /^Workspace name/ }), ' Lab');
    await expect(dialog.getByText('/w/research-lab/v1 (renaming moves the URL)')).toBeVisible();
  },
};

export const ShowsWhyTheServerRefused: Story = {
  parameters: {
    api: {
      ...routes,
      [CREATE_ROUTE]: apiError(HttpStatus.Conflict, ErrorCode.Conflict, 'Workspace "backend" already exists'),
    },
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'New workspace' }));
    await userEvent.type(dialog.getByRole('textbox', { name: /^Workspace name/ }), 'Backend');
    await userEvent.click(dialog.getByRole('button', { name: 'Create workspace' }));
    const alert = within(await dialog.findByRole('alert'));
    await expect(alert.getByText('Workspace "backend" already exists')).toBeVisible();
    // The dialog stays open with what was typed.
    await expect(args.onOpenChange).not.toHaveBeenCalled();
    await expect(dialog.getByRole('textbox', { name: /^Workspace name/ })).toHaveValue('Backend');
  },
};

export const WhileCreating: Story = {
  parameters: { api: { ...routes, [CREATE_ROUTE]: pending() } },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'New workspace' }));
    await userEvent.type(dialog.getByRole('textbox', { name: /^Workspace name/ }), 'Backend');
    await userEvent.click(dialog.getByRole('button', { name: 'Create workspace' }));
    await expect(await dialog.findByRole('button', { name: /Saving…/ })).toBeDisabled();
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};
