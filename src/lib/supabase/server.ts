import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function createSupabaseUserClient(accessToken: string) {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Supabase 还没有配置。请在 .env.local 中设置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY。",
    );
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function getAuthenticatedSupabaseUser(accessToken?: string): Promise<{
  supabase: SupabaseClient;
  user: User;
}> {
  const token = accessToken?.trim();

  if (!token) {
    throw new Error("请先登录后再使用阿U智能体。");
  }

  const supabase = createSupabaseUserClient(token);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error("登录状态已过期，请重新登录后再试。");
  }

  return {
    supabase,
    user: data.user,
  };
}
