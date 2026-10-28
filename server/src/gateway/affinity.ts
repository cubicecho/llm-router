import { isRecord } from '../core/is-record.ts';

/** The request header a client may send to keep its requests on one target. */
export const SESSION_HEADER = 'x-session-id';

/** Body fields that name a session or a cache, in the order they are trusted. OpenAI's own names. */
const KEY_FIELDS = ['prompt_cache_key', 'user'] as const;

/** The chat role whose first message ends the prefix a conversation keeps. */
const USER_ROLE = 'user';

/**
 * Reads a body field that holds a key.
 *
 * @param body - The request body.
 * @param field - The field's name.
 * @returns The field's value when it is a string that is not empty.
 */
function stringField(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  const isKey = typeof value === 'string' && value !== '';
  return isKey ? value : undefined;
}

/**
 * Takes the start of a chat that stays the same for its whole conversation.
 *
 * @param messages - The body's `messages`.
 * @returns The messages up to and including the first user message.
 */
function conversationStart(messages: readonly unknown[]): unknown[] {
  const firstUserAt = messages.findIndex((message) => isRecord(message) && message.role === USER_ROLE);
  const hasUserMessage = firstUserAt >= 0;
  return hasUserMessage ? messages.slice(0, firstUserAt + 1) : [...messages];
}

/**
 * Takes the part of a prompt that a server's prefix cache would reuse.
 *
 * @param body - The request body.
 * @returns A chat's opening messages, or a completion's `prompt` or an embedding's `input`, as text; undefined when
 * the body has none.
 */
function promptPrefix(body: Record<string, unknown>): string | undefined {
  const { messages, prompt, input } = body;
  if (Array.isArray(messages)) {
    return JSON.stringify(conversationStart(messages));
  }
  const promptOrInput = prompt ?? input;
  if (promptOrInput === undefined) {
    return undefined;
  }
  return typeof promptOrInput === 'string' ? promptOrInput : JSON.stringify(promptOrInput);
}

/**
 * Works out the key that keeps related requests on the same target of a sticky pool.
 *
 * @param body - The request body.
 * @param sessionHeader - The `X-Session-Id` header, when the client sent one.
 * @returns The client's own key when it gave one, else the start of its prompt; undefined when there is neither.
 *
 * @remarks
 * A key the client chose wins, in the order `X-Session-Id`, `prompt_cache_key`, `user`. Otherwise requests that open
 * the same way share a key, which is what a server's prefix cache rewards.
 */
export function affinityKey(body: Record<string, unknown>, sessionHeader: string | undefined): string | undefined {
  if (sessionHeader) {
    return sessionHeader;
  }
  for (const field of KEY_FIELDS) {
    const key = stringField(body, field);
    if (key !== undefined) {
      return key;
    }
  }
  return promptPrefix(body);
}
