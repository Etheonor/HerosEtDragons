interface Env {
  DB: D1Database;
  GAME_TABLE: DurableObjectNamespace;
  MAPS: R2Bucket;
  ASSETS: Fetcher;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
}
