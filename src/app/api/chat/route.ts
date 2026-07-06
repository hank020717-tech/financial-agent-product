import { NextRequest, NextResponse } from "next/server";
import {
  ChatMessage,
  completeWithContinuation,
  getDeepSeekConfig,
} from "@/lib/deepseek";
import {
  fetchTwelveDataQuote,
  formatQuoteForPrompt,
  hasRealtimeQuoteIntent,
  resolveQuoteTarget,
} from "@/lib/quotes";

const systemPrompt = `你是阿U智能体，一个面向金融市场研究的中文 AI 助手。
你的回答要清晰、克制、结构化，优先帮助用户理解市场、公司、行业、文件和风险。
你可以做信息整理、研究框架、分析思路、报告草稿和风险提示。
你不能承诺收益，不能给出保证性投资结论，也不能替代持牌金融顾问。
涉及投资判断时，要明确说明这只是研究参考，不构成投资建议。`;

const realtimeQuotePrompt = `你是阿U智能体。用户正在询问实时行情。
你必须只基于工具返回的行情数据回答，不要用模型记忆补价格。
回答要包含：标的、最新价格、数据时间、数据来源、必要的延迟或交易时段提醒。
可以简短解释价格含义，但不能扩展成投资建议。`;

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
    const latestUserMessage = [...userMessages]
      .reverse()
      .find((message) => message.role === "user");

    if (
      latestUserMessage &&
      hasRealtimeQuoteIntent(latestUserMessage.content)
    ) {
      const target = resolveQuoteTarget(latestUserMessage.content);

      if (!target) {
        return NextResponse.json({
          answer:
            "我识别到你在问实时行情，但暂时没有识别出具体标的。你可以试试输入：黄金、BTC、NVDA、标普500、原油、美元指数等。",
          model: config.model,
        });
      }

      const quote = await fetchTwelveDataQuote({
        target,
        query: latestUserMessage.content,
      });

      const quoteResult = await completeWithContinuation({
        ...config,
        messages: [
          { role: "system", content: realtimeQuotePrompt },
          {
            role: "user",
            content: `用户问题：${latestUserMessage.content}\n\n行情工具返回：\n${formatQuoteForPrompt(quote)}`,
          },
        ],
        maxContinuationRequests: 0,
      });

      return NextResponse.json({
        answer: quoteResult.answer,
        model: config.model,
        quote,
        toolUsed: "quote",
      });
    }

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
