declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AUTH_PROVIDER?: "sites" | "cloudflare-access";
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
    INITIAL_ADMIN_EMAIL?: string;
    MAP_PROVIDER?: string;
    APP_ENV?: string;
    GOOGLE_MAPS_MODE?: string;
    GOOGLE_MAPS_DEMO_KEY?: string;
    GOOGLE_MAPS_BROWSER_KEY?: string;
    GOOGLE_MAPS_MAP_ID?: string;
    GOOGLE_ROUTES_KEY?: string;
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_JWK?: string;
    VAPID_SUBJECT?: string;
  }
}
