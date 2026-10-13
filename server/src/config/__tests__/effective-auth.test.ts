import type { SettingsFile } from '@llm-router/shared';
import { describe, expect, it } from 'vitest';
import { effectiveAuth } from '../effective-auth.ts';

const STORED: Pick<SettingsFile, 'authEnabled' | 'authToken'> = { authEnabled: true, authToken: 'stored-token' };

describe('effectiveAuth', () => {
  it('takes the settings as they are when the environment says nothing', () => {
    expect(effectiveAuth(STORED, {})).toEqual({ enabled: true, token: 'stored-token' });
  });

  it('turns auth off for SECURE_LOCAL_NET, whatever settings.json says', () => {
    expect(effectiveAuth(STORED, { SECURE_LOCAL_NET: 'true' }).enabled).toBe(false);
  });

  it('stays off when settings.json turns it off', () => {
    expect(effectiveAuth({ authEnabled: false, authToken: null }, {}).enabled).toBe(false);
  });

  it('replaces the stored token with LLM_ROUTER_TOKEN', () => {
    expect(effectiveAuth(STORED, { LLM_ROUTER_TOKEN: 'from-env' }).token).toBe('from-env');
  });

  it('has no token when neither holds one', () => {
    expect(effectiveAuth({ authEnabled: true, authToken: null }, {}).token).toBeNull();
  });
});
