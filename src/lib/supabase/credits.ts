import { type SupabaseClient } from "@supabase/supabase-js";
import { type TokenUsage } from "@/lib/deepseek";

export type CreditFeature =
  | "chat"
  | "quote"
  | "knowledge"
  | "report_stock"
  | "report_industry"
  | "report_bp"
  | "report_roadshow"
  | "file_bp"
  | "file_roadshow"
  | "file_contract"
  | "file_research";

type CreditAccount = {
  balance: number;
  lifetime_granted: number;
  lifetime_spent: number;
};

export type CreditChargeResult = {
  balance: number;
  charged: number;
};

export type CreditCheckResult =
  | {
      ok: true;
      balance: number;
      cost: number;
    }
  | {
      ok: false;
      balance: number;
      cost: number;
    };

const initialFreeCredits = 100;

const featureCreditCosts: Record<CreditFeature, number> = {
  chat: 2,
  quote: 2,
  knowledge: 3,
  report_stock: 10,
  report_industry: 20,
  report_bp: 30,
  report_roadshow: 30,
  file_bp: 40,
  file_roadshow: 40,
  file_contract: 40,
  file_research: 40,
};

const modelPricingUsdPerMillionTokens: Record<
  string,
  { input: number; output: number }
> = {
  "deepseek-v4-flash": { input: 0.14, output: 0.28 },
  "deepseek-v4-pro": { input: 0.435, output: 0.87 },
};

function normalizeModelName(model: string) {
  return model.trim().toLowerCase();
}

export function getFeatureCreditCost(feature: CreditFeature) {
  return featureCreditCosts[feature];
}

export function estimateModelCostUsd({
  model,
  usage,
}: {
  model: string;
  usage: TokenUsage;
}) {
  const pricing = modelPricingUsdPerMillionTokens[normalizeModelName(model)];

  if (!pricing) return 0;

  return Number(
    (
      (usage.promptTokens / 1_000_000) * pricing.input +
      (usage.completionTokens / 1_000_000) * pricing.output
    ).toFixed(8),
  );
}

export async function getOrCreateCreditAccount({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const { data: existing, error: selectError } = await supabase
    .from("user_credits")
    .select("balance,lifetime_granted,lifetime_spent")
    .eq("user_id", userId)
    .maybeSingle<CreditAccount>();

  if (selectError) {
    throw new Error(`读取账户点数失败：${selectError.message}`);
  }

  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from("user_credits")
    .insert({
      user_id: userId,
      balance: initialFreeCredits,
      lifetime_granted: initialFreeCredits,
      lifetime_spent: 0,
    })
    .select("balance,lifetime_granted,lifetime_spent")
    .single<CreditAccount>();

  if (insertError) {
    throw new Error(`初始化账户点数失败：${insertError.message}`);
  }

  return created;
}

export async function checkCredits({
  supabase,
  userId,
  feature,
}: {
  supabase: SupabaseClient;
  userId: string;
  feature: CreditFeature;
}): Promise<CreditCheckResult> {
  const cost = getFeatureCreditCost(feature);
  const account = await getOrCreateCreditAccount({ supabase, userId });

  if (account.balance < cost) {
    return {
      ok: false,
      balance: account.balance,
      cost,
    };
  }

  return {
    ok: true,
    balance: account.balance,
    cost,
  };
}

export function formatInsufficientCreditsMessage({
  balance,
  cost,
}: {
  balance: number;
  cost: number;
}) {
  return `余额不足。本次需要 ${cost} 点，你当前剩余 ${balance} 点。请充值后继续使用。`;
}

export async function spendCredits({
  supabase,
  feature,
  credits,
  model,
  usage,
  metadata = {},
}: {
  supabase: SupabaseClient;
  feature: CreditFeature;
  credits: number;
  model: string;
  usage: TokenUsage;
  metadata?: Record<string, unknown>;
}): Promise<CreditChargeResult> {
  const estimatedCostUsd = estimateModelCostUsd({ model, usage });

  const { data, error } = await supabase
    .rpc("spend_user_credits", {
      p_feature: feature,
      p_credits: credits,
      p_input_tokens: usage.promptTokens,
      p_output_tokens: usage.completionTokens,
      p_total_tokens: usage.totalTokens,
      p_estimated_cost_usd: estimatedCostUsd,
      p_metadata: {
        ...metadata,
        model,
      },
    })
    .single<{ balance: number; credits_charged: number }>();

  if (error) {
    throw new Error(`扣除点数失败：${error.message}`);
  }

  return {
    balance: data.balance,
    charged: data.credits_charged,
  };
}
