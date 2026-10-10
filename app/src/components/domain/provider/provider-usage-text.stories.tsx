import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { usage } from '@/storybook/fixtures';
import { apiError, apiRequest } from '@/storybook/mock-api';
import { ProviderUsageText } from './provider-usage-text.tsx';

const USAGE_ROUTE = 'GET /api/usage';

const meta = {
  component: ProviderUsageText,
  args: { name: 'ollama' },
  parameters: { api: { [USAGE_ROUTE]: usage() } },
} satisfies Meta<typeof ProviderUsageText>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsTheProvidersTotals: Story = {
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('42 requests · 1.3M in · 340.1K out')).toBeVisible();
  },
};

export const AProviderThatWasNeverCalledShowsNothing: Story = {
  args: { name: 'openrouter' },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(USAGE_ROUTE, undefined));
    await expect(canvasElement).toBeEmptyDOMElement();
  },
};

export const ShowsNothingWhenTheCountsCannotBeRead: Story = {
  parameters: {
    api: { [USAGE_ROUTE]: apiError(HttpStatus.InternalServerError, ErrorCode.Internal, 'usage is unreadable') },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(USAGE_ROUTE, undefined));
    await expect(canvasElement).toBeEmptyDOMElement();
  },
};
