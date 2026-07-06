import { hasRealtimeQuoteIntent, resolveQuoteTarget } from "@/lib/quotes";
import { ReportMode } from "@/lib/reports";

export type AgentIntent =
  | { type: "quote" }
  | { type: "report"; mode: ReportMode; topic: string; context: string }
  | { type: "chat" };

const reportIntentPattern = /(生成|写|做|出|整理|搭|建立|分析|研究|报告|研报|框架|大纲)/;
const stockIntentPattern =
  /(个股|股票|公司|标的|财报|估值|持仓|研究框架|分析框架|英伟达|特斯拉|苹果|茅台|NVDA|AAPL|TSLA)/i;
const industryIntentPattern = /(行业|赛道|产业链).*(研报|研究|分析|报告|框架|大纲)|((研报|研究|分析|报告|框架|大纲).*(行业|赛道|产业链))/;
const bpIntentPattern = /(BP|商业计划书|融资计划书|项目计划书|创业项目).*(风险|分析|审查|尽调|评估)|((风险|分析|审查|尽调|评估).*(BP|商业计划书|融资计划书|项目计划书|创业项目))/i;
const roadshowIntentPattern = /(路演|路演稿|演讲稿|融资演讲|投资人问答|pitch|deck)/i;

const stopWords = [
  "帮我",
  "请",
  "生成",
  "一份",
  "一个",
  "做",
  "写",
  "出",
  "整理",
  "搭",
  "建立",
  "分析",
  "研究",
  "报告",
  "研报",
  "框架",
  "大纲",
  "个股",
  "股票",
  "公司",
  "行业",
  "路演稿",
  "路演",
  "风险",
  "BP",
  "商业计划书",
  "关于",
  "一下",
  "的",
];

function compactTopic(text: string) {
  let topic = text
    .replace(/[，。！？、,.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const word of stopWords) {
    topic = topic.replace(new RegExp(word, "gi"), " ");
  }

  return topic.replace(/\s+/g, " ").trim();
}

function extractTicker(text: string) {
  const ticker = text.match(/\b[A-Z]{1,6}(?:\.[A-Z]{1,3})?\b/);
  return ticker?.[0] ?? "";
}

function extractTopic(text: string, mode: ReportMode) {
  const quoteTarget = resolveQuoteTarget(text);
  if (quoteTarget) return quoteTarget.name;

  const ticker = extractTicker(text);
  if (ticker && mode === "stock") return ticker;

  const compacted = compactTopic(text);
  if (!compacted) return "";

  if (compacted.length <= 40) return compacted;

  const match = compacted.match(
    /(?:关于|分析|研究|生成|写|做)?\s*([\u4e00-\u9fa5A-Za-z0-9 /.-]{2,30})/,
  );

  return match?.[1]?.trim() || compacted.slice(0, 40);
}

export function resolveAgentIntent(text: string): AgentIntent {
  const trimmed = text.trim();

  if (!trimmed) return { type: "chat" };

  if (hasRealtimeQuoteIntent(trimmed)) {
    return { type: "quote" };
  }

  if (!reportIntentPattern.test(trimmed)) {
    return { type: "chat" };
  }

  if (roadshowIntentPattern.test(trimmed)) {
    return {
      type: "report",
      mode: "roadshow",
      topic: extractTopic(trimmed, "roadshow"),
      context: trimmed,
    };
  }

  if (bpIntentPattern.test(trimmed)) {
    return {
      type: "report",
      mode: "bp",
      topic: extractTopic(trimmed, "bp"),
      context: trimmed,
    };
  }

  if (industryIntentPattern.test(trimmed)) {
    return {
      type: "report",
      mode: "industry",
      topic: extractTopic(trimmed, "industry"),
      context: trimmed,
    };
  }

  if (stockIntentPattern.test(trimmed)) {
    return {
      type: "report",
      mode: "stock",
      topic: extractTopic(trimmed, "stock"),
      context: trimmed,
    };
  }

  return { type: "chat" };
}
