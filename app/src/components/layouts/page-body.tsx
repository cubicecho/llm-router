import type { SlotNode } from '@/lib/utils';

interface PageBodyProps {
  /** The page's cards and states, top to bottom. */
  contentSlot: SlotNode;
}

/** The body of a page under its header: one column, evenly spaced. */
export function PageBody({ contentSlot }: PageBodyProps) {
  return <div className="flex flex-col gap-6 py-4 md:py-6">{contentSlot}</div>;
}
