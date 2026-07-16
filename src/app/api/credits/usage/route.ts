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
      key: `credit-usage:${user.id}`,
      limit: 20,
      windowMs: 60_000,
    });

    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.retryAfterSeconds);
    }

    const account = await getOrCreateCreditAccount({
      supabase,
      userId: user.id,
    });

    const { data: transactions, error } = await supabase
      .from("credit_transactions")
      .select("id,kind,delta,balance_after,feature,note,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      balance: account.balance,
      lifetimeGranted: account.lifetime_granted,
      lifetimeSpent: account.lifetime_spent,
      transactions: transactions ?? [],
    });
  } catch (error) {
    trace.error("credit_usage_failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "读取点数流水失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}

export const POST = withApiTrace("/api/credits/usage", handlePost);
