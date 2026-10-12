import { ErrorCode, HttpStatus, type SettingsFile } from '@llm-router/shared';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  type AuthConfig,
  createAuthMiddleware,
  createOriginMiddleware,
  effectiveAuth,
  isLoopbackOrigin,
  tokensEqual,
} from '../middleware.ts';

const STORED: Pick<SettingsFile, 'authEnabled' | 'authToken'> = { authEnabled: true, authToken: 'stored-token' };

/** Builds an app with one guarded route that answers 200. */
function guarded(...guards: express.RequestHandler[]): express.Express {
  const app = express();
  app.get('/', ...guards, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

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

describe('tokensEqual', () => {
  it('matches identical tokens only', () => {
    expect(tokensEqual('secret', 'secret')).toBe(true);
    expect(tokensEqual('secret', 'secreT')).toBe(false);
  });

  it('compares tokens of different lengths without throwing', () => {
    expect(tokensEqual('secret', 'secret-and-more')).toBe(false);
  });
});

describe('isLoopbackOrigin', () => {
  it('accepts localhost, 127.0.0.1 and ::1 on any port', () => {
    expect(isLoopbackOrigin('http://localhost:3000')).toBe(true);
    expect(isLoopbackOrigin('http://127.0.0.1')).toBe(true);
    expect(isLoopbackOrigin('http://[::1]:8080')).toBe(true);
  });

  it('rejects any other host, and a value that is not a URL', () => {
    expect(isLoopbackOrigin('https://evil.example')).toBe(false);
    expect(isLoopbackOrigin('http://localhost.evil.example')).toBe(false);
    expect(isLoopbackOrigin('not a url')).toBe(false);
  });
});

describe('createOriginMiddleware', () => {
  const app = guarded(createOriginMiddleware(() => ['https://allowed.example']));

  it('passes a request with no Origin', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(HttpStatus.Ok);
  });

  it('passes a loopback Origin', async () => {
    const res = await request(app).get('/').set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(HttpStatus.Ok);
  });

  it('passes an Origin the operator allowed', async () => {
    const res = await request(app).get('/').set('Origin', 'https://allowed.example');
    expect(res.status).toBe(HttpStatus.Ok);
  });

  it('refuses any other Origin with a 403', async () => {
    const res = await request(app).get('/').set('Origin', 'https://evil.example');
    expect(res.status).toBe(HttpStatus.Forbidden);
    expect(res.body.code).toBe(ErrorCode.Forbidden);
  });
});

describe('createAuthMiddleware', () => {
  const appWith = (auth: AuthConfig) => guarded(createAuthMiddleware(() => auth));

  it('passes everything when auth is off', async () => {
    const res = await request(appWith({ enabled: false, token: null })).get('/');
    expect(res.status).toBe(HttpStatus.Ok);
  });

  it('passes the right bearer token, with the scheme in any case', async () => {
    const app = appWith({ enabled: true, token: 'secret' });
    expect((await request(app).get('/').set('Authorization', 'Bearer secret')).status).toBe(HttpStatus.Ok);
    expect((await request(app).get('/').set('Authorization', 'bearer secret')).status).toBe(HttpStatus.Ok);
  });

  it('refuses a missing or wrong token with a 401', async () => {
    const app = appWith({ enabled: true, token: 'secret' });
    const missing = await request(app).get('/');
    const wrong = await request(app).get('/').set('Authorization', 'Bearer nope');
    expect(missing.status).toBe(HttpStatus.Unauthorized);
    expect(wrong.status).toBe(HttpStatus.Unauthorized);
    expect(wrong.body.code).toBe(ErrorCode.Unauthenticated);
  });

  it('refuses every request while auth is on and no token is configured', async () => {
    const res = await request(appWith({ enabled: true, token: null }))
      .get('/')
      .set('Authorization', 'Bearer anything');
    expect(res.status).toBe(HttpStatus.Unauthorized);
  });

  it('writes the refusal with the responder it was given', async () => {
    const app = guarded(
      createAuthMiddleware(
        () => ({ enabled: true, token: 'secret' }),
        (res, error) => {
          res.status(error.status).json({ custom: error.code });
        },
      ),
    );
    const res = await request(app).get('/');
    expect(res.body).toEqual({ custom: ErrorCode.Unauthenticated });
  });
});
