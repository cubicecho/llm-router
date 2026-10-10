import { ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { usage } from '@/storybook/fixtures';
import { apiError, apiRequest } from '@/storybook/mock-api';
import { WorkspaceUsageText } from './workspace-usage-text.tsx';

const USAGE_ROUTE = 'GET /api/usage';

const meta = {
  component: WorkspaceUsageText,
  args: { slug: 'research' },
  parameters: { api: { [USAGE_ROUTE]: usage() } },
} satisfies Meta<typeof WorkspaceUsageText>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsTheWorkspacesTotals: Story = {
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('12 requests · 250.3K in · 40.1K out')).toBeVisible();
  },
};

export const AWorkspaceThatWasNeverCalledShowsNothing: Story = {
  args: { slug: 'support' },
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
