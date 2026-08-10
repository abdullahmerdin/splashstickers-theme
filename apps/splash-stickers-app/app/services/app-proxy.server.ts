import { authenticate } from "../shopify.server";
import { apiError } from "./http.server";

export async function requireAppProxy(request: Request) {
  const context = await authenticate.public.appProxy(request);
  const session = "session" in context ? context.session : undefined;
  const signedShop = new URL(request.url).searchParams.get("shop");
  const shop = session?.shop || signedShop;

  if (!shop) {
    throw apiError(401, "app_not_installed", "Splash Stickers is not installed for this shop.");
  }

  return { context, shop: shop.toLowerCase() };
}
