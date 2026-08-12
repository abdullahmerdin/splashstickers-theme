import { json } from "../services/http.server";

/**
 * Render health checks must not require Shopify authentication or a database
 * round trip. The container only reaches this route after startup migrations
 * have completed successfully.
 */
export function loader() {
  return json({ ok: true, service: "splash-stickers" });
}
