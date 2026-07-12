import { NextRequest, NextResponse } from "next/server";
import { fetchTwelveDataQuote, resolveQuoteTarget } from "@/lib/quotes";
import {
  checkCredits,
  formatInsufficientCreditsMessage,
  spendCredits,
} from "@/lib/supabase/credits";
import { getAuthenticatedSupabaseUser } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  let body: { query?: string; accessToken?: string };

  try {
    body = (await request.json()) as { query?: string; accessToken?: string };
  } catch {
    return NextResponse.json({ error: "请求内容不是有效的 JSON。" }, { status: 400 });
  }

  const accessToken =
    typeof body.accessToken === "string" && body.accessToken.trim().length > 0
      ? body.accessToken
      : undefined;

  let authContext: Awaited<ReturnType<typeof getAuthenticatedSupabaseUser>>;

  try {
    authContext = await getAuthenticatedSupabaseUser(accessToken);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "请先登录后再查询实时行情。",
      },
      { status: 401 },
    );
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";

  if (!query) {
    return NextResponse.json({ error: "请输入要查询的标的。" }, { status: 400 });
  }

  const target = resolveQuoteTarget(query);

  if (!target) {
    return NextResponse.json(
      { error: "暂未识别该标的，请尝试输入黄金、BTC、NVDA、标普500等。" },
      { status: 400 },
    );
  }

  try {
    const creditCheck = await checkCredits({
      supabase: authContext.supabase,
      userId: authContext.user.id,
      feature: "quote",
    });

    if (!creditCheck.ok) {
      return NextResponse.json(
        {
          error: formatInsufficientCreditsMessage({
            balance: creditCheck.balance,
            cost: creditCheck.cost,
          }),
          credits: {
            balance: creditCheck.balance,
            required: creditCheck.cost,
          },
        },
        { status: 402 },
      );
    }

    const quote = await fetchTwelveDataQuote({ target, query });
    const credits = await spendCredits({
      supabase: authContext.supabase,
      feature: "quote",
      credits: creditCheck.cost,
      model: "market-data",
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      metadata: {
        source: "quote-api",
        symbol: target.symbol,
      },
    });

    return NextResponse.json({ quote, credits });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "实时行情查询失败。",
      },
      { status: 502 },
    );
  }
}
