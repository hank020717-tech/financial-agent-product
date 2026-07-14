import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSupabaseUser } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  let body: {
    accessToken?: string;
    userId?: string;
    credits?: number;
    note?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "请求内容不是有效的 JSON。" }, { status: 400 });
  }

  if (!body.accessToken || !body.userId || !Number.isInteger(body.credits)) {
    return NextResponse.json(
      { error: "请填写用户 UUID 和整数点数。" },
      { status: 400 },
    );
  }

  try {
    const { supabase } = await getAuthenticatedSupabaseUser(body.accessToken);
    const { data, error } = await supabase.rpc("admin_grant_user_credits", {
      p_user_id: body.userId,
      p_credits: body.credits,
      p_note: body.note?.trim() || "管理员充值",
    });

    if (error) {
      const status = error.message.includes("ADMIN_REQUIRED") ? 403 : 400;
      return NextResponse.json(
        {
          error:
            status === 403
              ? "当前账号没有管理员权限。"
              : "充值失败，请检查用户 UUID 和点数。",
        },
        { status },
      );
    }

    const result = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      balance: result?.balance ?? null,
      creditsGranted: result?.credits_granted ?? body.credits,
      transactionId: result?.transaction_id ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "管理员操作失败，请确认登录状态和 Supabase 数据库迁移。" },
      { status: 500 },
    );
  }
}
