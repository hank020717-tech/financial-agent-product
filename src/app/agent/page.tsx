"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Bot,
  Building2,
  Check,
  Copy,
  Download,
  FileText,
  FileUp,
  History,
  Loader2,
  Presentation,
  Send,
  ShieldAlert,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { uploadUserFile, saveFileAnalysisRecord } from "@/lib/supabase/files";
import { saveConversationTurn } from "@/lib/supabase/history";
import { createKnowledgeDocumentFromText } from "@/lib/supabase/knowledge";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ReportMode = "stock" | "industry" | "bp" | "roadshow";
type FileAnalysisMode = "bp" | "roadshow" | "contract" | "research";
type AgentIntent = ReportMode | "quote" | "chat" | "knowledge";

type ReportModeConfig = {
  id: ReportMode;
  title: string;
  cost: number;
  icon: typeof BarChart3;
  topicLabel: string;
  topicPlaceholder: string;
  contextPlaceholder: string;
};

const reportModes: ReportModeConfig[] = [
  {
    id: "stock",
    title: "个股分析",
    cost: 10,
    icon: BarChart3,
    topicLabel: "标的",
    topicPlaceholder: "例如：NVDA、贵州茅台、特斯拉",
    contextPlaceholder: "可填写关注点、持仓背景、财报摘要、估值疑问等",
  },
  {
    id: "industry",
    title: "行业研报",
    cost: 20,
    icon: Building2,
    topicLabel: "行业",
    topicPlaceholder: "例如：AI 算力、新能源车、创新药",
    contextPlaceholder: "可填写研究范围、重点公司、地域市场、时间周期等",
  },
  {
    id: "bp",
    title: "BP 风险分析",
    cost: 30,
    icon: ShieldAlert,
    topicLabel: "项目/公司",
    topicPlaceholder: "例如：某 AI 金融助手项目",
    contextPlaceholder: "可粘贴 BP 摘要、商业模式、收入模型、团队背景等",
  },
  {
    id: "roadshow",
    title: "路演稿生成",
    cost: 30,
    icon: Presentation,
    topicLabel: "项目/公司",
    topicPlaceholder: "例如：某智能投研平台",
    contextPlaceholder: "可粘贴路演材料要点、融资用途、产品亮点、目标听众等",
  },
];

const fileAnalysisModes: Array<{
  id: FileAnalysisMode;
  title: string;
  cost: number;
}> = [
  { id: "bp", title: "BP 风险分析", cost: 40 },
  { id: "roadshow", title: "路演稿生成", cost: 40 },
  { id: "contract", title: "合同审查", cost: 40 },
  { id: "research", title: "研报解读", cost: 40 },
];

const chatCreditCosts = [
  { title: "普通对话", cost: 2 },
  { title: "实时行情", cost: 2 },
  { title: "资料记忆问答", cost: 3 },
];

const starterPrompts = [
  "黄金现在多少钱？",
  "帮我生成一份 NVDA 个股分析报告",
  "根据我上传过的资料，总结项目核心风险",
  "生成一份新能源行业研究报告大纲",
  "帮我写一个 AI 金融助手项目的路演稿",
];

const initialMessage: ChatMessage = {
  role: "assistant",
  content:
    "你好，我是阿U智能体。你可以直接聊天，也可以直接说“生成 NVDA 个股分析报告”“黄金现在多少钱”“写一版路演稿”。上传文件并完成分析后，我也能基于保存过的资料继续帮你追问和整理。",
};

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("请求等待时间过长，已自动结束。请稍后重试。");
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function createClientRequestId() {
  return crypto.randomUUID();
}

export default function AgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [copiedMessageKey, setCopiedMessageKey] = useState("");
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ReportMode>("stock");
  const [selectedFileMode, setSelectedFileMode] =
    useState<FileAnalysisMode>("bp");
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [fileNote, setFileNote] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastCreditTokenRef = useRef("");
  const activeRequestRef = useRef("");

  const activeMode =
    reportModes.find((mode) => mode.id === selectedMode) ?? reportModes[0];
  const isBusy = isSending || isGeneratingReport || isAnalyzingFile;
  const canSend = input.trim().length > 0 && !isBusy;
  const canGenerateReport =
    topic.trim().length > 0 && !isBusy;
  const canAnalyzeFile = selectedFile !== null && !isBusy;

  const visibleMessages = useMemo(
    () => messages.filter((message) => message.content.trim().length > 0),
    [messages],
  );

  const refreshCredits = useCallback(async (token?: string) => {
    if (!isSupabaseConfigured()) return;

    try {
      const supabase = createSupabaseBrowserClient();
      const accessToken =
        token || (await supabase.auth.getSession()).data.session?.access_token;

      if (!accessToken) {
        setCreditBalance(null);
        lastCreditTokenRef.current = "";
        return;
      }

      if (lastCreditTokenRef.current === accessToken) return;

      lastCreditTokenRef.current = accessToken;

      const response = await fetchWithTimeout("/api/credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": createClientRequestId(),
        },
        body: JSON.stringify({ accessToken }),
      }, 8_000);

      const data = (await response.json()) as {
        balance?: number;
      };

      if (typeof data.balance === "number") {
        setCreditBalance(data.balance);
      }
    } catch {
      setCreditBalance(null);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending, isGeneratingReport, isAnalyzingFile]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? "");
      setUserEmail(data.user?.email ?? "");
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) {
        void refreshCredits(data.session.access_token);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? "");
      setUserEmail(session?.user.email ?? "");
      setCreditBalance(null);
      lastCreditTokenRef.current = "";
      setConversationId(null);
      setHistoryStatus("");
      if (session?.access_token) {
        void refreshCredits(session.access_token);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [refreshCredits]);

  function syncCreditsFromResponse(credits?: { balance?: number }) {
    if (typeof credits?.balance === "number") {
      setCreditBalance(credits.balance);
    }
  }

  function buildExportFileName(content: string, extension: "md" | "txt") {
    const firstTitle =
      content
        .split("\n")
        .find((line) => line.trim().replace(/^#+\s*/, "").length > 0)
        ?.trim()
        .replace(/^#+\s*/, "") || "阿U智能体报告";
    const safeTitle = firstTitle
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 36);
    const date = new Date().toISOString().slice(0, 10);

    return `${safeTitle || "阿U智能体报告"}-${date}.${extension}`;
  }

  async function copyMessage(content: string, messageKey: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageKey(messageKey);
      window.setTimeout(() => setCopiedMessageKey(""), 1600);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedMessageKey(messageKey);
      window.setTimeout(() => setCopiedMessageKey(""), 1600);
    }
  }

  function downloadMessage(content: string, extension: "md" | "txt") {
    const mimeType = extension === "md" ? "text/markdown" : "text/plain";
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = buildExportFileName(content, extension);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function isReportIntent(intent?: string): intent is ReportMode {
    return intent === "stock" || intent === "industry" || intent === "bp" || intent === "roadshow";
  }

  function getSaveErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;

    if (error && typeof error === "object" && "message" in error) {
      return String((error as { message?: unknown }).message);
    }

    return "请确认 Supabase 数据表已创建并授权";
  }

  async function saveTurn({
    userContent,
    assistantContent,
    intent,
    reportTitle,
    reportType,
    source,
  }: {
    userContent: string;
    assistantContent: string;
    intent?: AgentIntent | string;
    reportTitle?: string;
    reportType?: string;
    source: string;
  }): Promise<string | null> {
    if (!userId || !isSupabaseConfigured()) return null;

    setHistoryStatus("正在保存到你的账户");

    try {
      const supabase = createSupabaseBrowserClient();
      const savedSessionId = await saveConversationTurn({
        supabase,
        userId,
        sessionId: conversationId,
        titleSeed: userContent,
        userContent,
        assistantContent,
        metadata: {
          intent,
          source,
        },
        report:
          reportTitle && reportType
            ? {
                title: reportTitle,
                type: reportType,
                content: assistantContent,
                source,
              }
            : undefined,
      });

      setConversationId(savedSessionId);
      setHistoryStatus("已保存");
      return savedSessionId;
    } catch (saveError) {
      setHistoryStatus(`保存失败：${getSaveErrorMessage(saveError)}`);
      return null;
    }
  }

  async function sendMessage(content: string) {
    const trimmedContent = content.trim();
    if (!trimmedContent || isBusy) return;
    const requestId = createClientRequestId();

    if (activeRequestRef.current) return;
    activeRequestRef.current = requestId;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmedContent },
    ];

    setMessages(nextMessages);
    setInput("");
    setIsSending(true);

    try {
      let accessToken: string | undefined;

      if (isSupabaseConfigured()) {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        accessToken = data.session?.access_token;
      }

      const response = await fetchWithTimeout("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
        },
        body: JSON.stringify({ messages: nextMessages, accessToken }),
      }, 180_000);

      const data = (await response.json()) as {
        answer?: string;
        error?: string;
        intent?: AgentIntent;
        knowledgeMatches?: unknown[];
        title?: string;
        toolUsed?: string;
        credits?: {
          balance?: number;
        };
      };

      syncCreditsFromResponse(data.credits);

      const assistantContent =
        data.answer ||
        data.error ||
        "阿U智能体暂时没有返回内容，请稍后再试。";

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: assistantContent,
        },
      ]);

      const savePromise = saveTurn({
        userContent: trimmedContent,
        assistantContent,
        intent: data.intent,
        reportTitle: data.title,
        reportType: isReportIntent(data.intent) ? data.intent : undefined,
        source: data.toolUsed || "chat",
      });

      if (data.intent === "knowledge") {
        void savePromise.then(() => {
          setHistoryStatus(
            data.knowledgeMatches && data.knowledgeMatches.length > 0
              ? "已参考阿U记忆"
              : "未找到可参考记忆",
          );
        });
      }
    } catch (error) {
      const assistantContent =
        error instanceof Error
          ? error.message
          : "连接智能体失败，请检查网络或稍后重试。";

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: assistantContent,
        },
      ]);

      void saveTurn({
        userContent: trimmedContent,
        assistantContent,
        intent: "chat",
        source: "chat-error",
      });
    } finally {
      if (activeRequestRef.current === requestId) {
        activeRequestRef.current = "";
      }
      setIsSending(false);
      inputRef.current?.focus();
    }
  }

  async function generateReport() {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic || isBusy) return;
    const requestId = createClientRequestId();

    if (activeRequestRef.current) return;
    activeRequestRef.current = requestId;

    const userRequest = `${activeMode.title}：${trimmedTopic}`;
    setMessages((currentMessages) => [
      ...currentMessages,
      { role: "user", content: userRequest },
    ]);
    setIsGeneratingReport(true);

    try {
      let accessToken: string | undefined;

      if (isSupabaseConfigured()) {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        accessToken = data.session?.access_token;
      }

      const response = await fetchWithTimeout("/api/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
        },
        body: JSON.stringify({
          mode: selectedMode,
          topic: trimmedTopic,
          context,
          accessToken,
        }),
      }, 290_000);

      const data = (await response.json()) as {
        report?: string;
        error?: string;
        title?: string;
        credits?: {
          balance?: number;
        };
      };

      syncCreditsFromResponse(data.credits);

      const assistantContent =
        data.report ||
        data.error ||
        `${activeMode.title}生成失败，请稍后重试。`;

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: assistantContent,
        },
      ]);

      void saveTurn({
        userContent: userRequest,
        assistantContent,
        intent: selectedMode,
        reportTitle: data.title || `${activeMode.title}：${trimmedTopic}`,
        reportType: selectedMode,
        source: "fixed-report",
      });
    } catch (error) {
      const assistantContent =
        error instanceof Error
          ? `${activeMode.title}生成失败：${error.message}`
          : `${activeMode.title}生成失败，请检查网络或稍后重试。`;

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: assistantContent,
        },
      ]);

      void saveTurn({
        userContent: userRequest,
        assistantContent,
        intent: selectedMode,
        source: "fixed-report-error",
      });
    } finally {
      if (activeRequestRef.current === requestId) {
        activeRequestRef.current = "";
      }
      setIsGeneratingReport(false);
    }
  }

  async function analyzeFile() {
    if (!selectedFile || isBusy) return;
    const requestId = createClientRequestId();

    if (activeRequestRef.current) return;
    activeRequestRef.current = requestId;

    const modeTitle =
      fileAnalysisModes.find((mode) => mode.id === selectedFileMode)?.title ||
      "文件分析";

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        role: "user",
        content: `${modeTitle}：${selectedFile.name}`,
      },
    ]);
    setIsAnalyzingFile(true);

    try {
      const supabase =
        userId && isSupabaseConfigured() ? createSupabaseBrowserClient() : null;
      let uploadedFile: Awaited<ReturnType<typeof uploadUserFile>> | null = null;
      let storageWarning = "";

      if (supabase && userId) {
        try {
          setHistoryStatus("正在保存原文件");
          uploadedFile = await uploadUserFile({
            supabase,
            userId,
            file: selectedFile,
          });
        } catch (uploadError) {
          storageWarning = `原文件暂未保存：${getSaveErrorMessage(uploadError)}`;
          setHistoryStatus(storageWarning);
        }
      }

      const formData = new FormData();
      formData.append("mode", selectedFileMode);
      formData.append("note", fileNote);
      formData.append("file", selectedFile);

      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) {
          formData.append("accessToken", data.session.access_token);
        }
      }

      const response = await fetchWithTimeout("/api/analyze-file", {
        method: "POST",
        headers: {
          "x-request-id": requestId,
        },
        body: formData,
      }, 290_000);

      const data = (await response.json()) as {
        analysis?: string;
        error?: string;
        extractedCharacters?: number;
        knowledgeText?: string;
        title?: string;
        credits?: {
          balance?: number;
        };
      };

      syncCreditsFromResponse(data.credits);

      if (!response.ok || data.error) {
        throw new Error(data.error || `${modeTitle}失败，请稍后重试。`);
      }

      const prefix =
        typeof data.extractedCharacters === "number"
          ? `已提取 ${data.extractedCharacters} 个字符。\n\n`
          : "";

      const assistantContent =
        (data.analysis ? `${prefix}${data.analysis}` : undefined) ||
        data.error ||
        `${modeTitle}失败，请稍后重试。`;

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: assistantContent,
        },
      ]);

      const savedSessionId = await saveTurn({
        userContent: `${modeTitle}：${selectedFile.name}`,
        assistantContent,
        intent: selectedFileMode,
        reportTitle: `${modeTitle}：${selectedFile.name}`,
        reportType: `file-${selectedFileMode}`,
        source: "file-analysis",
      });

      if (supabase && userId && data.analysis) {
        try {
          setHistoryStatus("正在加入阿U记忆");

          let analysisId: string | undefined;

          if (uploadedFile) {
            analysisId = await saveFileAnalysisRecord({
              supabase,
              userId,
              fileId: uploadedFile.id,
              sessionId: savedSessionId,
              mode: selectedFileMode,
              title: data.title || `${modeTitle}：${selectedFile.name}`,
              note: fileNote,
              analysis: assistantContent,
              extractedCharacters: data.extractedCharacters || 0,
            });
          }

          await createKnowledgeDocumentFromText({
            supabase,
            userId,
            title: data.title || `${modeTitle}：${selectedFile.name}`,
            sourceType: uploadedFile ? "file_analysis" : "file_analysis_result",
            sourceId: analysisId,
            content: [
              `文件名：${selectedFile.name}`,
              `分析类型：${modeTitle}`,
              fileNote ? `用户备注：${fileNote}` : "",
              data.knowledgeText ? `文件提取文本：\n${data.knowledgeText}` : "",
              `分析结果：\n${assistantContent}`,
            ]
              .filter(Boolean)
              .join("\n\n"),
            metadata: {
              fileId: uploadedFile?.id ?? null,
              mode: selectedFileMode,
            },
          });

          setHistoryStatus(
            uploadedFile
              ? "文件、分析和阿U记忆已保存"
              : "已加入阿U记忆，原文件暂未保存",
          );
        } catch (saveFileError) {
          setHistoryStatus(`分析已完成，阿U记忆保存失败：${getSaveErrorMessage(saveFileError)}`);
        }
      } else if (storageWarning) {
        setHistoryStatus(`分析已完成，${storageWarning}`);
      }
    } catch (analysisError) {
      const assistantContent = `${modeTitle}失败：${getSaveErrorMessage(analysisError)}`;

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: assistantContent,
        },
      ]);

      void saveTurn({
        userContent: `${modeTitle}：${selectedFile.name}`,
        assistantContent,
        intent: selectedFileMode,
        source: "file-analysis-error",
      });
    } finally {
      if (activeRequestRef.current === requestId) {
        activeRequestRef.current = "";
      }
      setIsAnalyzingFile(false);
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
            <p className="text-xs text-zinc-500">金融研究助手</p>
            </div>
          </div>

          <Link
            href="/login"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            <UserRound className="h-4 w-4" aria-hidden="true" />
            {userEmail ? "用户中心" : "登录/注册"}
          </Link>

          {userEmail ? (
            <Link
              href="/history"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
            >
              <History className="h-4 w-4" aria-hidden="true" />
              历史记录
            </Link>
          ) : null}
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-[1440px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="h-fit rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-zinc-950">固定能力</h2>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {reportModes.map((mode) => {
              const Icon = mode.icon;
              const isSelected = mode.id === selectedMode;

              return (
                <button
                  key={mode.id}
                  onClick={() => setSelectedMode(mode.id)}
                  disabled={isBusy}
                  className={`flex h-[76px] flex-col justify-between rounded-lg border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    isSelected
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-emerald-200 hover:bg-emerald-50"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="flex items-end justify-between gap-2">
                    <span className="text-sm font-semibold">{mode.title}</span>
                    <span className="shrink-0 text-xs font-medium text-emerald-700">
                      {mode.cost} 点
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-emerald-900">点数规则</p>
              <p className="text-xs text-emerald-700">按次消耗</p>
            </div>
            <div className="mt-2 grid gap-1.5 text-xs text-emerald-900">
              {chatCreditCosts.map((item) => (
                <div key={item.title} className="flex items-center justify-between gap-3">
                  <span>{item.title}</span>
                  <span className="font-medium">{item.cost} 点</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3">
                <span>文件分析</span>
                <span className="font-medium">40 点</span>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-emerald-700">
              生成报告和文件分析的具体价格已标在对应按钮上。
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-zinc-600">
                {activeMode.topicLabel}
              </span>
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder={activeMode.topicPlaceholder}
                className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-zinc-600">
                补充信息
              </span>
              <textarea
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder={activeMode.contextPlaceholder}
                rows={6}
                className="mt-1 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm leading-6 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              />
            </label>

            <button
              onClick={() => void generateReport()}
              disabled={!canGenerateReport}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isGeneratingReport ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileText className="h-4 w-4" aria-hidden="true" />
              )}
              生成{activeMode.title}
            </button>
          </div>

          <div className="mt-5 border-t border-zinc-200 pt-4">
            <div className="flex items-center gap-2">
              <FileUp className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-zinc-950">文件分析</h2>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {fileAnalysisModes.map((mode) => {
                const isSelected = mode.id === selectedFileMode;

                return (
                  <button
                    key={mode.id}
                    onClick={() => setSelectedFileMode(mode.id)}
                    disabled={isBusy}
                    className={`h-10 rounded-lg border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      isSelected
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-emerald-200 hover:bg-emerald-50"
                    }`}
                  >
                    <span>{mode.title}</span>
                    <span className="ml-1 text-xs font-medium text-emerald-700">
                      {mode.cost} 点
                    </span>
                  </button>
                );
              })}
            </div>

            <label className="mt-3 flex min-h-[88px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-center transition hover:border-emerald-300 hover:bg-emerald-50">
              <FileUp className="h-5 w-5 text-zinc-500" aria-hidden="true" />
              <span className="mt-2 text-sm font-medium text-zinc-700">
                {selectedFile ? selectedFile.name : "选择文件"}
              </span>
              <span className="mt-1 text-xs text-zinc-500">
                PDF、DOCX、PPTX、TXT、MD
              </span>
              <input
                type="file"
                accept=".pdf,.docx,.pptx,.txt,.md,.csv,.json"
                className="sr-only"
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] ?? null);
                }}
              />
            </label>

            <textarea
              value={fileNote}
              onChange={(event) => setFileNote(event.target.value)}
              placeholder="可填写分析重点，例如风险、估值、演讲对象、合同关注条款等"
              rows={4}
              className="mt-3 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm leading-6 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
            />

            <button
              onClick={() => void analyzeFile()}
              disabled={!canAnalyzeFile}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isAnalyzingFile ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileUp className="h-4 w-4" aria-hidden="true" />
              )}
              分析上传文件
            </button>
          </div>

          <div className="mt-5 border-t border-zinc-200 pt-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-zinc-500" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-zinc-950">快速提问</h2>
            </div>
            <div className="mt-3 grid gap-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => void sendMessage(prompt)}
                  disabled={isBusy}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-left text-sm leading-6 text-zinc-700 transition hover:border-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-[calc(100vh-96px)] min-w-0 flex-col rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="text-sm font-semibold text-zinc-950">对话与报告</p>
            <p className="mt-1 text-xs text-zinc-500">
              内容仅供研究参考，不构成投资建议。
              {userEmail
                ? ` 已登录：${userEmail}${
                    typeof creditBalance === "number"
                      ? ` · 剩余 ${creditBalance} 点`
                      : ""
                  }${historyStatus ? ` · ${historyStatus}` : ""}`
                : " 登录后会自动保存对话和报告。"}
            </p>
          </div>

          <div className="flex-1 space-y-4 overflow-auto p-4">
            {visibleMessages.map((message, index) => {
              const isUser = message.role === "user";
              const messageKey = `${message.role}-${index}`;
              const isCopied = copiedMessageKey === messageKey;

              return (
                <div
                  key={messageKey}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`group max-w-[920px] rounded-lg px-4 py-3 text-sm leading-7 ${
                      isUser
                        ? "whitespace-pre-wrap bg-emerald-600 text-white"
                        : "border border-zinc-200 bg-zinc-50 text-zinc-800"
                    }`}
                  >
                    {!isUser ? (
                      <div className="mb-3 flex items-center justify-end gap-2 border-b border-zinc-200 pb-2">
                        <button
                          type="button"
                          onClick={() => void copyMessage(message.content, messageKey)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700"
                          title="复制全文"
                        >
                          {isCopied ? (
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {isCopied ? "已复制" : "复制"}
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadMessage(message.content, "md")}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700"
                          title="导出 Markdown"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          MD
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadMessage(message.content, "txt")}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700"
                          title="导出 TXT"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          TXT
                        </button>
                      </div>
                    ) : null}
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              );
            })}

            {isBusy ? (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {isAnalyzingFile
                    ? "文件正在分析，完成后会加入阿U记忆"
                    : isGeneratingReport
                      ? `${activeMode.title}正在生成`
                      : "阿U正在识别任务、行情或已保存资料"}
                </div>
              </div>
            ) : null}

            <div ref={messagesEndRef} />
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
