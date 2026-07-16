import { NextRequest, NextResponse } from "next/server";
import {
  checkApiRateLimit,
  rateLimitResponse,
  withApiTrace,
} from "@/lib/api-runtime";
import { getOrCreateCreditAccount } from "@/lib/supabase/credits";
import { getAuthenticatedSupabaseUser } from "@/lib/supabase/server";

async function handlePost(
  request: NextRequest,
  trace: Parameters<Parameters<typeof withApiTrace>[1]>[1],
) {
  let accessToken: string | undefined;

  try {
    const body = (await request.json()) as { accessToken?: string };
    accessToken =
      typeof body.accessToken === "string" && body.accessToken.trim().length > 0
        ? body.accessToken
        : undefined;
  } catch {
    return NextResponse.json({ error: "请求内容不是有效的 JSON。" }, { status: 400 });
  }

  try {
    const { supabase, user } = await getAuthenticatedSupabaseUser(accessToken);
    const rateLimit = checkApiRateLimit({
      key: `credits:${user.id}`,
      limit: 30,
      windowMs: 60_000,
    });

    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.retryAfterSeconds);
    }

    const account = await getOrCreateCreditAccount({
      supabase,
      userId: user.id,
    });

    return NextResponse.json({
      balance: account.balance,
      lifetimeGranted: account.lifetime_granted,
      lifetimeSpent: account.lifetime_spent,
    });
  } catch (error) {
    trace.error("credits_failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "读取账户点数失败，请稍后重试。",
      },
      { status: 401 },
    );
  }
}

export const POST = withApiTrace("/api/credits", handlePost);
