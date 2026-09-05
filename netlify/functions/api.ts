import type { Config, Context } from "@netlify/functions";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { handleApiRequest } from "../lib/router";

export const config: Config = { path: "/api/*" };

export default async (req: Request, _context: Context): Promise<Response> => {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResponse(401, { message: "Niet ingelogd." });

  const { data: claimsData, error: claimsError } = await supabaseAdmin.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) return jsonResponse(401, { message: "Niet ingelogd." });

  let body: unknown;
  if (req.method !== "GET" && req.method !== "DELETE") {
    try {
      body = await req.json();
    } catch {
      body = undefined;
    }
  }

  const url = new URL(req.url);
  const result = await handleApiRequest(req.method, url.pathname, url.searchParams, body, {
    userId: claimsData.claims.sub,
    userEmail: claimsData.claims.email ?? ""
  });

  return jsonResponse(result.status, result.body);
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
