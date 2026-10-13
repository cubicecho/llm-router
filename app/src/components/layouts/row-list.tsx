import type { SlotNode } from '@/lib/utils';

interface RowListProps {
  /** Names the list for assistive technology, when its heading does not. */
  label?: string;
  /** The rows, each a `RowListItem`. */
  contentSlot: SlotNode;
}

/** A list of rows with a rule between each pair. */
export function RowList({ label, contentSlot }: RowListProps) {
  return (
    <ul aria-label={label} className="flex flex-col divide-y divide-foreground/10">
      {contentSlot}
    </ul>
  );
}

interface RowListItemProps {
  /** What the row shows, usually a `ListItem`. */
  contentSlot: SlotNode;
}

/** One row of a `RowList`. */
export function RowListItem({ contentSlot }: RowListItemProps) {
  return <li className="py-1">{contentSlot}</li>;
}
