interface Env {
  DB: D1Database;
  GAME_TABLE: DurableObjectNamespace;
  MAPS: R2Bucket;
  ASSETS: Fetcher;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  /**
   * Mode dev : active le bypass d'auth (cookie hd-dev-user) + /api/dev/*.
   * À ne JAMAIS définir en production — un 404 est renvoyé si absent, et les
   * requêtes dont le Host n'est pas local sont refusées même s'il est défini.
   */
  DEV_AUTH?: string;
}
