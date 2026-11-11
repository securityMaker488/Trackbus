declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AUTH_PROVIDER?: "sites" | "cloudflare-access";
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
    INITIAL_ADMIN_EMAIL?: string;
  }
}
