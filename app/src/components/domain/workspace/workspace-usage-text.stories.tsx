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
    // The toast stack stays in the page while it is empty, so it is the only thing drawn.
    await expect(canvasElement.querySelectorAll(':scope > :not([data-slot="toast-viewport"])')).toHaveLength(0);
  },
};

export const ShowsNothingWhenTheCountsCannotBeRead: Story = {
  parameters: {
    api: { [USAGE_ROUTE]: apiError(HttpStatus.InternalServerError, ErrorCode.Internal, 'usage is unreadable') },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(USAGE_ROUTE, undefined));
    // The toast stack stays in the page while it is empty, so it is the only thing drawn.
    await expect(canvasElement.querySelectorAll(':scope > :not([data-slot="toast-viewport"])')).toHaveLength(0);
  },
};
