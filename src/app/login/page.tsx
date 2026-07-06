"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  LogIn,
  Mail,
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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) return;

    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? "");
    });
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
              第一版使用 Supabase Auth。登录后，下一步会把对话和报告保存到你的账户。
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
                className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                退出登录
              </button>
            ) : null}
          </form>
        </div>

        <aside className="h-fit rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-sm font-semibold text-zinc-950">下一步保存内容</p>
          <div className="mt-3 space-y-3 text-sm leading-6 text-zinc-600">
            <p>登录打通后，我们会继续接 Supabase 数据表。</p>
            <p>第一批建议保存：对话记录、生成报告、上传文件分析结果。</p>
            <p>再往后接 Supabase Storage，用来保存用户上传的原始文件。</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
