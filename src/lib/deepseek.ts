export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type DeepSeekChoice = {
  finish_reason?: string;
  message?: {
    content?: string;
  };
};

type CompletionResult = {
  answer: string;
  finishReason?: string;
  wasContinued: boolean;
};

const deepSeekApiUrl = "https://api.deepseek.com/chat/completions";
const defaultMaxOutputTokens = 4096;

export function getDeepSeekConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

  if (!apiKey) {
    throw new Error(
      "DeepSeek API Key 还没有配置。请在项目根目录创建 .env.local，并设置 DEEPSEEK_API_KEY。",
    );
  }

  return { apiKey, model };
}

export async function callDeepSeek({
  apiKey,
  model,
  messages,
  maxTokens = defaultMaxOutputTokens,
  temperature = 0.3,
}: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
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
      temperature,
      max_tokens: maxTokens,
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

export async function completeWithContinuation({
  apiKey,
  model,
  messages,
  maxContinuationRequests = 2,
  continuationPrompt = "你的上一条回答因为长度限制中断了。请从中断处继续，不要重复已经输出的内容，并自然补完剩余部分。",
}: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxContinuationRequests?: number;
  continuationPrompt?: string;
}): Promise<CompletionResult> {
  const firstResult = await callDeepSeek({ apiKey, model, messages });
  const answerParts = [firstResult.answer];
  let finishReason = firstResult.finishReason;

  for (
    let continuationCount = 0;
    finishReason === "length" && continuationCount < maxContinuationRequests;
    continuationCount += 1
  ) {
    const continuationMessages: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: answerParts.join("\n\n") },
      { role: "user", content: continuationPrompt },
    ];

    const continuationResult = await callDeepSeek({
      apiKey,
      model,
      messages: continuationMessages,
    });

    answerParts.push(continuationResult.answer);
    finishReason = continuationResult.finishReason;
  }

  return {
    answer: answerParts.join("\n\n"),
    finishReason,
    wasContinued: answerParts.length > 1,
  };
}
