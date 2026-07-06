import { NextRequest, NextResponse } from "next/server";
import { generateStructuredReport, isReportMode } from "@/lib/reports";

export async function POST(request: NextRequest) {
  let body: { mode?: string; topic?: string; context?: string };

  try {
    body = (await request.json()) as {
      mode?: string;
      topic?: string;
      context?: string;
    };
  } catch {
    return NextResponse.json({ error: "请求内容不是有效的 JSON。" }, { status: 400 });
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
    const result = await generateStructuredReport({
      mode,
      topic,
      context,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "报告生成失败，请稍后重试。",
      },
      { status: 502 },
    );
  }
}
