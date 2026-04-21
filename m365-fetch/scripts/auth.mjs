import { PublicClientApplication } from "@azure/msal-node";
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { paths, ensureDir } from "./config.mjs";

function buildPca(cfg) {
  const { TOKEN_CACHE_FILE } = paths();

  const cachePlugin = {
    async beforeCacheAccess(ctx) {
      if (existsSync(TOKEN_CACHE_FILE)) {
        ctx.tokenCache.deserialize(readFileSync(TOKEN_CACHE_FILE, "utf8"));
      }
    },
    async afterCacheAccess(ctx) {
      if (ctx.cacheHasChanged) {
        ensureDir(TOKEN_CACHE_FILE);
        writeFileSync(TOKEN_CACHE_FILE, ctx.tokenCache.serialize(), { mode: 0o600 });
        chmodSync(TOKEN_CACHE_FILE, 0o600);
      }
    },
  };

  return new PublicClientApplication({
    auth: {
      clientId: cfg.auth.client_id,
      authority: `https://login.microsoftonline.com/${cfg.auth.tenant_id}`,
    },
    cache: { cachePlugin },
    system: {
      loggerOptions: {
        loggerCallback: () => {},
        piiLoggingEnabled: false,
      },
    },
  });
}

// Resolve MSAL scopes for a given resource. Graph scopes are bare names
// (e.g. "Chat.Read") and get the `https://graph.microsoft.com/` prefix;
// Flow scopes are already fully-qualified URLs so we pass them through.
function scopesFor(cfg, resource) {
  if (resource === "flow") {
    return cfg.auth.flow_scopes;
  }
  return cfg.auth.graph_scopes.map((s) =>
    s.startsWith("https://") ? s : `https://graph.microsoft.com/${s}`,
  );
}

export async function login(cfg, resource = "graph") {
  const pca = buildPca(cfg);
  const result = await pca.acquireTokenByDeviceCode({
    scopes: scopesFor(cfg, resource),
    deviceCodeCallback: (info) => {
      process.stderr.write(`\n${info.message}\n\n`);
    },
  });
  if (!result?.accessToken) throw new Error("로그인 실패: accessToken 없음");
  return result;
}

export async function getAccessToken(cfg, resource = "graph") {
  const pca = buildPca(cfg);
  const cache = pca.getTokenCache();
  const accounts = await cache.getAllAccounts();
  const scopes = scopesFor(cfg, resource);

  if (accounts.length > 0) {
    try {
      const silent = await pca.acquireTokenSilent({
        account: accounts[0],
        scopes,
      });
      if (silent?.accessToken) return silent.accessToken;
    } catch (err) {
      process.stderr.write(
        `[m365-fetch] silent 갱신 실패 (${resource}), 재로그인 시도: ${err.message}\n`,
      );
    }
  }

  const fresh = await login(cfg, resource);
  return fresh.accessToken;
}

export async function clearTokenCache() {
  const { TOKEN_CACHE_FILE } = paths();
  if (existsSync(TOKEN_CACHE_FILE)) {
    writeFileSync(TOKEN_CACHE_FILE, "", { mode: 0o600 });
  }
}
