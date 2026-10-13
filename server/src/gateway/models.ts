import { MS_PER_SECOND, type ProviderConfig, type RoutedModel, type SkippedProvider } from '@llm-router/shared';
import { z } from 'zod';
import { GATEWAY_DEFAULTS, type GatewaySettings } from '../core/defaults.ts';
import { errorMessage, HttpError, upstreamFailed } from '../core/errors.ts';
import { type EndpointScope, exposesModel, type ScopeMember } from './endpoint-scope.ts';
import { namespaceModel } from './naming.ts';
import { providerHeaders } from './provider-headers.ts';
import { fetchWithin, type UpstreamFetch, upstreamUrl } from './upstream-fetch.ts';

/** One model as a provider lists it. Only the id is relied on; the rest is passed through. */
const upstreamModelSchema = z.object({ id: z.string().min(1) }).loose();

/** What `GET <baseUrl>/models` answers. */
const upstreamModelListSchema = z.object({ data: z.array(upstreamModelSchema) });

/** One model as a provider lists it. */
export type UpstreamModel = z.infer<typeof upstreamModelSchema>;

/** A model of one endpoint: who serves it, and what the provider said about it. */
export interface ScopedModel extends RoutedModel {
  /** The provider's own model object. */
  upstream: UpstreamModel;
}

/** The merged listing of an endpoint. */
export interface ScopeModels {
  models: ScopedModel[];
  /** The members whose listing failed. */
  skipped: SkippedProvider[];
}

/** A listing held for reuse. */
interface CachedListing {
  /** The config the listing was fetched with. A saved or reloaded provider is a new object, so it misses. */
  provider: ProviderConfig;
  /** When the listing stops being reused, in ms since the epoch. */
  expiresAt: number;
  models: Promise<UpstreamModel[]>;
}

/** A provider's answer to a model listing, read to its end. */
interface ListingAnswer {
  status: number;
  /** Whether the status is a 2xx. */
  ok: boolean;
  /** The body, as text. */
  text: string;
}

/** Lists each provider's models, reusing a recent listing. */
export class ModelCatalog {
  private readonly fetch: UpstreamFetch;
  private readonly settings: GatewaySettings;
  private readonly listings = new Map<string, CachedListing>();

  /**
   * Builds an empty catalog; nothing is fetched until a listing is asked for.
   *
   * @param fetch - Reaches the providers.
   * @param [overrides] - Settings that differ from `GATEWAY_DEFAULTS`.
   */
  constructor(fetch: UpstreamFetch, overrides: Partial<GatewaySettings> = {}) {
    this.fetch = fetch;
    this.settings = { ...GATEWAY_DEFAULTS, ...overrides };
  }

  /**
   * Lists a provider's models, from the cache when it holds a fresh listing made with this same config.
   *
   * @param provider - The provider.
   * @returns The models as the provider lists them.
   * @throws A 502 or 504 HttpError when the provider cannot be listed. A failure is not cached.
   */
  list(provider: ProviderConfig): Promise<UpstreamModel[]> {
    const cached = this.listings.get(provider.name);
    if (cached && cached.provider === provider && cached.expiresAt > Date.now()) {
      return cached.models;
    }
    const models = this.fetchModels(provider);
    const expiresAt = Date.now() + this.settings.modelListCacheSeconds * MS_PER_SECOND;
    this.listings.set(provider.name, { provider, expiresAt, models });
    models.catch(() => {
      if (this.listings.get(provider.name)?.models === models) {
        this.listings.delete(provider.name);
      }
    });
    return models;
  }

  /**
   * Drops a provider's cached listing, so the next one is fetched.
   *
   * @param providerName - The provider's name; an unknown one is not an error.
   */
  forget(providerName: string): void {
    this.listings.delete(providerName);
  }

  /**
   * Asks a provider for its model list and reads the whole answer.
   *
   * @param provider - The provider.
   * @param url - Its `<baseUrl>/models`.
   * @param failed - The message of the error to raise.
   * @returns The answer's status and body, whatever the status.
   * @throws A 502 HttpError when the provider cannot be reached or its answer breaks off; a 504 for a timeout.
   */
  private async readListing(provider: ProviderConfig, url: string, failed: string): Promise<ListingAnswer> {
    try {
      const answer = await fetchWithin(this.fetch, url, {
        method: 'GET',
        headers: providerHeaders(provider),
        timeoutMs: this.settings.modelListTimeoutMs,
      });
      return { status: answer.status, ok: answer.ok, text: await answer.text() };
    } catch (cause) {
      if (cause instanceof HttpError) {
        throw cause;
      }
      throw upstreamFailed(failed, `${url} could not be reached: ${errorMessage(cause)}`, { cause });
    }
  }

  /**
   * Fetches `<baseUrl>/models` from a provider.
   *
   * @param provider - The provider.
   * @returns The models it lists.
   * @throws A 502 HttpError for an unreachable provider, a non-2xx answer or an unexpected body; a 504 for a timeout.
   */
  private async fetchModels(provider: ProviderConfig): Promise<UpstreamModel[]> {
    const url = upstreamUrl(provider.baseUrl, 'models');
    const failed = `Could not list the models of provider "${provider.name}"`;
    const { ok, status, text } = await this.readListing(provider, url, failed);
    if (ok === false) {
      throw upstreamFailed(failed, `${url} answered ${status}: ${text.slice(0, this.settings.errorBodyMaxChars)}`);
    }
    try {
      return upstreamModelListSchema.parse(JSON.parse(text)).data;
    } catch (cause) {
      throw upstreamFailed(failed, `${url} did not answer with an OpenAI model list ({ "data": [{ "id": ... }] })`, {
        cause,
      });
    }
  }
}

/**
 * Lists the models one scope member exposes.
 *
 * @param member - The member.
 * @param catalog - Lists its provider.
 * @returns The provider's models that pass the member's allowlist, each under its routed id.
 */
async function listMemberModels(member: ScopeMember, catalog: ModelCatalog): Promise<ScopedModel[]> {
  const { provider } = member;
  const upstreamModels = await catalog.list(provider);
  return upstreamModels
    .filter((upstream) => exposesModel(member, upstream.id))
    .map((upstream) => ({
      id: namespaceModel(provider.name, upstream.id),
      provider: provider.name,
      upstreamId: upstream.id,
      upstream,
    }));
}

/**
 * Merges the model listings of every member of a scope.
 *
 * @param scope - The endpoint's members.
 * @param catalog - Lists each provider.
 * @returns The models in member order, and the members that could not be listed. Never rejects.
 *
 * @remarks
 * A failing member is logged and left out, so one dead provider does not empty the endpoint.
 */
export async function listScopeModels(scope: EndpointScope, catalog: ModelCatalog): Promise<ScopeModels> {
  const skipped: SkippedProvider[] = [];
  const perMember = await Promise.all(
    scope.members.map(async (member) => {
      try {
        return await listMemberModels(member, catalog);
      } catch (error) {
        const detail = error instanceof HttpError && error.detail ? error.detail : errorMessage(error);
        console.warn(`[gateway] skipping provider "${member.provider.name}" in ${scope.label}: ${detail}`);
        skipped.push({ provider: member.provider.name, error: detail });
        return [];
      }
    }),
  );
  return { models: perMember.flat(), skipped };
}
