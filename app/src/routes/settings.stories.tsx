import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { appRoutes, RELOADED, routerStatus, settings } from '@/storybook/fixtures';
import { apiError, apiRequest, pending } from '@/storybook/mock-api';

const STATUS_ROUTE = 'GET /api/status';
const SETTINGS_ROUTE = 'GET /api/settings';
const UPDATE_ROUTE = 'PATCH /api/settings';
const RELOAD_ROUTE = 'POST /api/reload';
/** The fixture's ten-minute response timeout, as the form shows it. */
const STORED_TIMEOUT_SECONDS = 600;
const ORIGINS = 'Allowed browser origins (one per line)';

const meta = {
  title: 'routes/settings',
  parameters: { route: '/settings', api: appRoutes() },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsTheRouterAndItsSettings: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(await canvas.findByText('0.1.0')).toBeVisible();
    await expect(canvas.getByText('enabled')).toBeVisible();
    await expect(await canvas.findByRole('switch', { name: 'Require the token' })).toBeChecked();
    await expect(canvas.getByRole('spinbutton', { name: /^Response timeout/ })).toHaveValue(STORED_TIMEOUT_SECONDS);
    await expect(canvas.getByRole('textbox', { name: ORIGINS })).toHaveValue('');
    await expect(canvas.getByRole('heading', { name: 'Appearance' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Settings', current: 'page' })).toBeVisible();
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const WithAuthOff: Story = {
  parameters: {
    api: {
      ...appRoutes(),
      [STATUS_ROUTE]: routerStatus({ authEnabled: false }),
      [SETTINGS_ROUTE]: settings({ authEnabled: false }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('disabled')).toBeVisible();
    await expect(await canvas.findByRole('switch', { name: 'Require the token' })).not.toBeChecked();
  },
};

export const WhileLoading: Story = {
  parameters: { api: { ...appRoutes(), [STATUS_ROUTE]: pending(), [SETTINGS_ROUTE]: pending() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Router' })).toBeVisible();
    await expect(canvas.queryByText('Version')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('spinbutton', { name: /^Response timeout/ })).not.toBeInTheDocument();
    // The part that needs no answer is there already.
    await expect(canvas.getByRole('button', { name: 'Reload config' })).toBeVisible();
  },
};

export const WhenTheStatusFails: Story = {
  parameters: {
    api: {
      ...appRoutes(),
      [STATUS_ROUTE]: apiError(HttpStatus.InternalServerError, ErrorCode.Internal, 'settings.json is unreadable'),
    },
  },
  play: async ({ canvasElement }) => {
    const alert = within(await within(canvasElement).findByRole('alert'));
    await expect(alert.getByText('Could not load status')).toBeVisible();
    await expect(alert.getByText('settings.json is unreadable')).toBeVisible();
    await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();
  },
};

export const WhenTheSettingsFail: Story = {
  parameters: {
    api: {
      ...appRoutes(),
      [SETTINGS_ROUTE]: apiError(HttpStatus.InternalServerError, ErrorCode.Internal, 'settings.json is unreadable'),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = within(await canvas.findByRole('alert'));
    await expect(alert.getByText('Could not load settings')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
  },
};

export const SavesTheSettings: Story = {
  parameters: {
    api: {
      ...appRoutes(),
      [UPDATE_ROUTE]: () => settings({ responseTimeoutMs: 30_000, allowedOrigins: ['https://chat.example.com'] }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const timeout = await canvas.findByRole('spinbutton', { name: /^Response timeout/ });
    await userEvent.clear(timeout);
    await userEvent.type(timeout, '30');
    await userEvent.type(canvas.getByRole('textbox', { name: ORIGINS }), 'https://chat.example.com\n');
    await userEvent.click(canvas.getByRole('button', { name: 'Save settings' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, {
        authEnabled: true,
        responseTimeoutMs: 30_000,
        allowedOrigins: ['https://chat.example.com'],
      }),
    );
    await waitFor(() => expect(body.getByText('Settings saved')).toBeVisible());
  },
};

export const RejectsATimeoutOfZero: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const timeout = await canvas.findByRole('spinbutton', { name: /^Response timeout/ });
    await userEvent.clear(timeout);
    await userEvent.type(timeout, '0');
    await userEvent.click(canvas.getByRole('button', { name: 'Save settings' }));
    await expect(await canvas.findByText('Enter a number of seconds above zero')).toBeVisible();
    await expect(timeout).toBeInvalid();
    await expect(apiRequest).not.toHaveBeenCalledWith(UPDATE_ROUTE, expect.anything());
  },
};

export const SaysWhyASaveWasRefused: Story = {
  parameters: {
    api: {
      ...appRoutes(),
      [UPDATE_ROUTE]: apiError(HttpStatus.BadRequest, ErrorCode.BadUserInput, 'Invalid settings'),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('switch', { name: 'Require the token' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(body.getByText('Invalid settings')).toBeVisible());
  },
};

export const ReloadsTheConfiguration: Story = {
  parameters: { api: { ...appRoutes(), [RELOAD_ROUTE]: RELOADED } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Reload config' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(RELOAD_ROUTE, undefined));
    await waitFor(() => expect(body.getByText('Configuration reloaded: 2 providers, 1 workspace')).toBeVisible());
  },
};

export const WhenAReloadFails: Story = {
  parameters: {
    api: {
      ...appRoutes(),
      [RELOAD_ROUTE]: apiError(HttpStatus.InternalServerError, ErrorCode.Internal, 'settings.json failed validation'),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Reload config' }));
    await waitFor(() => expect(body.getByText('settings.json failed validation')).toBeVisible());
  },
};
