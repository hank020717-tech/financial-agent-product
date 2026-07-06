import { NextRequest, NextResponse } from "next/server";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type DeepSeekChoice = {
  finish_reason?: string;
  message?: {
    content?: string;
  };
};

const deepSeekApiUrl = "https://api.deepseek.com/chat/completions";
const maxOutputTokens = 4096;
const maxContinuationRequests = 2;

const systemPrompt = `你是阿U智能体，一个面向金融市场研究的中文 AI 助手。
你的回答要清晰、克制、结构化，优先帮助用户理解市场、公司、行业、文件和风险。
你可以做信息整理、研究框架、分析思路、报告草稿和风险提示。
你不能承诺收益，不能给出保证性投资结论，也不能替代持牌金融顾问。
涉及投资判断时，要明确说明这只是研究参考，不构成投资建议。`;

async function callDeepSeek({
  apiKey,
  model,
  messages,
}: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
}) {
  const response = await fetch(deepSeekApiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: maxOutputTokens,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        "DeepSeek 返回了错误，请检查 API Key、模型名称或账户额度。",
    );
  }

  const choice = data?.choices?.[0] as DeepSeekChoice | undefined;
  const answer = choice?.message?.content;

  if (!answer) {
    throw new Error("DeepSeek 没有返回有效回答。");
  }

  return {
    answer,
    finishReason: choice?.finish_reason,
  };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "DeepSeek API Key 还没有配置。请在项目根目录创建 .env.local，并设置 DEEPSEEK_API_KEY。",
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

  const recentMessages = userMessages.slice(-12);
  const conversation: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...recentMessages,
  ];

  try {
    const firstResult = await callDeepSeek({ apiKey, model, messages: conversation });
    const answerParts = [firstResult.answer];
    let finishReason = firstResult.finishReason;

    for (
      let continuationCount = 0;
      finishReason === "length" && continuationCount < maxContinuationRequests;
      continuationCount += 1
    ) {
      const continuationMessages: ChatMessage[] = [
        ...conversation,
        { role: "assistant", content: answerParts.join("\n\n") },
        {
          role: "user",
          content:
            "你的上一条回答因为长度限制中断了。请从中断处继续，不要重复已经输出的内容，并自然补完剩余部分。",
        },
      ];

      const continuationResult = await callDeepSeek({
        apiKey,
        model,
        messages: continuationMessages,
      });

      answerParts.push(continuationResult.answer);
      finishReason = continuationResult.finishReason;
    }

    const answer = answerParts.join("\n\n");

    return NextResponse.json({
      answer,
      model,
      wasContinued: answerParts.length > 1,
      finishReason,
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
