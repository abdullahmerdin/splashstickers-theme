import type { LoaderFunctionArgs } from "react-router";

import { requireAppProxy } from "../services/app-proxy.server";
import { json } from "../services/http.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireAppProxy(request);
  return json({ ok: true, service: "splash-stickers", contractVersion: 1, shop });
}
