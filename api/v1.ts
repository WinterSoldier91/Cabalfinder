import type { IncomingMessage, ServerResponse } from "node:http";
import handler from "../apps/api/src/vercel.js";

export default async function v1Handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.url) {
    const url = new URL(req.url, "http://localhost");
    const pathParam = url.searchParams.get("path")?.replace(/^\/+/, "") ?? "";
    url.searchParams.delete("path");

    const pathname = `/v1${pathParam ? `/${pathParam}` : ""}`;
    const query = url.searchParams.toString();
    req.url = query ? `${pathname}?${query}` : pathname;
  }

  return handler(req, res);
}
