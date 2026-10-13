// DTOs for the management REST API (/api/*). Every endpoint requires `Authorization: Bearer <token>` unless auth is
// disabled.
import { z } from 'zod';
import {
  httpUrlSchema,
  providerConfigSchema,
  providerNameSchema,
  workspaceConfigSchema,
  workspaceMemberSchema,
  workspaceSlugSchema,
} from './config.ts';
import { NAME_DEFAULTS } from './defaults.ts';
import { ErrorCode } from './wire.ts';

/** A provider as the API returns it: its stored config without the key, plus whether one is stored. */
export const providerStatusSchema = providerConfigSchema.omit({ apiKey: true }).extend({
  /** True when an API key is stored. The key itself is write-only. */
  apiKeySet: z.boolean(),
});
/** A provider's stored config without its key. */
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

/** Body of the create-provider request. */
export const createProviderRequestSchema = z.object({
  /** The prefix of the provider's model ids. */
  name: providerNameSchema,
  displayName: z.string().optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  baseUrl: httpUrlSchema,
  /** Left out or empty, the provider is called without an `Authorization` header. */
  apiKey: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});
/** Body of the create-provider request. */
export type CreateProviderRequest = z.infer<typeof createProviderRequestSchema>;

/** Body of the update-provider request; an absent key is left unchanged. */
export const updateProviderRequestSchema = z.object({
  /** An empty string clears it. */
  displayName: z.string().optional(),
  /** An empty string clears it. */
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  baseUrl: httpUrlSchema.optional(),
  /** Left out, the stored key is kept. Null or an empty string removes it. */
  apiKey: z.string().nullable().optional(),
  /** Full replacement of the headers when provided. */
  headers: z.record(z.string(), z.string()).optional(),
});
/** Body of the update-provider request. */
export type UpdateProviderRequest = z.infer<typeof updateProviderRequestSchema>;

/** One model an endpoint serves. */
export const routedModelSchema = z.object({
  /** The id a client asks for: `<provider>/<upstreamId>`. */
  id: z.string(),
  /** The provider that serves it. */
  provider: z.string(),
  /** The model's id at the provider. */
  upstreamId: z.string(),
});
/** One model an endpoint serves. */
export type RoutedModel = z.infer<typeof routedModelSchema>;

/** A provider whose model listing failed, and so contributes nothing. */
export const skippedProviderSchema = z.object({
  provider: z.string(),
  /** Why the listing failed. */
  error: z.string(),
});
/** A provider whose model listing failed. */
export type SkippedProvider = z.infer<typeof skippedProviderSchema>;

/** The models of a provider, a workspace or the global endpoint. */
export const modelsResponseSchema = z.object({
  models: z.array(routedModelSchema),
  /** The providers left out because they could not be listed. */
  skipped: z.array(skippedProviderSchema),
});
/** The models of a provider, a workspace or the global endpoint. */
export type ModelsResponse = z.infer<typeof modelsResponseSchema>;

/** What a provider or one of its models has been asked for and has reported, since counting began. */
export const tokenUsageSchema = z.object({
  /** Requests the provider answered with a 2xx status. */
  requests: z.number().int().nonnegative(),
  /** Tokens sent to the model, as the provider reported them. */
  inputTokens: z.number().int().nonnegative(),
  /** Tokens the model produced, as the provider reported them. */
  outputTokens: z.number().int().nonnegative(),
});
/** Request and token counts. */
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

/** The usage of one model of a provider. */
export const modelUsageSchema = tokenUsageSchema.extend({
  /** The model's id at the provider. */
  upstreamId: z.string(),
});
/** The usage of one model of a provider. */
export type ModelUsage = z.infer<typeof modelUsageSchema>;

/** The usage of one day. */
export const dayUsageSchema = tokenUsageSchema.extend({
  /** The day as `YYYY-MM-DD`, in the router's own time zone. */
  day: z.string(),
});
/** The usage of one day. */
export type DayUsage = z.infer<typeof dayUsageSchema>;

/**
 * The usage of one provider: its totals, each model that has been called, and each recent day, newest first.
 * The totals are all-time, so they can exceed the sum of `days`, which only go back as far as the router keeps them.
 */
export const providerUsageSchema = tokenUsageSchema.extend({
  provider: z.string(),
  models: z.array(modelUsageSchema),
  days: z.array(dayUsageSchema),
});
/** The usage of one provider. */
export type ProviderUsage = z.infer<typeof providerUsageSchema>;

/** The usage of one model through one workspace. */
export const workspaceModelUsageSchema = modelUsageSchema.extend({
  /** The provider that served the model. */
  provider: z.string(),
});
/** The usage of one model through one workspace. */
export type WorkspaceModelUsage = z.infer<typeof workspaceModelUsageSchema>;

/** The usage of one workspace's endpoint: its totals, each model called through it, and each recent day, newest first. */
export const workspaceUsageSchema = tokenUsageSchema.extend({
  /** The workspace's slug. */
  workspace: z.string(),
  models: z.array(workspaceModelUsageSchema),
  days: z.array(dayUsageSchema),
});
/** The usage of one workspace's endpoint. */
export type WorkspaceUsage = z.infer<typeof workspaceUsageSchema>;

/** What `GET /api/usage` answers: every provider that has been called, and every workspace that has been called through. */
export const usageResponseSchema = z.object({
  providers: z.array(providerUsageSchema),
  workspaces: z.array(workspaceUsageSchema),
});
/** What `GET /api/usage` answers. */
export type UsageResponse = z.infer<typeof usageResponseSchema>;

/** A workspace as returned by the API: its stored config plus the derived endpoint path. */
export const workspaceStatusSchema = workspaceConfigSchema.extend({
  /** Path of the workspace's OpenAI base URL, e.g. "/w/my-workspace/v1". */
  path: z.string(),
});
/** A workspace's stored config plus its endpoint path. */
export type WorkspaceStatus = z.infer<typeof workspaceStatusSchema>;

/** Body of the create-workspace request. */
export const createWorkspaceRequestSchema = z.object({
  name: z.string().min(1).max(NAME_DEFAULTS.workspaceNameMaxLength),
  /** Slug for the URL; derived from `name` when omitted. */
  slug: workspaceSlugSchema.optional(),
  enabled: z.boolean().optional(),
  description: z.string().optional(),
  /** Members keyed by provider name; only listed providers are in the workspace. */
  members: z.record(z.string(), workspaceMemberSchema).optional(),
});
/** Body of the create-workspace request. */
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;

/** Body of the update-workspace request; an absent key is left unchanged. */
export const updateWorkspaceRequestSchema = z.object({
  name: z.string().min(1).max(NAME_DEFAULTS.workspaceNameMaxLength).optional(),
  enabled: z.boolean().optional(),
  /** An empty string clears it. */
  description: z.string().optional(),
  /** Full replacement of the members map when provided. */
  members: z.record(z.string(), workspaceMemberSchema).optional(),
});
/** Body of the update-workspace request. */
export type UpdateWorkspaceRequest = z.infer<typeof updateWorkspaceRequestSchema>;

/** What `GET /healthz` answers. No auth, so it says nothing but that the process is serving. */
export interface Health {
  ok: boolean;
  /** The released version. */
  version: string;
}

/** The router's own status: version, uptime, counts and whether auth is on. */
export const routerStatusSchema = z.object({
  version: z.string(),
  uptimeSeconds: z.number(),
  providerCount: z.number(),
  workspaceCount: z.number(),
  /** Whether a bearer token is required right now, the environment's override included. */
  authEnabled: z.boolean(),
});
/** The router's own status. */
export type RouterStatus = z.infer<typeof routerStatusSchema>;

/** The subset of settings.json editable from the UI. */
export const editableSettingsSchema = z.object({
  /** How long a provider may take to send response headers, in ms. */
  responseTimeoutMs: z.number().int().positive(),
  /** The stored auth switch. `SECURE_LOCAL_NET` turns auth off whatever it says. */
  authEnabled: z.boolean(),
  /** Extra browser Origins allowed to reach /v1. */
  allowedOrigins: z.array(z.string()),
});
/** What `GET` and `PATCH /api/settings` answer. */
export type EditableSettings = z.infer<typeof editableSettingsSchema>;

/** Body of `PATCH /api/settings`; an absent key is left unchanged. */
export const updateSettingsRequestSchema = editableSettingsSchema.partial();
/** Body of `PATCH /api/settings`. */
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;

/** What `POST /api/reload` answers. */
export const reloadResponseSchema = z.object({
  reloaded: z.boolean(),
  providerCount: z.number(),
  workspaceCount: z.number(),
});
/** What `POST /api/reload` answers. */
export type ReloadResponse = z.infer<typeof reloadResponseSchema>;

/** Standard error envelope for non-2xx /api responses. */
export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.enum(ErrorCode),
  detail: z.string().optional(),
});
/** The error envelope of a non-2xx /api response. */
export type ApiError = z.infer<typeof apiErrorSchema>;

/** The error envelope of a non-2xx /v1 response, in OpenAI's shape so its SDKs report it. */
export const openAiErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    param: z.string().nullable(),
    code: z.string().nullable(),
  }),
});
/** The error envelope of a non-2xx /v1 response. */
export type OpenAiErrorBody = z.infer<typeof openAiErrorSchema>;
