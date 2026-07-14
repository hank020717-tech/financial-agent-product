"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

export default function AdminCreditsPage() {
  const [email, setEmail] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [userId, setUserId] = useState("");
  const [credits, setCredits] = useState("100");
  const [note, setNote] = useState("管理员充值");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) return;

    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? "");
      setEmail(data.session?.user.email ?? "");
    });
  }, [configured]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!accessToken) {
      setError("请先登录管理员账号。");
      return;
    }

    const amount = Number(credits);

    if (!userId.trim() || !Number.isInteger(amount) || amount <= 0) {
      setError("请输入正确的用户 UUID 和正整数点数。");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessToken,
          userId: userId.trim(),
          credits: amount,
          note: note.trim(),
        }),
      });
      const data = (await response.json()) as {
        balance?: number;
        creditsGranted?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "充值失败，请稍后重试。");
      }

      setMessage(
        `充值成功：已增加 ${data.creditsGranted ?? amount} 点，用户当前余额 ${data.balance ?? "--"} 点。`,
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "充值失败，请稍后重试。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-[880px] items-center justify-between px-4 sm:px-6">
          <Link
            href="/agent"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            返回阿U
          </Link>
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            点数管理
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[880px] px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <Coins className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-950">手动充值</h1>
              <p className="mt-1 text-sm leading-6 text-zinc-500">
                这是内部管理页面。充值成功后，用户会在用户中心看到余额和流水记录。
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-600">
            当前登录账号：{email || "未登录"}
            <br />
            需要先在 Supabase 的 admin_users 表中配置管理员权限。
          </div>

          {!configured ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Supabase 还没有配置，暂时无法使用点数管理。
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-zinc-600">用户 UUID</span>
              <input
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="从 Supabase Auth Users 复制用户 ID"
                className="mt-1 h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">增加点数</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={credits}
                  onChange={(event) => setCredits(event.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">备注</span>
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="例如：内测赠送"
                  className="mt-1 h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </label>
            </div>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
                {error}
              </p>
            ) : null}

            {message ? (
              <p className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-700">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting || !configured}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Coins className="h-4 w-4" aria-hidden="true" />
              )}
              确认充值
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
