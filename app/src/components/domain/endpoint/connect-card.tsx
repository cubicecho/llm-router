import { useState } from 'react';
import { CardLayout } from '@/components/card-layout';
import { DescriptionList, PropertyRow } from '@/components/description-list';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/ui/code';
import { CopyButton } from '@/components/ui/copy-button';
import { Eye, EyeOff } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { useToken } from '@/lib/auth';
import { curlSnippet, envSnippet, pythonSnippet, type SnippetInput } from '@/lib/connect-snippets';
import { endpointUrl } from '@/lib/endpoint';
import { useRouterStatus } from '@/lib/queries';
import { COPY_FAILED_MESSAGE } from '@/lib/toast';

const TOKEN_PLACEHOLDER = '<YOUR_TOKEN>';
const TOKEN_MASK = '••••••••••••';
const MODEL_PLACEHOLDER = '<provider>/<model>';

const SNIPPETS = [
  { title: 'Environment', build: envSnippet },
  { title: 'curl', build: curlSnippet },
  { title: 'Python (openai)', build: pythonSnippet },
] as const;

interface ConnectCardProps {
  /** Path of the endpoint's OpenAI base URL, e.g. `/w/research/v1`. */
  path: string;
  /** A model the endpoint serves, used in the examples; a placeholder stands in when there is none. */
  model?: string;
  /** Line under the card title. */
  description: string;
}

/**
 * Ready-to-paste client configuration for an OpenAI-compatible endpoint. Copying embeds the real bearer token; on
 * screen it stays masked unless revealed.
 */
export function ConnectCard({ path, model = MODEL_PLACEHOLDER, description }: ConnectCardProps) {
  const { data: status } = useRouterStatus();
  const [isRevealed, setIsRevealed] = useState(false);
  const toast = useToast();
  const onCopyError = () => toast(COPY_FAILED_MESSAGE);

  // Assume auth until status says otherwise: a placeholder key is easier to delete than a missing one is to diagnose.
  const authEnabled = status?.authEnabled ?? true;
  const token = useToken() ?? undefined;
  const copyToken = authEnabled ? (token ?? TOKEN_PLACEHOLDER) : undefined;
  const maskedToken = isRevealed ? token : TOKEN_MASK;
  const displayToken = authEnabled ? (token ? maskedToken : TOKEN_PLACEHOLDER) : undefined;
  const baseUrl = endpointUrl(path);
  const input = (snippetToken: string | undefined): SnippetInput => ({ baseUrl, model, token: snippetToken });

  return (
    <CardLayout
      level={2}
      title="Connect a client"
      description={description}
      actionSlot={
        authEnabled &&
        token !== undefined && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsRevealed((current) => current === false)}
            iconSlot={isRevealed ? <EyeOff /> : <Eye />}
            content={isRevealed ? 'Hide token' : 'Reveal token'}
          />
        )
      }
      contentClassName="gap-4"
      contentSlot={
        <>
          <DescriptionList
            contentSlot={
              <PropertyRow
                label="Base URL"
                value={baseUrl}
                valueClassName="font-mono break-all"
                actionSlot={<CopyButton variant="ghost" value={baseUrl} label="Copy base URL" onError={onCopyError} />}
              />
            }
          />
          {SNIPPETS.map(({ title, build }) => (
            <Section
              key={title}
              level={3}
              title={title}
              contentSlot={
                <CodeBlock
                  wrap
                  content={build(input(displayToken))}
                  actionSlot={
                    <CopyButton
                      variant="ghost"
                      value={build(input(copyToken))}
                      label={`Copy ${title} snippet`}
                      onError={onCopyError}
                    />
                  }
                />
              }
            />
          ))}
          {authEnabled && (
            <p className="text-foreground/60 text-xs">
              Copied snippets include your bearer token{token ? '' : ' placeholder'}. Treat them as secrets.
            </p>
          )}
        </>
      }
    />
  );
}
