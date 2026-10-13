import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { HOSTED_MODELS, hostedProvider, LOCAL_MODELS, localProvider, workspace } from '@/storybook/fixtures';
import { apiError, apiRequest, pending } from '@/storybook/mock-api';
import { MembersCard } from './members-card.tsx';

const PROVIDERS_ROUTE = 'GET /api/providers';
const UPDATE_ROUTE = 'PATCH /api/workspaces/research';

const routes = {
  [PROVIDERS_ROUTE]: [localProvider(), hostedProvider()],
  'GET /api/providers/ollama/models': LOCAL_MODELS,
  'GET /api/providers/openrouter/models': HOSTED_MODELS,
  [UPDATE_ROUTE]: () => workspace(),
};

const meta = {
  component: MembersCard,
  args: { workspace: workspace() },
  parameters: { api: routes },
  decorators: [
    (Story) => (
      <div className="max-w-3xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MembersCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsEveryProviderWithWhatItContributes: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Providers', level: 2 })).toBeVisible();
    await expect(await canvas.findByRole('switch', { name: 'Serve Ollama' })).toBeChecked();
    await expect(canvas.getByRole('switch', { name: 'Serve openrouter' })).toBeChecked();
    await expect(canvas.getByText('Every model it lists')).toBeVisible();
    await expect(canvas.getByText('1 model allowed')).toBeVisible();
  },
};

export const SwitchesAProviderOffAndKeepsItsModels: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('switch', { name: 'Serve openrouter' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, {
        members: {
          ollama: { enabled: true },
          openrouter: { enabled: false, models: ['anthropic/claude-opus-5-5'] },
        },
      }),
    );
  },
};

export const HoldsEverySwitchWhileAChangeIsSaving: Story = {
  parameters: { api: { ...routes, [UPDATE_ROUTE]: pending() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('switch', { name: 'Serve openrouter' }));
    // A second change now would be built on the members as they were before the first.
    await waitFor(() => expect(canvas.getByRole('switch', { name: 'Serve Ollama' })).toBeDisabled());
    await expect(canvas.getByRole('switch', { name: 'Serve openrouter' })).toBeDisabled();
  },
};

export const SwitchesOnAProviderThatIsNotAMember: Story = {
  args: { workspace: workspace({ members: { ollama: { enabled: true } } }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole('switch', { name: 'Serve openrouter' });
    await expect(toggle).not.toBeChecked();
    await expect(canvas.getByText('Not served by this workspace.')).toBeVisible();
    // Its models are chosen once it is a member.
    await expect(canvas.queryByRole('button', { name: 'Choose models of openrouter' })).not.toBeInTheDocument();
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(UPDATE_ROUTE, {
        members: { ollama: { enabled: true }, openrouter: { enabled: true } },
      }),
    );
  },
};

export const OpensTheModelChoiceOfAMember: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Choose models of openrouter' }));
    await expect(await body.findByRole('dialog', { name: 'Models of openrouter' })).toBeVisible();
  },
};

export const MarksADisabledProvider: Story = {
  parameters: { api: { ...routes, [PROVIDERS_ROUTE]: () => [localProvider({ enabled: false })] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('disabled')).toBeVisible();
    await expect(canvas.getByText('This provider is disabled, so it serves no models anywhere.')).toBeVisible();
  },
};

export const WhileLoading: Story = {
  parameters: { api: { ...routes, [PROVIDERS_ROUTE]: pending() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('status', { name: 'Loading' })).toBeVisible();
    await expect(canvas.queryByRole('switch')).not.toBeInTheDocument();
  },
};

export const WithNoProviders: Story = {
  parameters: { api: { ...routes, [PROVIDERS_ROUTE]: () => [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('No providers yet.')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Add a provider' })).toBeVisible();
  },
};

export const WhenTheProvidersFail: Story = {
  parameters: {
    api: {
      ...routes,
      [PROVIDERS_ROUTE]: apiError(HttpStatus.InternalServerError, ErrorCode.Internal, 'providers are unreadable'),
    },
  },
  play: async ({ canvasElement }) => {
    const alert = within(await within(canvasElement).findByRole('alert'));
    await expect(alert.getByText('Could not load providers')).toBeVisible();
    await expect(alert.getByText('providers are unreadable')).toBeVisible();
  },
};

export const SaysWhyASwitchWasRefused: Story = {
  parameters: {
    api: {
      ...routes,
      [UPDATE_ROUTE]: apiError(HttpStatus.NotFound, ErrorCode.NotFound, 'Workspace "research" not found'),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('switch', { name: 'Serve Ollama' }));
    await waitFor(() => expect(body.getByText('Workspace "research" not found')).toBeVisible());
  },
};
