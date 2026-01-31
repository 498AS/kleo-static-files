const CADDY_ADMIN = process.env.CADDY_ADMIN_URL || "http://localhost:2019";
const DOMAIN = process.env.SF_DOMAIN || "498as.com";

interface CaddyRoute {
  "@id": string;
  match: { host: string[] }[];
  handle: {
    handler: string;
    root?: string;
    basic_auth?: {
      accounts: { username: string; password: string }[];
    };
  }[];
}

export async function addSite(name: string, fsPath: string, auth?: { user: string; hash: string }) {
  const route: CaddyRoute = {
    "@id": `sf-${name}`,
    match: [{ host: [`${name}.${DOMAIN}`] }],
    handle: [],
  };

  // Add basic auth if provided
  if (auth) {
    route.handle.push({
      handler: "authentication",
      basic_auth: {
        accounts: [{ username: auth.user, password: auth.hash }],
      },
    } as any);
  }

  // Add file server
  route.handle.push({
    handler: "file_server",
    root: fsPath,
  });

  const res = await fetch(`${CADDY_ADMIN}/config/apps/http/servers/srv0/routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(route),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Caddy error: ${text}`);
  }
}

export async function removeSite(name: string) {
  const res = await fetch(`${CADDY_ADMIN}/id/sf-${name}`, {
    method: "DELETE",
  });

  // 404 is ok - route might not exist
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Caddy error: ${text}`);
  }
}

export async function updateSiteAuth(name: string, fsPath: string, auth: { user: string; hash: string } | null) {
  // Remove and re-add with new auth
  await removeSite(name);
  await addSite(name, fsPath, auth || undefined);
}

export function getSiteUrl(name: string): string {
  return `https://${name}.${DOMAIN}`;
}
