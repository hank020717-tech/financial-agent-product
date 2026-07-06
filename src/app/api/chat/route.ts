import { NextRequest, NextResponse } from "next/server";
import {
  ChatMessage,
  completeWithContinuation,
  getDeepSeekConfig,
} from "@/lib/deepseek";

const systemPrompt = `你是阿U智能体，一个面向金融市场研究的中文 AI 助手。
你的回答要清晰、克制、结构化，优先帮助用户理解市场、公司、行业、文件和风险。
你可以做信息整理、研究框架、分析思路、报告草稿和风险提示。
你不能承诺收益，不能给出保证性投资结论，也不能替代持牌金融顾问。
涉及投资判断时，要明确说明这只是研究参考，不构成投资建议。`;

export async function POST(request: NextRequest) {
  let config: ReturnType<typeof getDeepSeekConfig>;

  try {
    config = getDeepSeekConfig();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "DeepSeek API Key 还没有配置。",
      },
      { status: 500 },
    );
  }

  let messages: ChatMessage[];

  try {
    const body = (await request.json()) as { messages?: ChatMessage[] };
    messages = Array.isArray(body.messages) ? body.messages : [];
  } catch {
    return NextResponse.json({ error: "请求内容不是有效的 JSON。" }, { status: 400 });
  }

  const userMessages = messages.filter(
    (message) =>
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string" &&
      message.content.trim().length > 0,
  );

  if (userMessages.length === 0) {
    return NextResponse.json({ error: "请先输入一个问题。" }, { status: 400 });
  }

  const conversation: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...userMessages.slice(-12),
  ];

  try {
    const result = await completeWithContinuation({
      ...config,
      messages: conversation,
    });

    return NextResponse.json({
      answer: result.answer,
      model: config.model,
      wasContinued: result.wasContinued,
      finishReason: result.finishReason,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "连接 DeepSeek 失败，请稍后重试。",
      },
      { status: 502 },
    );
  }
}
