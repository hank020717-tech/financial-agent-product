"use client";

import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  FileText,
  Loader2,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const starterPrompts = [
  "帮我搭一个分析英伟达的研究框架",
  "如何理解美联储降息对科技股的影响？",
  "生成一份新能源行业研究报告大纲",
  "审查商业计划书时应该重点看哪些风险？",
];

const initialMessage: ChatMessage = {
  role: "assistant",
  content:
    "你好，我是阿U智能体。你可以问我市场、公司、行业、商业计划书、路演稿和金融文件分析相关的问题。",
};

export default function AgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canSend = input.trim().length > 0 && !isSending;

  const visibleMessages = useMemo(
    () => messages.filter((message) => message.content.trim().length > 0),
    [messages],
  );

  async function sendMessage(content: string) {
    const trimmedContent = content.trim();
    if (!trimmedContent || isSending) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmedContent },
    ];

    setMessages(nextMessages);
    setInput("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = (await response.json()) as {
        answer?: string;
        error?: string;
      };

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content:
            data.answer ||
            data.error ||
            "阿U智能体暂时没有返回内容，请稍后再试。",
        },
      ]);
    } catch {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: "连接智能体失败，请检查网络或稍后重试。",
        },
      ]);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend) {
      void sendMessage(input);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-zinc-950">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            市场行情
          </Link>

          <div className="flex flex-1 items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-white">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-zinc-950">
                阿U智能体
              </h1>
              <p className="text-xs text-zinc-500">DeepSeek 金融研究助手</p>
            </div>
          </div>

          <button className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50">
            <UserRound className="h-4 w-4" aria-hidden="true" />
            登录/注册
          </button>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-[1440px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="h-fit rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-zinc-950">研究场景</h2>
          </div>

          <div className="mt-4 grid gap-2">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => void sendMessage(prompt)}
                disabled={isSending}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-left text-sm leading-6 text-zinc-700 transition hover:border-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
              <FileText className="h-4 w-4 text-zinc-500" aria-hidden="true" />
              文件分析
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              PPT、BP、合同和研报上传会在下一阶段接入。
            </p>
          </div>
        </aside>

        <section className="flex min-h-[calc(100vh-96px)] min-w-0 flex-col rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="text-sm font-semibold text-zinc-950">对话</p>
            <p className="mt-1 text-xs text-zinc-500">
              内容仅供研究参考，不构成投资建议。
            </p>
          </div>

          <div className="flex-1 space-y-4 overflow-auto p-4">
            {visibleMessages.map((message, index) => {
              const isUser = message.role === "user";

              return (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[860px] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm leading-7 ${
                      isUser
                        ? "bg-emerald-600 text-white"
                        : "border border-zinc-200 bg-zinc-50 text-zinc-800"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              );
            })}

            {isSending ? (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  阿U智能体正在思考
                </div>
              </div>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-zinc-200 p-4">
            <div className="flex gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (canSend) {
                      void sendMessage(input);
                    }
                  }
                }}
                rows={2}
                placeholder="输入你的金融研究问题"
                className="min-h-[52px] flex-1 resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                aria-label="发送"
              >
                <Send className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
