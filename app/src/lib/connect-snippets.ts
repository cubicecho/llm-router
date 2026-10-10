/** What a connection snippet is built from. */
export interface SnippetInput {
  /** Absolute OpenAI base URL of the endpoint, ending in `/v1`. */
  baseUrl: string;
  /** A model id to ask for, e.g. `ollama/qwen3:32b`. */
  model: string;
  /** Bearer token to embed, or undefined when auth is disabled. */
  token?: string;
}

/** The `api_key` a snippet carries when the router asks for none; OpenAI's SDKs refuse an empty one. */
const UNUSED_API_KEY = 'unused';

/**
 * Builds a `curl` command that sends one chat completion to an endpoint.
 *
 * @param props.baseUrl - Absolute OpenAI base URL of the endpoint.
 * @param props.model - The model id to ask for.
 * @param props.token - Bearer token to embed as a header; left out when undefined or empty.
 * @returns The command, one option per line.
 */
export function curlSnippet({ baseUrl, model, token }: SnippetInput): string {
  const lines = [`curl ${baseUrl}/chat/completions \\`, `  -H "Content-Type: application/json" \\`];
  if (token) {
    lines.push(`  -H "Authorization: Bearer ${token}" \\`);
  }
  const body = JSON.stringify({ model, messages: [{ role: 'user', content: 'Hello' }] });
  lines.push(`  -d '${body}'`);
  return lines.join('\n');
}

/**
 * Builds a Python program that sends one chat completion through OpenAI's SDK.
 *
 * @param props.baseUrl - Absolute OpenAI base URL of the endpoint.
 * @param props.model - The model id to ask for.
 * @param props.token - Bearer token to pass as `api_key`; a stand-in when undefined or empty.
 * @returns The program.
 */
export function pythonSnippet({ baseUrl, model, token }: SnippetInput): string {
  return [
    'from openai import OpenAI',
    '',
    `client = OpenAI(base_url="${baseUrl}", api_key="${token || UNUSED_API_KEY}")`,
    'reply = client.chat.completions.create(',
    `    model="${model}",`,
    '    messages=[{"role": "user", "content": "Hello"}],',
    ')',
    'print(reply.choices[0].message.content)',
  ].join('\n');
}

/**
 * Builds the two environment variables OpenAI's SDKs and most OpenAI-compatible tools read.
 *
 * @param props.baseUrl - Absolute OpenAI base URL of the endpoint.
 * @param props.token - Bearer token to export as the key; a stand-in when undefined or empty.
 * @returns Two `export` lines.
 */
export function envSnippet({ baseUrl, token }: SnippetInput): string {
  return [`export OPENAI_BASE_URL="${baseUrl}"`, `export OPENAI_API_KEY="${token || UNUSED_API_KEY}"`].join('\n');
}
