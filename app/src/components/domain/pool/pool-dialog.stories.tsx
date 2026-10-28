import { ErrorCode, HttpStatus, POOL_DEFAULTS } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { pool } from '@/storybook/fixtures';
import { apiError, apiRequest } from '@/storybook/mock-api';
import { PoolDialog } from './pool-dialog.tsx';

const CREATE_ROUTE = 'POST /api/pools';
const UPDATE_ROUTE = 'PATCH /api/pools/qwen3';

const routes = {
  // Functions, so the answers replace the meta's and are not merged into them.
  [CREATE_ROUTE]: () => pool({ name: 'llama70b', targets: [] }),
  [UPDATE_ROUTE]: () => pool(),
};

const meta = {
  component: PoolDialog,
  args: { open: true, onOpenChange: fn() },
  parameters: { api: routes },
} satisfies Meta<typeof PoolDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const StartsStickyAndLeastBusy: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'New pool' }));
    await expect(dialog.getByRole('textbox', { name: /^Pool name/ })).toHaveValue('');
    await expect(dialog.getByRole('combobox', { name: /Strategy/ })).toHaveTextContent('Least busy');
    await expect(dialog.getByRole('combobox', { name: /Affinity/ })).toHaveTextContent('Sticky');
    await expect(dialog.getByRole('switch', { name: 'Bounded load' })).not.toBeChecked();
    await expect(dialog.queryByRole('spinbutton', { name: /Load factor/ })).not.toBeInTheDocument();
  },
};

export const CreatesAPoolWithBoundedLoad: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'New pool' }));
    await userEvent.type(dialog.getByRole('textbox', { name: /^Pool name/ }), 'llama70b');
    await userEvent.click(dialog.getByRole('switch', { name: 'Bounded load' }));
    await expect(dialog.getByRole('spinbutton', { name: /Load factor/ })).toHaveValue(
      POOL_DEFAULTS.suggestedLoadFactor,
    );
    await userEvent.click(dialog.getByRole('button', { name: 'Create pool' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(CREATE_ROUTE, {
        name: 'llama70b',
        strategy: 'least-busy',
        affinity: 'sticky',
        maxLoadFactor: POOL_DEFAULTS.suggestedLoadFactor,
        enabled: true,
      }),
    );
    await waitFor(() => expect(body.getByText('Created pool llama70b')).toBeVisible());
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};

export const RejectsANameWithASlash: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'New pool' }));
    await userEvent.type(dialog.getByRole('textbox', { name: /^Pool name/ }), 'gpu/llama');
    await userEvent.click(dialog.getByRole('button', { name: 'Create pool' }));
    await expect(await dialog.findByText(/^Use lowercase letters/)).toBeVisible();
    await expect(apiRequest).not.toHaveBeenCalledWith(CREATE_ROUTE, expect.anything());
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};

export const HidesBoundedLoadWithoutAffinity: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'New pool' }));
    await userEvent.click(dialog.getByRole('combobox', { name: /Affinity/ }));
    await userEvent.click(await body.findByRole('option', { name: 'None' }));
    await expect(dialog.getByText('Every request is placed by the strategy.')).toBeVisible();
    await expect(dialog.queryByRole('switch', { name: 'Bounded load' })).not.toBeInTheDocument();
  },
};

export const EditsAPoolAndTurnsBoundedLoadOff: Story = {
  args: { pool: pool() },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Edit qwen3' }));
    // The name is the model id clients ask for, so an edit cannot change it.
    await expect(dialog.queryByRole('textbox', { name: /^Pool name/ })).not.toBeInTheDocument();
    await expect(dialog.getByRole('spinbutton', { name: /Load factor/ })).toHaveValue(pool().maxLoadFactor);
    await userEvent.click(dialog.getByRole('combobox', { name: /Strategy/ }));
    await userEvent.click(await body.findByRole('option', { name: 'Round robin' }));
    await userEvent.click(dialog.getByRole('switch', { name: 'Bounded load' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, {
        description: 'Qwen3 32B on both GPU boxes.',
        strategy: 'round-robin',
        affinity: 'sticky',
        maxLoadFactor: null,
        enabled: true,
      }),
    );
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};

export const ShowsTheServerError: Story = {
  parameters: {
    api: { [CREATE_ROUTE]: apiError(HttpStatus.Conflict, ErrorCode.Conflict, 'Pool "qwen3" already exists') },
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'New pool' }));
    await userEvent.type(dialog.getByRole('textbox', { name: /^Pool name/ }), 'qwen3');
    await userEvent.click(dialog.getByRole('button', { name: 'Create pool' }));
    const alert = within(await dialog.findByRole('alert'));
    await expect(alert.getByText('Pool "qwen3" already exists')).toBeVisible();
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};
