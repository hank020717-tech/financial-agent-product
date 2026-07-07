import { NextRequest, NextResponse } from "next/server";
import {
  ChatMessage,
  completeWithContinuation,
  getDeepSeekConfig,
} from "@/lib/deepseek";
import { resolveAgentIntent } from "@/lib/agent-router";
import { generateStructuredReport, reportTemplates } from "@/lib/reports";
import {
  hasKnowledgeQuestionIntent,
  RetrievedKnowledgeChunk,
  searchKnowledgeChunks,
} from "@/lib/supabase/knowledge";
import { createSupabaseUserClient } from "@/lib/supabase/server";
import {
  fetchTwelveDataQuote,
  formatQuoteForPrompt,
  hasRealtimeQuoteIntent,
  resolveQuoteTarget,
} from "@/lib/quotes";

const systemPrompt = `你是阿U智能体，一个面向金融市场研究的中文 AI 助手。你的回答要清晰、克制、结构化，优先帮助用户理解市场、公司、行业、文件和风险。你可以做信息整理、研究框架、分析思路、报告草稿和风险提示。你不能承诺收益，不能给出保证性投资结论，也不能替代持牌金融顾问。涉及投资判断时，要明确说明这只是研究参考，不构成投资建议。`;

const realtimeQuotePrompt = `你是阿U智能体。用户正在询问实时行情。你必须只基于工具返回的行情数据回答，不要用模型记忆补价格。回答要包含：标的、最新价格、数据时间、数据来源、必要的延迟或交易时段提醒。可以简短解释价格含义，但不能扩展成投资建议。`;

const knowledgePrompt = `你是阿U智能体，正在回答用户基于已保存资料的问题。你必须优先基于提供的资料片段回答，不要编造片段里没有的信息。若资料不足，要明确说“现有资料不足以确认”，并列出还需要补充哪些信息。输出要结构清晰，可以按要点、风险、结论和下一步建议组织。所有内容仅供研究参考，不构成投资建议。不要暴露数据库、向量、chunk 等技术实现。`;

function getLatestUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user");
}

async function answerRealtimeQuote({
  question,
  model,
  apiKey,
}: {
  question: string;
  model: string;
  apiKey: string;
}) {
  const target = resolveQuoteTarget(question);

  if (!target) {
    return {
      answer:
        "我识别到你在问实时行情，但还没有识别出具体标的。你可以试试输入：黄金、BTC、NVDA、标普500、原油、美元指数等。",
      toolUsed: "quote",
    };
  }

  const quote = await fetchTwelveDataQuote({
    target,
    query: question,
  });

  const quoteResult = await completeWithContinuation({
    apiKey,
    model,
    messages: [
      { role: "system", content: realtimeQuotePrompt },
      {
        role: "user",
        content: `用户问题：${question}\n\n行情工具返回：\n${formatQuoteForPrompt(quote)}`,
      },
    ],
    maxContinuationRequests: 0,
  });

  return {
    answer: quoteResult.answer,
    quote,
    toolUsed: "quote",
  };
}

function formatKnowledgeForPrompt(chunks: RetrievedKnowledgeChunk[]) {
  return chunks
    .map(
      (chunk, index) =>
        `片段 ${index + 1}\n标题：${chunk.title}\n来源：${chunk.sourceType}\n内容：${chunk.content}`,
    )
    .join("\n\n---\n\n");
}

function formatKnowledgeSourceNotice(chunks: RetrievedKnowledgeChunk[]) {
  const titles = [...new Set(chunks.map((chunk) => chunk.title))]
    .filter(Boolean)
    .slice(0, 3);

  if (titles.length === 0) return "已参考你保存过的资料。";

  return `已参考你保存过的资料：${titles.join("、")}。`;
}

async function answerFromKnowledgeBase({
  question,
  accessToken,
  model,
  apiKey,
}: {
  question: string;
  accessToken?: string;
  model: string;
  apiKey: string;
}) {
  if (!accessToken) {
    return {
      answer:
        "我识别到你想基于个人知识库回答，但当前没有拿到登录凭证。请先登录，然后重新提问，例如：根据我上传过的BP，总结核心风险。",
      toolUsed: "knowledge",
      knowledgeMatches: [],
    };
  }

  const supabase = createSupabaseUserClient(accessToken);
  const chunks = await searchKnowledgeChunks({
    supabase,
    question,
  });

  if (chunks.length === 0) {
    return {
      answer:
        "我还没有检索到可用的知识库内容。你可以先上传文件并完成分析，系统会把分析结果沉淀到知识库里，然后再问：根据我上传过的资料，总结项目风险。",
      toolUsed: "knowledge",
      knowledgeMatches: [],
    };
  }

  const result = await completeWithContinuation({
    apiKey,
    model,
    messages: [
      { role: "system", content: knowledgePrompt },
      {
        role: "user",
        content: `用户问题：${question}\n\n知识库片段：\n${formatKnowledgeForPrompt(chunks)}`,
      },
    ],
  });

  return {
    answer: `${formatKnowledgeSourceNotice(chunks)}\n\n${result.answer}`,
    wasContinued: result.wasContinued,
    finishReason: result.finishReason,
    toolUsed: "knowledge",
    knowledgeMatches: chunks.map((chunk) => ({
      id: chunk.id,
      title: chunk.title,
      sourceType: chunk.sourceType,
      score: chunk.score,
    })),
  };
}

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
  let accessToken: string | undefined;

  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[];
      accessToken?: string;
    };
    messages = Array.isArray(body.messages) ? body.messages : [];
    accessToken =
      typeof body.accessToken === "string" && body.accessToken.trim().length > 0
        ? body.accessToken
        : undefined;
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

  const latestUserMessage = getLatestUserMessage(userMessages);

  if (!latestUserMessage) {
    return NextResponse.json({ error: "请先输入一个问题。" }, { status: 400 });
  }

  const intent = resolveAgentIntent(latestUserMessage.content);

  try {
    if (intent.type === "quote" || hasRealtimeQuoteIntent(latestUserMessage.content)) {
      const quoteAnswer = await answerRealtimeQuote({
        question: latestUserMessage.content,
        apiKey: config.apiKey,
        model: config.model,
      });

      return NextResponse.json({
        ...quoteAnswer,
        model: config.model,
        intent: "quote",
      });
    }

    if (hasKnowledgeQuestionIntent(latestUserMessage.content)) {
      const knowledgeAnswer = await answerFromKnowledgeBase({
        question: latestUserMessage.content,
        accessToken,
        apiKey: config.apiKey,
        model: config.model,
      });

      return NextResponse.json({
        ...knowledgeAnswer,
        model: config.model,
        intent: "knowledge",
      });
    }

    if (intent.type === "report") {
      if (!intent.topic) {
        return NextResponse.json({
          answer: `我已经识别到你想生成「${reportTemplates[intent.mode].title}」，但还缺少分析对象。你可以补一句具体标的、行业或项目名称。`,
          model: config.model,
          intent: intent.mode,
        });
      }

      const target = resolveQuoteTarget(latestUserMessage.content);
      let context = intent.context;

      if (intent.mode === "stock" && target) {
        try {
          const quote = await fetchTwelveDataQuote({
            target,
            query: latestUserMessage.content,
          });

          context = [
            intent.context,
            "自动调用实时行情工具得到的辅助信息：",
            formatQuoteForPrompt(quote),
          ].join("\n\n");
        } catch (error) {
          context = [
            intent.context,
            `实时行情工具暂时没有成功返回数据：${
              error instanceof Error ? error.message : "未知错误"
            }。报告中不要编造实时价格。`,
          ].join("\n\n");
        }
      }

      const result = await generateStructuredReport({
        mode: intent.mode,
        topic: intent.topic,
        context,
      });

      return NextResponse.json({
        answer: result.report,
        model: result.model,
        title: result.title,
        sectionCount: result.sectionCount,
        intent: intent.mode,
        toolUsed: "report",
      });
    }

    const conversation: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...userMessages.slice(-12),
    ];

    const result = await completeWithContinuation({
      ...config,
      messages: conversation,
    });

    return NextResponse.json({
      answer: result.answer,
      model: config.model,
      wasContinued: result.wasContinued,
      finishReason: result.finishReason,
      intent: "chat",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "连接智能体失败，请稍后重试。",
      },
      { status: 502 },
    );
  }
}
