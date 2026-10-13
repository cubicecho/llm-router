import type { Meta, StoryObj } from '@storybook/react-vite';
import { LayersIcon, ServerIcon } from 'lucide-react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActionButton } from '@/components/action-button';
import { BarNavItem, SidebarNavItem } from '@/components/sidebar';
import { Lock } from '@/components/ui/icons';
import { AppLayout } from './app-layout.tsx';

const STATUS = '2 providers · 1 workspace';
const PARAGRAPH_COUNT = 60;
const onLock = fn();

/** The ones a user can see: the sidebar and the bar both stay in the page, and CSS shows one of them. */
function shown(elements: HTMLElement[]): HTMLElement[] {
  return elements.filter((element) => element.checkVisibility());
}

const meta = {
  component: AppLayout,
  args: {
    sidebarNavSlot: (
      <>
        <SidebarNavItem href="/" label="Providers" iconSlot={<ServerIcon />} active />
        <SidebarNavItem href="/workspaces" label="Workspaces" iconSlot={<LayersIcon />} />
      </>
    ),
    barNavSlot: (
      <>
        <BarNavItem href="/" label="Providers" iconSlot={<ServerIcon />} active />
        <BarNavItem href="/workspaces" label="Workspaces" iconSlot={<LayersIcon />} />
      </>
    ),
    status: STATUS,
    contentSlot: (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Providers</h1>
        <p>The page goes here.</p>
      </div>
    ),
  },
} satisfies Meta<typeof AppLayout>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FramesThePageWithASidebarOnAWideScreen: Story = {
  globals: { viewport: { value: 'desktop' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('LLM Router')).toBeVisible();
    const nav = within(canvas.getByRole('navigation', { name: 'Main' }));
    await expect(nav.getByRole('link', { name: 'Providers' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Workspaces' })).not.toHaveAttribute('aria-current');
    await expect(shown(canvas.getAllByText(STATUS))).toHaveLength(1);
    await expect(canvas.queryByLabelText('LLM Router')).not.toBeVisible();
    await expect(within(canvas.getByRole('main')).getByRole('heading', { name: 'Providers' })).toBeVisible();
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const SwapsTheSidebarForABarOnANarrowScreen: Story = {
  globals: { viewport: { value: 'mobile1' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The sidebar and its brand text are gone; the bar carries the same places as icons with names.
    await expect(canvas.getByText('LLM Router')).not.toBeVisible();
    await expect(canvas.getByLabelText('LLM Router')).toBeVisible();
    await expect(shown(canvas.getAllByText(STATUS))).toHaveLength(1);
    const nav = within(canvas.getByRole('navigation', { name: 'Main' }));
    await expect(nav.getByRole('link', { name: 'Providers' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Workspaces' })).toBeVisible();
    await expect(within(canvas.getByRole('main')).getByRole('heading', { name: 'Providers' })).toBeVisible();
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const WithoutAStatusLine: Story = {
  args: { status: undefined },
  globals: { viewport: { value: 'desktop' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText(STATUS)).not.toBeInTheDocument();
    await expect(canvas.getByRole('navigation', { name: 'Main' })).toBeVisible();
  },
};

export const PlacesAnActionBesideTheThemePicker: Story = {
  args: {
    actionSlot: <ActionButton variant="ghost" size="icon-sm" label="Lock" onClick={onLock} iconSlot={<Lock />} />,
  },
  globals: { viewport: { value: 'desktop' } },
  play: async ({ canvasElement }) => {
    onLock.mockClear();
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Lock' }));
    await expect(onLock).toHaveBeenCalledTimes(1);
  },
};

export const KeepsTheNavigationInViewOnALongPage: Story = {
  args: {
    contentSlot: (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Providers</h1>
        {Array.from({ length: PARAGRAPH_COUNT }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: filler paragraphs have no identity beyond their position
          <p key={index} className="py-2">
            {/* A real page has something to focus, which is what lets the keyboard scroll it. */}
            <a href="#top">Provider {index + 1}</a>
          </p>
        ))}
      </div>
    ),
  },
  globals: { viewport: { value: 'desktop' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const last = canvas.getByText(`Provider ${PARAGRAPH_COUNT}`);
    await expect(last.getBoundingClientRect().top).toBeGreaterThan(window.innerHeight);
    last.scrollIntoView();
    await expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight);
    // The navigation stays where it was while the page moves under it.
    const places = canvas.getByRole('navigation', { name: 'Main' }).getBoundingClientRect();
    await expect(places.top).toBeGreaterThanOrEqual(0);
    await expect(places.bottom).toBeLessThanOrEqual(window.innerHeight);
  },
};
