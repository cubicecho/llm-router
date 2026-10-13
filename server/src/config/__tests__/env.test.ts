import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HTTP_DEFAULTS } from '../../core/defaults.ts';
import {
  authDisabledByEnv,
  dataDir,
  envToken,
  keepAliveTimeoutMs,
  listenHost,
  listenPort,
  outboundKeepAliveTimeoutMs,
  refusePlaceholderToken,
} from '../env.ts';

const SETTINGS_PORT = 3000;

describe('dataDir', () => {
  it('is DATA_DIR as an absolute path, or ./data', () => {
    expect(dataDir({ DATA_DIR: '/srv/router' })).toBe('/srv/router');
    expect(dataDir({ DATA_DIR: 'relative' })).toBe(path.resolve('relative'));
    expect(dataDir({})).toBe(path.resolve('./data'));
  });
});

describe('listenPort', () => {
  it('is the settings port when PORT is unset or empty', () => {
    expect(listenPort(SETTINGS_PORT, {})).toBe(SETTINGS_PORT);
    expect(listenPort(SETTINGS_PORT, { PORT: '' })).toBe(SETTINGS_PORT);
  });

  it('is PORT when that is a port number', () => {
    expect(listenPort(SETTINGS_PORT, { PORT: '8080' })).toBe(8080);
    expect(listenPort(SETTINGS_PORT, { PORT: '0' })).toBe(0);
  });

  it('refuses a PORT that is not a port number, naming the value', () => {
    for (const PORT of ['http', '80.5', '-1', '65536']) {
      expect(() => listenPort(SETTINGS_PORT, { PORT })).toThrow(`PORT is "${PORT}"`);
    }
  });
});

describe('listenHost', () => {
  it('is HOST, then the settings host, then every interface', () => {
    expect(listenHost('127.0.0.1', { HOST: '0.0.0.0' })).toBe('0.0.0.0');
    expect(listenHost('127.0.0.1', {})).toBe('127.0.0.1');
    expect(listenHost(undefined, {})).toBeUndefined();
  });
});

describe('authDisabledByEnv', () => {
  it('is true for a truthy SECURE_LOCAL_NET, in any case and with spaces around it', () => {
    for (const SECURE_LOCAL_NET of ['1', 'true', 'YES', ' on ']) {
      expect(authDisabledByEnv({ SECURE_LOCAL_NET })).toBe(true);
    }
  });

  it('is false when it is unset or anything else', () => {
    expect(authDisabledByEnv({})).toBe(false);
    for (const SECURE_LOCAL_NET of ['', '0', 'false', 'no', 'maybe']) {
      expect(authDisabledByEnv({ SECURE_LOCAL_NET })).toBe(false);
    }
  });
});

describe('envToken', () => {
  it('is LLM_ROUTER_TOKEN, and undefined when that is unset or empty', () => {
    expect(envToken({ LLM_ROUTER_TOKEN: 'secret' })).toBe('secret');
    expect(envToken({ LLM_ROUTER_TOKEN: '' })).toBeUndefined();
    expect(envToken({})).toBeUndefined();
  });
});

describe('keepAliveTimeoutMs', () => {
  it('is HTTP_KEEP_ALIVE_TIMEOUT_MS when that is a whole number from zero up', () => {
    expect(keepAliveTimeoutMs({ HTTP_KEEP_ALIVE_TIMEOUT_MS: '1500' })).toBe(1500);
    expect(keepAliveTimeoutMs({ HTTP_KEEP_ALIVE_TIMEOUT_MS: '0' })).toBe(0);
  });

  it('falls back to the default for anything else', () => {
    for (const HTTP_KEEP_ALIVE_TIMEOUT_MS of [undefined, '', ' ', 'soon', '1.5', '-1']) {
      expect(keepAliveTimeoutMs({ HTTP_KEEP_ALIVE_TIMEOUT_MS })).toBe(HTTP_DEFAULTS.keepAliveTimeoutMs);
    }
  });
});

describe('outboundKeepAliveTimeoutMs', () => {
  it('is HTTP_OUTBOUND_KEEP_ALIVE_TIMEOUT_MS when that is a positive whole number', () => {
    expect(outboundKeepAliveTimeoutMs({ HTTP_OUTBOUND_KEEP_ALIVE_TIMEOUT_MS: '1500' })).toBe(1500);
  });

  it('falls back to the default for zero and anything else', () => {
    for (const HTTP_OUTBOUND_KEEP_ALIVE_TIMEOUT_MS of [undefined, '0', 'soon']) {
      expect(outboundKeepAliveTimeoutMs({ HTTP_OUTBOUND_KEEP_ALIVE_TIMEOUT_MS })).toBe(
        HTTP_DEFAULTS.outboundKeepAliveTimeoutMs,
      );
    }
  });
});

describe('refusePlaceholderToken', () => {
  it('refuses the placeholder token from .env.example', () => {
    expect(() => refusePlaceholderToken({ LLM_ROUTER_TOKEN: 'change-me' })).toThrow('placeholder');
  });

  it('lets the placeholder through when auth is off anyway', () => {
    expect(() => refusePlaceholderToken({ LLM_ROUTER_TOKEN: 'change-me', SECURE_LOCAL_NET: '1' })).not.toThrow();
  });

  it('lets any other token, or none, through', () => {
    expect(() => refusePlaceholderToken({ LLM_ROUTER_TOKEN: 'long-random-value' })).not.toThrow();
    expect(() => refusePlaceholderToken({})).not.toThrow();
  });
});
