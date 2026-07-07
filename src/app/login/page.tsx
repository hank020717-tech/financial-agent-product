"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  History,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  MessageSquareText,
  UserPlus,
} from "lucide-react";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

type AuthMode = "signin" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [lastSignInAt, setLastSignInAt] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) return;

    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? "");
      setLastSignInAt(data.user?.last_sign_in_at ?? "");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? "");
      setLastSignInAt(session?.user.last_sign_in_at ?? "");
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [configured]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!configured) {
      setError(
        "Supabase 还没有配置。请先在 .env.local 中填写项目 URL 和 Publishable Key。",
      );
      return;
    }

    if (password.length < 6) {
      setError("密码至少需要 6 位。");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === "signin") {
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (signInError) throw signInError;

        setUserEmail(data.user?.email ?? email);
        setLastSignInAt(data.user?.last_sign_in_at ?? "");
        setMessage("登录成功。现在可以开始把对话和报告保存到你的账户下。");
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });

        if (signUpError) throw signUpError;

        setUserEmail(data.user?.email ?? email);
        setMessage(
          data.user?.identities?.length === 0
            ? "这个邮箱可能已经注册过，请直接登录。"
            : "注册请求已提交。如 Supabase 开启了邮箱确认，请先去邮箱完成确认。",
        );
      }
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "认证失败，请稍后再试。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function signOut() {
    if (!configured) return;

    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) throw signOutError;

      setUserEmail("");
      setLastSignInAt("");
      setMessage("已退出登录。");
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "退出登录失败，请稍后再试。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function sendPasswordResetEmail() {
    setError("");
    setMessage("");

    if (!configured) {
      setError("Supabase 还没有配置，暂时无法发送重置邮件。");
      return;
    }

    const targetEmail = (email || userEmail).trim();

    if (!targetEmail) {
      setError("请先填写邮箱，再发送重置密码邮件。");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        targetEmail,
        {
          redirectTo: `${window.location.origin}/login`,
        },
      );

      if (resetError) throw resetError;

      setMessage("重置密码邮件已发送，请到邮箱查看。");
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "重置密码邮件发送失败，请稍后再试。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-[960px] items-center justify-between px-4 sm:px-6">
          <Link
            href="/agent"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            返回阿U
          </Link>
          <p className="text-sm font-semibold text-zinc-900">用户中心</p>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-[960px] gap-4 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div>
            <p className="text-sm font-semibold text-zinc-950">登录/注册</p>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              第一版使用 Supabase Auth。登录后，对话、报告、文件分析和阿U记忆会保存到你的账户。
            </p>
          </div>

          {!configured ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              还没有填写 Supabase 配置。请在项目根目录的 .env.local 中添加：
              <br />
              NEXT_PUBLIC_SUPABASE_URL
              <br />
              NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
            </div>
          ) : null}

          {userEmail ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              当前已登录：{userEmail}
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-zinc-100 p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`h-10 rounded-md text-sm font-semibold transition ${
                mode === "signin"
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`h-10 rounded-md text-sm font-semibold transition ${
                mode === "signup"
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-zinc-600">邮箱</span>
              <div className="relative mt-1">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-10 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  required
                />
              </div>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-zinc-600">密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 6 位"
                className="mt-1 h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                required
              />
            </label>

            {error ? (
              <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
                <AlertCircle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-700">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                {message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isLoading || !configured}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : mode === "signin" ? (
                <LogIn className="h-4 w-4" aria-hidden="true" />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              )}
              {mode === "signin" ? "登录" : "注册"}
            </button>

            {userEmail ? (
              <button
                type="button"
                onClick={() => void signOut()}
                disabled={isLoading}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                退出登录
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => void sendPasswordResetEmail()}
              disabled={isLoading || !configured}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              发送重置密码邮件
            </button>
          </form>
        </div>

        <aside className="h-fit rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-sm font-semibold text-zinc-950">账户状态</p>
          <div className="mt-3 space-y-3 text-sm leading-6 text-zinc-600">
            <p>
              {userEmail
                ? `当前账户：${userEmail}`
                : "登录后会启用历史记录、报告保存、文件分析保存和阿U记忆。"}
            </p>
            {lastSignInAt ? (
              <p>
                最近登录：
                {new Intl.DateTimeFormat("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(lastSignInAt))}
              </p>
            ) : null}
            <p>金融内容仅供研究参考，不构成投资建议。</p>
          </div>
          <Link
            href="/agent"
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            返回阿U
          </Link>
          {userEmail ? (
            <Link
              href="/history"
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
            >
              <History className="h-4 w-4" aria-hidden="true" />
              查看历史记录
            </Link>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
