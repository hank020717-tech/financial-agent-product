import { NextRequest, NextResponse } from "next/server";
import { generateStructuredReport, isReportMode } from "@/lib/reports";
import {
  checkCredits,
  formatInsufficientCreditsMessage,
  spendCredits,
  type CreditFeature,
} from "@/lib/supabase/credits";
import { getAuthenticatedSupabaseUser } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  let body: {
    mode?: string;
    topic?: string;
    context?: string;
    accessToken?: string;
  };

  try {
    body = (await request.json()) as {
      mode?: string;
      topic?: string;
      context?: string;
      accessToken?: string;
    };
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
            : "请先登录后再生成报告。",
      },
      { status: 401 },
    );
  }

  const mode = body.mode || "";
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const context = typeof body.context === "string" ? body.context.trim() : "";

  if (!isReportMode(mode)) {
    return NextResponse.json({ error: "请选择有效的智能体能力。" }, { status: 400 });
  }

  if (!topic) {
    return NextResponse.json({ error: "请输入分析对象。" }, { status: 400 });
  }

  try {
    const feature = `report_${mode}` as CreditFeature;
    const creditCheck = await checkCredits({
      supabase: authContext.supabase,
      userId: authContext.user.id,
      feature,
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

    const result = await generateStructuredReport({
      mode,
      topic,
      context,
    });
    const credits = await spendCredits({
      supabase: authContext.supabase,
      feature,
      credits: creditCheck.cost,
      model: result.model,
      usage: result.usage,
      metadata: {
        intent: mode,
        source: "fixed-report",
        sectionCount: result.sectionCount,
      },
    });

    return NextResponse.json({
      mode: result.mode,
      title: result.title,
      report: result.report,
      sectionCount: result.sectionCount,
      credits,
    });
  } catch {
    return NextResponse.json(
      {
        error: "报告生成失败，请稍后重试。",
      },
      { status: 502 },
    );
  }
}
