import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { clearToken, setToken } from '@/lib/auth';
import { routerStatus } from '@/storybook/fixtures';
import { pending } from '@/storybook/mock-api';
import { ConnectCard } from './connect-card.tsx';

const STATUS = 'GET /api/status';
const TOKEN = 'story-token-123';

/** Signs the story in before it renders, as a browser that already holds the token. */
function withStoredToken(): () => void {
  setToken(TOKEN);
  return clearToken;
}

const meta = {
  component: ConnectCard,
  args: {
    path: '/w/research/v1',
    model: 'ollama/qwen3:32b',
    description: "Point any OpenAI client at this workspace's base URL.",
  },
  parameters: { api: { [STATUS]: routerStatus({ authEnabled: true }) } },
  decorators: [
    (Story) => (
      <div className="max-w-3xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConnectCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsTheBaseUrlAndASnippetPerClient: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Connect a client', level: 2 })).toBeVisible();
    await expect(canvas.getByText("Point any OpenAI client at this workspace's base URL.")).toBeVisible();
    await expect(canvas.getByText(`${window.location.origin}/w/research/v1`)).toBeVisible();
    for (const name of ['Environment', 'curl', 'Python (openai)']) {
      await expect(canvas.getByRole('heading', { name, level: 3 })).toBeVisible();
      await expect(canvas.getByRole('button', { name: `Copy ${name} snippet` })).toBeVisible();
    }
    await expect(canvas.getByText(/"model":"ollama\/qwen3:32b"/)).toBeVisible();
  },
};

export const WithAuthOffNeedsNoToken: Story = {
  parameters: { api: { [STATUS]: routerStatus({ authEnabled: false }) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/OPENAI_API_KEY="unused"/)).toBeVisible();
    await expect(canvas.queryByText(/Authorization: Bearer/)).not.toBeInTheDocument();
    await expect(canvas.queryByText(/Treat them as secrets/)).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Reveal token' })).not.toBeInTheDocument();
  },
};

export const WithoutAStoredTokenShowsAPlaceholder: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Authorization: Bearer <YOUR_TOKEN>/)).toBeVisible();
    await expect(canvas.getByText(/include your bearer token placeholder/)).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Reveal token' })).not.toBeInTheDocument();
  },
};

export const AssumesAuthUntilTheRouterAnswers: Story = {
  parameters: { api: { [STATUS]: pending() } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Authorization: Bearer <YOUR_TOKEN>/)).toBeVisible();
  },
};

export const MasksTheTokenUntilRevealed: Story = {
  beforeEach: withStoredToken,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Authorization: Bearer ••••••••••••/)).toBeVisible();
    await expect(canvas.queryByText(new RegExp(TOKEN))).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Reveal token' }));
    await expect(canvas.getByText(new RegExp(`Authorization: Bearer ${TOKEN}`))).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Hide token' }));
    await expect(canvas.queryByText(new RegExp(TOKEN))).not.toBeInTheDocument();
  },
};

export const WithNoModelUsesAPlaceholder: Story = {
  args: { model: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/model="<provider>\/<model>"/)).toBeVisible();
  },
};
