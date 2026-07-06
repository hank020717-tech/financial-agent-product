"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Copy,
  Download,
  FileText,
  History,
  Loader2,
  MessageSquareText,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { createSignedFileUrl } from "@/lib/supabase/files";

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

type SavedFileAnalysis = {
  id: string;
  title: string;
  mode: string;
  note: string | null;
  analysis: string;
  extracted_characters: number;
  created_at: string;
  user_files: {
    id: string;
    bucket_id: string;
    storage_path: string;
    file_name: string;
    content_type: string | null;
    size_bytes: number | null;
  } | null;
};

type FileAnalysisRow = Omit<SavedFileAnalysis, "user_files"> & {
  user_files:
    | SavedFileAnalysis["user_files"]
    | Array<NonNullable<SavedFileAnalysis["user_files"]>>;
};

type ViewMode = "sessions" | "reports" | "files";

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

function buildFileName(title: string, extension: "md" | "txt") {
  const safeTitle = (title || "阿U历史记录")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 36);
  const date = new Date().toISOString().slice(0, 10);

  return `${safeTitle || "阿U历史记录"}-${date}.${extension}`;
}

function buildSessionExportContent({
  title,
  messages,
}: {
  title: string;
  messages: ChatMessage[];
}) {
  const body = messages
    .map((message) => {
      const role = message.role === "user" ? "用户" : "阿U";
      return `## ${role}\n\n${message.content}`;
    })
    .join("\n\n");

  return `# ${title || "历史对话"}\n\n${body}`;
}

export default function HistoryPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("sessions");
  const [userEmail, setUserEmail] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [fileAnalyses, setFileAnalyses] = useState<SavedFileAnalysis[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [selectedFileAnalysisId, setSelectedFileAnalysisId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [error, setError] = useState("");

  const selectedSession = sessions.find(
    (session) => session.id === selectedSessionId,
  );
  const selectedReport = reports.find((report) => report.id === selectedReportId);
  const selectedFileAnalysis = fileAnalyses.find(
    (analysis) => analysis.id === selectedFileAnalysisId,
  );
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

        const [sessionsResult, messagesResult, reportsResult, fileAnalysesResult] =
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
            supabase
              .from("file_analyses")
              .select(
                "id,title,mode,note,analysis,extracted_characters,created_at,user_files(id,bucket_id,storage_path,file_name,content_type,size_bytes)",
              )
              .order("created_at", { ascending: false })
              .limit(50),
          ]);

        if (sessionsResult.error) throw sessionsResult.error;
        if (messagesResult.error) throw messagesResult.error;
        if (reportsResult.error) throw reportsResult.error;
        if (fileAnalysesResult.error) throw fileAnalysesResult.error;

        const nextSessions = (sessionsResult.data ?? []) as ChatSession[];
        const nextMessages = (messagesResult.data ?? []) as ChatMessage[];
        const nextReports = (reportsResult.data ?? []) as SavedReport[];
        const nextFileAnalyses = (
          (fileAnalysesResult.data ?? []) as FileAnalysisRow[]
        ).map((analysis) => ({
          ...analysis,
          user_files: Array.isArray(analysis.user_files)
            ? analysis.user_files[0] ?? null
            : analysis.user_files,
        }));

        setSessions(nextSessions);
        setMessages(nextMessages);
        setReports(nextReports);
        setFileAnalyses(nextFileAnalyses);
        setSelectedSessionId(nextSessions[0]?.id ?? "");
        setSelectedReportId(nextReports[0]?.id ?? "");
        setSelectedFileAnalysisId(nextFileAnalyses[0]?.id ?? "");
      } catch (historyError) {
        setError(getErrorMessage(historyError));
      } finally {
        setIsLoading(false);
      }
    }

    void loadHistory();
  }, []);

  async function copyText(content: string, key: string) {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(""), 1600);
  }

  function downloadText({
    content,
    title,
    extension,
  }: {
    content: string;
    title: string;
    extension: "md" | "txt";
  }) {
    const mimeType = extension === "md" ? "text/markdown" : "text/plain";
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = buildFileName(title, extension);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function deleteSession(sessionId: string) {
    const targetSession = sessions.find((session) => session.id === sessionId);
    if (!targetSession || isDeleting) return;

    const confirmed = window.confirm(
      `确定删除这条历史对话吗？\n\n${targetSession.title}`,
    );

    if (!confirmed) return;

    setIsDeleting(true);
    setActionMessage("");
    setError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: deleteError } = await supabase
        .from("chat_sessions")
        .delete()
        .eq("id", sessionId);

      if (deleteError) throw deleteError;

      const nextSessions = sessions.filter((session) => session.id !== sessionId);
      const nextMessages = messages.filter(
        (message) => message.session_id !== sessionId,
      );

      setSessions(nextSessions);
      setMessages(nextMessages);
      setSelectedSessionId((currentId) =>
        currentId === sessionId ? nextSessions[0]?.id ?? "" : currentId,
      );
      setActionMessage("历史对话已删除。");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }

  async function deleteReport(reportId: string) {
    const targetReport = reports.find((report) => report.id === reportId);
    if (!targetReport || isDeleting) return;

    const confirmed = window.confirm(
      `确定删除这份报告吗？\n\n${targetReport.title}`,
    );

    if (!confirmed) return;

    setIsDeleting(true);
    setActionMessage("");
    setError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: deleteError } = await supabase
        .from("reports")
        .delete()
        .eq("id", reportId);

      if (deleteError) throw deleteError;

      const nextReports = reports.filter((report) => report.id !== reportId);

      setReports(nextReports);
      setSelectedReportId((currentId) =>
        currentId === reportId ? nextReports[0]?.id ?? "" : currentId,
      );
      setActionMessage("报告已删除。");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }

  async function downloadOriginalFile(analysis: SavedFileAnalysis) {
    if (!analysis.user_files) return;

    try {
      const supabase = createSupabaseBrowserClient();
      const signedUrl = await createSignedFileUrl({
        supabase,
        bucketId: analysis.user_files.bucket_id,
        storagePath: analysis.user_files.storage_path,
      });

      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (downloadError) {
      setError(getErrorMessage(downloadError));
    }
  }

  async function deleteFileAnalysis(analysisId: string) {
    const targetAnalysis = fileAnalyses.find(
      (analysis) => analysis.id === analysisId,
    );
    if (!targetAnalysis || isDeleting) return;

    const confirmed = window.confirm(
      `确定删除这条文件分析和原始文件吗？\n\n${targetAnalysis.title}`,
    );

    if (!confirmed) return;

    setIsDeleting(true);
    setActionMessage("");
    setError("");

    try {
      const supabase = createSupabaseBrowserClient();

      if (targetAnalysis.user_files) {
        await supabase.storage
          .from(targetAnalysis.user_files.bucket_id)
          .remove([targetAnalysis.user_files.storage_path]);

        const { error: fileError } = await supabase
          .from("user_files")
          .delete()
          .eq("id", targetAnalysis.user_files.id);

        if (fileError) throw fileError;
      } else {
        const { error: analysisError } = await supabase
          .from("file_analyses")
          .delete()
          .eq("id", analysisId);

        if (analysisError) throw analysisError;
      }

      const nextAnalyses = fileAnalyses.filter(
        (analysis) => analysis.id !== analysisId,
      );

      setFileAnalyses(nextAnalyses);
      setSelectedFileAnalysisId((currentId) =>
        currentId === analysisId ? nextAnalyses[0]?.id ?? "" : currentId,
      );
      setActionMessage("文件分析已删除。");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }

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
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-zinc-100 p-1">
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
            <button
              type="button"
              onClick={() => setViewMode("files")}
              className={`h-10 rounded-md text-sm font-semibold transition ${
                viewMode === "files"
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              文件分析
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

          {actionMessage ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm leading-6 text-emerald-700">
              {actionMessage}
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
                  <div
                    key={session.id}
                    className={`rounded-lg border px-3 py-3 text-left transition ${
                      isSelected
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-zinc-200 bg-zinc-50 hover:border-emerald-200 hover:bg-emerald-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedSessionId(session.id)}
                      className="block w-full text-left"
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
                    <button
                      type="button"
                      onClick={() => void deleteSession(session.id)}
                      disabled={isDeleting}
                      className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      删除
                    </button>
                  </div>
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
                  <div
                    key={report.id}
                    className={`rounded-lg border px-3 py-3 text-left transition ${
                      isSelected
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-zinc-200 bg-zinc-50 hover:border-emerald-200 hover:bg-emerald-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedReportId(report.id)}
                      className="block w-full text-left"
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
                    <button
                      type="button"
                      onClick={() => void deleteReport(report.id)}
                      disabled={isDeleting}
                      className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      删除
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {!isLoading && !error && viewMode === "files" ? (
            <div className="mt-4 grid gap-2">
              {fileAnalyses.length === 0 ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-4 text-sm leading-6 text-zinc-500">
                  还没有保存的文件分析。登录后上传文件并分析，这里会显示记录和原文件。
                </div>
              ) : null}

              {fileAnalyses.map((analysis) => {
                const isSelected = analysis.id === selectedFileAnalysisId;

                return (
                  <div
                    key={analysis.id}
                    className={`rounded-lg border px-3 py-3 text-left transition ${
                      isSelected
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-zinc-200 bg-zinc-50 hover:border-emerald-200 hover:bg-emerald-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedFileAnalysisId(analysis.id)}
                      className="block w-full text-left"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold text-zinc-900">
                          {analysis.title}
                        </span>
                        <span className="shrink-0 text-xs text-zinc-500">
                          {formatDate(analysis.created_at)}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-zinc-500">
                        {analysis.user_files?.file_name || "原文件记录缺失"} ·{" "}
                        {analysis.extracted_characters} 字符
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteFileAnalysis(analysis.id)}
                      disabled={isDeleting}
                      className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      删除
                    </button>
                  </div>
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
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="mr-auto flex items-center gap-1 text-xs text-zinc-500">
                      <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatDate(selectedSession.updated_at)}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        void copyText(
                          buildSessionExportContent({
                            title: selectedSession.title,
                            messages: selectedSessionMessages,
                          }),
                          `session-${selectedSession.id}`,
                        )
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700"
                    >
                      {copiedKey === `session-${selectedSession.id}` ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {copiedKey === `session-${selectedSession.id}` ? "已复制" : "复制"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadText({
                          content: buildSessionExportContent({
                            title: selectedSession.title,
                            messages: selectedSessionMessages,
                          }),
                          title: selectedSession.title,
                          extension: "md",
                        })
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      MD
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadText({
                          content: buildSessionExportContent({
                            title: selectedSession.title,
                            messages: selectedSessionMessages,
                          }),
                          title: selectedSession.title,
                          extension: "txt",
                        })
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      TXT
                    </button>
                  </div>
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
          ) : viewMode === "reports" ? (
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
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="mr-auto text-xs text-zinc-500">
                      {selectedReport.report_type} ·{" "}
                      {formatDate(selectedReport.created_at)}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        void copyText(
                          selectedReport.content,
                          `report-${selectedReport.id}`,
                        )
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700"
                    >
                      {copiedKey === `report-${selectedReport.id}` ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {copiedKey === `report-${selectedReport.id}` ? "已复制" : "复制"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadText({
                          content: selectedReport.content,
                          title: selectedReport.title,
                          extension: "md",
                        })
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      MD
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadText({
                          content: selectedReport.content,
                          title: selectedReport.title,
                          extension: "txt",
                        })
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      TXT
                    </button>
                  </div>
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
          ) : (
            <div>
              <div className="border-b border-zinc-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileText
                    className="h-4 w-4 text-emerald-600"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-zinc-950">
                    {selectedFileAnalysis?.title || "文件分析"}
                  </p>
                </div>
                {selectedFileAnalysis ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="mr-auto text-xs text-zinc-500">
                      {selectedFileAnalysis.mode} ·{" "}
                      {selectedFileAnalysis.user_files?.file_name || "无原文件"} ·{" "}
                      {formatDate(selectedFileAnalysis.created_at)}
                    </p>
                    {selectedFileAnalysis.user_files ? (
                      <button
                        type="button"
                        onClick={() => void downloadOriginalFile(selectedFileAnalysis)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        原文件
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        void copyText(
                          selectedFileAnalysis.analysis,
                          `file-${selectedFileAnalysis.id}`,
                        )
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700"
                    >
                      {copiedKey === `file-${selectedFileAnalysis.id}` ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {copiedKey === `file-${selectedFileAnalysis.id}`
                        ? "已复制"
                        : "复制"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadText({
                          content: selectedFileAnalysis.analysis,
                          title: selectedFileAnalysis.title,
                          extension: "md",
                        })
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      MD
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadText({
                          content: selectedFileAnalysis.analysis,
                          title: selectedFileAnalysis.title,
                          extension: "txt",
                        })
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      TXT
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="p-4">
                {selectedFileAnalysis ? (
                  <div className="space-y-3">
                    {selectedFileAnalysis.note ? (
                      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 text-zinc-600">
                        分析备注：{selectedFileAnalysis.note}
                      </div>
                    ) : null}
                    <div className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-7 text-zinc-800">
                      {selectedFileAnalysis.analysis}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                    选择左侧文件分析后，这里会显示完整内容。
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
