import type { TokenUsage } from '@llm-router/shared';
import { exactTokens, usageLine } from '@/lib/usage';

interface UsageTextProps {
  /** The counts to word: a provider's totals or one model's. */
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
