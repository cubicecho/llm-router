import {
  authDisabledByEnv,
  dataDir as envDataDir,
  envToken,
  listenHost,
  listenPort,
  refusePlaceholderToken,
} from './config/env.ts';
import { ConfigStore } from './config/store.ts';
import { createApp } from './http/app.ts';
import { stopOnSignals } from './http/shutdown.ts';
import { tuneInbound } from './http/tuning.ts';
import { UsageStore } from './usage/store.ts';

/** Loads the config, starts the HTTP server, and arranges a graceful stop on SIGTERM or SIGINT. */
async function main(): Promise<void> {
  refusePlaceholderToken();
  const dataDir = envDataDir();
  const store = new ConfigStore(dataDir);
  await store.init();
  store.on('change', (state) => {
    console.log(
      `[config] changed on disk: ${state.providers.length} provider(s), ${state.workspaces.length} workspace(s)`,
    );
  });
  store.startWatching();

  const usage = new UsageStore(dataDir);
  await usage.init();

  const app = createApp({ store, usage });
  const port = listenPort(store.getSettings().port);
  // Unset binds all interfaces (Docker/LAN); set HOST=127.0.0.1 to restrict to localhost.
  const host = listenHost(store.getSettings().host);
  const onListen = () => {
    console.log(`[server] listening on http://${host ?? 'localhost'}:${port} (data dir: ${dataDir})`);
    const isOpenByEnv = authDisabledByEnv();
    const isOpenBySettings = store.getSettings().authEnabled === false;
    const isTokenFromEnv = envToken() !== undefined;
    if (isOpenByEnv) {
      console.warn('[auth] SECURE_LOCAL_NET is on: /api and /v1 are open to this network. Private networks only.');
    } else if (isOpenBySettings) {
      console.warn('[auth] authEnabled is false in settings.json: /api and /v1 are open.');
    } else if (isTokenFromEnv) {
      console.log('[auth] bearer token from LLM_ROUTER_TOKEN, which overrides settings.json');
    } else {
      // The path, never the token: boot logs are kept and shipped, and the token is printed once, when it is generated.
      console.log(`[auth] bearer token is authToken in ${store.settingsFile}`);
    }
  };
  const httpServer = host ? app.listen(port, host, onListen) : app.listen(port, onListen);
  tuneInbound(httpServer);

  // The watcher stops first, so a config edit during the drain reloads nothing.
  // The counts are written last, once the requests that add to them have finished.
  stopOnSignals(httpServer, { before: () => store.close(), after: () => usage.close() });
}

main().catch((err: unknown) => {
  console.error('[server] could not start:', err);
  process.exit(1);
});
