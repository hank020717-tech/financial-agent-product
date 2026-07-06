"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  FileText,
  History,
  Loader2,
  MessageSquareText,
  UserRound,
} from "lucide-react";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

type ChatSession = {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
};

type ChatMessage = {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type SavedReport = {
  id: string;
  title: string;
  report_type: string;
  content: string;
  source: string;
  created_at: string;
};

type ViewMode = "sessions" | "reports";

function formatDate(value: string) {
  if (!value) return "";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function preview(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 80);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }

  return "读取历史记录失败，请稍后再试。";
}

export default function HistoryPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("sessions");
  const [userEmail, setUserEmail] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const selectedSession = sessions.find(
    (session) => session.id === selectedSessionId,
  );
  const selectedReport = reports.find((report) => report.id === selectedReportId);
  const selectedSessionMessages = useMemo(
    () =>
      messages
        .filter((message) => message.session_id === selectedSessionId)
        .sort(
          (first, second) =>
            new Date(first.created_at).getTime() -
            new Date(second.created_at).getTime(),
        ),
    [messages, selectedSessionId],
  );

  useEffect(() => {
    async function loadHistory() {
      if (!isSupabaseConfigured()) {
        setError("Supabase 还没有配置，暂时无法读取历史记录。");
        setIsLoading(false);
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError) throw userError;

        const user = userData.user;

        if (!user) {
          setError("请先登录，再查看历史记录。");
          setIsLoading(false);
          return;
        }

        setUserEmail(user.email ?? "");

        const [sessionsResult, messagesResult, reportsResult] =
          await Promise.all([
            supabase
              .from("chat_sessions")
              .select("id,title,created_at,updated_at")
              .order("updated_at", { ascending: false })
              .limit(50),
            supabase
              .from("chat_messages")
              .select("id,session_id,role,content,created_at")
              .order("created_at", { ascending: true })
              .limit(300),
            supabase
              .from("reports")
              .select("id,title,report_type,content,source,created_at")
              .order("created_at", { ascending: false })
              .limit(50),
          ]);

        if (sessionsResult.error) throw sessionsResult.error;
        if (messagesResult.error) throw messagesResult.error;
        if (reportsResult.error) throw reportsResult.error;

        const nextSessions = (sessionsResult.data ?? []) as ChatSession[];
        const nextMessages = (messagesResult.data ?? []) as ChatMessage[];
        const nextReports = (reportsResult.data ?? []) as SavedReport[];

        setSessions(nextSessions);
        setMessages(nextMessages);
        setReports(nextReports);
        setSelectedSessionId(nextSessions[0]?.id ?? "");
        setSelectedReportId(nextReports[0]?.id ?? "");
      } catch (historyError) {
        setError(getErrorMessage(historyError));
      } finally {
        setIsLoading(false);
      }
    }

    void loadHistory();
  }, []);

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-zinc-950">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-4 px-4 sm:px-6">
          <Link
            href="/agent"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            返回阿U
          </Link>

          <div className="flex flex-1 items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-white">
              <History className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-zinc-950">
                历史记录
              </h1>
              <p className="text-xs text-zinc-500">
                {userEmail ? `当前账户：${userEmail}` : "查看已保存的对话和报告"}
              </p>
            </div>
          </div>

          <Link
            href="/login"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            <UserRound className="h-4 w-4" aria-hidden="true" />
            用户中心
          </Link>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-[1440px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="h-fit rounded-lg border border-zinc-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-zinc-100 p-1">
            <button
              type="button"
              onClick={() => setViewMode("sessions")}
              className={`h-10 rounded-md text-sm font-semibold transition ${
                viewMode === "sessions"
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              历史对话
            </button>
            <button
              type="button"
              onClick={() => setViewMode("reports")}
              className={`h-10 rounded-md text-sm font-semibold transition ${
                viewMode === "reports"
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              我的报告
            </button>
          </div>

          {isLoading ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              正在读取历史记录
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-800">
              {error}
            </div>
          ) : null}

          {!isLoading && !error && viewMode === "sessions" ? (
            <div className="mt-4 grid gap-2">
              {sessions.length === 0 ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-4 text-sm leading-6 text-zinc-500">
                  还没有保存的对话。回到阿U问一个问题后，这里会出现记录。
                </div>
              ) : null}

              {sessions.map((session) => {
                const isSelected = session.id === selectedSessionId;
                const firstMessage = messages.find(
                  (message) => message.session_id === session.id,
                );

                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`rounded-lg border px-3 py-3 text-left transition ${
                      isSelected
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-zinc-200 bg-zinc-50 hover:border-emerald-200 hover:bg-emerald-50"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-zinc-900">
                        {session.title}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {formatDate(session.updated_at)}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-zinc-500">
                      {firstMessage ? preview(firstMessage.content) : "暂无消息"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {!isLoading && !error && viewMode === "reports" ? (
            <div className="mt-4 grid gap-2">
              {reports.length === 0 ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-4 text-sm leading-6 text-zinc-500">
                  还没有保存的报告。生成个股分析、行业研报或文件分析后，这里会出现记录。
                </div>
              ) : null}

              {reports.map((report) => {
                const isSelected = report.id === selectedReportId;

                return (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => setSelectedReportId(report.id)}
                    className={`rounded-lg border px-3 py-3 text-left transition ${
                      isSelected
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-zinc-200 bg-zinc-50 hover:border-emerald-200 hover:bg-emerald-50"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-zinc-900">
                        {report.title}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {formatDate(report.created_at)}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-zinc-500">
                      {report.report_type} · {preview(report.content)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </aside>

        <section className="min-h-[calc(100vh-96px)] rounded-lg border border-zinc-200 bg-white">
          {viewMode === "sessions" ? (
            <div>
              <div className="border-b border-zinc-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <MessageSquareText
                    className="h-4 w-4 text-emerald-600"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-zinc-950">
                    {selectedSession?.title || "历史对话"}
                  </p>
                </div>
                {selectedSession ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatDate(selectedSession.updated_at)}
                  </p>
                ) : null}
              </div>

              <div className="space-y-4 p-4">
                {selectedSessionMessages.length === 0 ? (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                    选择左侧对话后，这里会显示完整内容。
                  </div>
                ) : null}

                {selectedSessionMessages.map((message) => {
                  const isUser = message.role === "user";

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[920px] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm leading-7 ${
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
              </div>
            </div>
          ) : (
            <div>
              <div className="border-b border-zinc-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileText
                    className="h-4 w-4 text-emerald-600"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-zinc-950">
                    {selectedReport?.title || "我的报告"}
                  </p>
                </div>
                {selectedReport ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    {selectedReport.report_type} ·{" "}
                    {formatDate(selectedReport.created_at)}
                  </p>
                ) : null}
              </div>

              <div className="p-4">
                {selectedReport ? (
                  <div className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-7 text-zinc-800">
                    {selectedReport.content}
                  </div>
                ) : (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                    选择左侧报告后，这里会显示完整内容。
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
