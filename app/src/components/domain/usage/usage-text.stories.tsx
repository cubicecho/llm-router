import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { LOCAL_USAGE } from '@/storybook/fixtures';
import { UsageText } from './usage-text.tsx';

const meta = {
  component: UsageText,
  args: { usage: LOCAL_USAGE },
} satisfies Meta<typeof UsageText>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShortensTheCounts: Story = {
  play: async ({ canvasElement }) => {
    const line = within(canvasElement).getByText('42 requests · 1.3M in · 340.1K out');
    await expect(line).toBeVisible();
    // The exact counts are one hover away.
    await expect(line).toHaveAttribute('title', '1,250,300 tokens in, 340,120 tokens out');
  },
};

export const ASingleRequestWithNoOutput: Story = {
  args: { usage: { requests: 1, inputTokens: 300, outputTokens: 0 } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('1 request · 300 in · 0 out')).toBeVisible();
  },
};
