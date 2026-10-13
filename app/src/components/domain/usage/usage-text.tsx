import type { TokenUsage } from '@llm-router/shared';
import { exactTokens, usageLine } from '@/components/domain/usage/usage';

interface UsageTextProps {
  /** The counts to word: the totals of a provider or a workspace, or one model's. */
  usage: TokenUsage;
}

/** Requests and tokens in and out as one muted line, shortened, with the exact token counts on hover. */
export function UsageText({ usage }: UsageTextProps) {
  return (
    <span className="whitespace-nowrap text-foreground/60 text-xs" title={exactTokens(usage)}>
      {usageLine(usage)}
    </span>
  );
}
