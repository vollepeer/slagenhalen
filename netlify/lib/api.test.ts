import { describe, expect, it, vi } from "vitest";

vi.mock("./supabaseAdmin", () => ({
  supabaseAdmin: {
    auth: {
      getClaims: vi.fn()
    }
  }
}));

vi.mock("./router", () => ({
  handleApiRequest: vi.fn()
}));

import { supabaseAdmin } from "./supabaseAdmin";
import { handleApiRequest } from "./router";
import handler from "../functions/api";

describe("api function entrypoint", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const response = await handler(new Request("http://localhost/api/players"), {} as never);
    expect(response.status).toBe(401);
  });

  it("returns 401 when local JWT verification fails", async () => {
    vi.mocked(supabaseAdmin.auth.getClaims).mockResolvedValue({
      data: null,
      error: { message: "Invalid JWT signature" }
    } as never);

    const response = await handler(
      new Request("http://localhost/api/players", { headers: { authorization: "Bearer badtoken" } }),
      {} as never
    );

    expect(response.status).toBe(401);
  });

  it("passes the verified claims' sub/email to handleApiRequest and returns its result", async () => {
    vi.mocked(supabaseAdmin.auth.getClaims).mockResolvedValue({
      data: { claims: { sub: "user-123", email: "jan@example.com" } },
      error: null
    } as never);
    vi.mocked(handleApiRequest).mockResolvedValue({ status: 200, body: { ok: true } });

    const response = await handler(
      new Request("http://localhost/api/players", { headers: { authorization: "Bearer goodtoken" } }),
      {} as never
    );

    expect(handleApiRequest).toHaveBeenCalledWith(
      "GET",
      "/api/players",
      expect.any(URLSearchParams),
      undefined,
      { userId: "user-123", userEmail: "jan@example.com" }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("defaults userEmail to an empty string when the claims omit it", async () => {
    vi.mocked(supabaseAdmin.auth.getClaims).mockResolvedValue({
      data: { claims: { sub: "user-456" } },
      error: null
    } as never);
    vi.mocked(handleApiRequest).mockResolvedValue({ status: 200, body: { ok: true } });

    await handler(
      new Request("http://localhost/api/players", { headers: { authorization: "Bearer goodtoken" } }),
      {} as never
    );

    expect(handleApiRequest).toHaveBeenCalledWith(
      "GET",
      "/api/players",
      expect.any(URLSearchParams),
      undefined,
      { userId: "user-456", userEmail: "" }
    );
  });
});
