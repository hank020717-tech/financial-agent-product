export type QuoteResult = {
  name: string;
  query: string;
  symbol: string;
  price: number;
  currency?: string;
  datetime?: string;
  source: string;
  note?: string;
};

type QuoteTarget = {
  name: string;
  symbol: string;
  currency?: string;
};

const quoteTargets: Array<QuoteTarget & { aliases: string[] }> = [
  {
    name: "黄金现货",
    symbol: "XAU/USD",
    currency: "USD",
    aliases: ["黄金", "金价", "gold", "xau", "xauusd", "xau/usd"],
  },
  {
    name: "WTI 原油",
    symbol: "WTI/USD",
    currency: "USD",
    aliases: ["原油", "wti", "oil", "美油"],
  },
  {
    name: "美元指数",
    symbol: "DXY",
    aliases: ["美元指数", "dxy"],
  },
  {
    name: "比特币",
    symbol: "BTC/USD",
    currency: "USD",
    aliases: ["btc", "bitcoin", "比特币"],
  },
  {
    name: "以太坊",
    symbol: "ETH/USD",
    currency: "USD",
    aliases: ["eth", "ethereum", "以太坊"],
  },
  {
    name: "英伟达",
    symbol: "NVDA",
    currency: "USD",
    aliases: ["nvda", "英伟达", "nvidia"],
  },
  {
    name: "苹果",
    symbol: "AAPL",
    currency: "USD",
    aliases: ["aapl", "苹果", "apple"],
  },
  {
    name: "特斯拉",
    symbol: "TSLA",
    currency: "USD",
    aliases: ["tsla", "特斯拉", "tesla"],
  },
  {
    name: "标普500",
    symbol: "SPX",
    currency: "USD",
    aliases: ["标普500", "标普", "s&p", "sp500", "spx"],
  },
  {
    name: "纳斯达克综合指数",
    symbol: "IXIC",
    currency: "USD",
    aliases: ["纳斯达克", "nasdaq", "ixic"],
  },
  {
    name: "恒生指数",
    symbol: "HSI",
    aliases: ["恒生", "恒生指数", "hsi"],
  },
  {
    name: "上证指数",
    symbol: "000001",
    aliases: ["上证", "上证指数", "000001"],
  },
];

const realtimeIntentPattern =
  /(现在|当前|实时|最新|此刻|今天|目前|多少钱|价格|报价|点位|涨跌|行情|quote|price)/i;

export function hasRealtimeQuoteIntent(text: string) {
  const normalizedText = text.toLowerCase();
  return (
    realtimeIntentPattern.test(normalizedText) &&
    quoteTargets.some((target) =>
      target.aliases.some((alias) => normalizedText.includes(alias.toLowerCase())),
    )
  );
}

export function resolveQuoteTarget(text: string): QuoteTarget | null {
  const normalizedText = text.toLowerCase();
  const target = quoteTargets.find((item) =>
    item.aliases.some((alias) => normalizedText.includes(alias.toLowerCase())),
  );

  if (!target) return null;

  return {
    name: target.name,
    symbol: target.symbol,
    currency: target.currency,
  };
}

export async function fetchTwelveDataQuote({
  target,
  query,
}: {
  target: QuoteTarget;
  query: string;
}): Promise<QuoteResult> {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  if (!apiKey) {
    throw new Error(
      "实时行情数据源还没有配置。请在 .env.local 中设置 TWELVEDATA_API_KEY，智能体才能回答最新价格。",
    );
  }

  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", target.symbol);
  url.searchParams.set("interval", "1min");
  url.searchParams.set("outputsize", "1");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();

  if (!response.ok || data.status === "error") {
    throw new Error(
      data.message ||
        `无法获取 ${target.name} 的实时行情，请检查数据源权限或标的代码。`,
    );
  }

  const latest = data.values?.[0];
  const close = Number(latest?.close);

  if (!Number.isFinite(close)) {
    throw new Error(`没有获取到 ${target.name} 的有效最新价格。`);
  }

  return {
    name: target.name,
    query,
    symbol: target.symbol,
    price: close,
    currency: data.meta?.currency || target.currency,
    datetime: latest?.datetime,
    source: "Twelve Data",
    note: "不同市场可能存在交易时段、免费额度或交易所延迟限制。",
  };
}

export function formatQuoteForPrompt(quote: QuoteResult) {
  return [
    `查询对象：${quote.name}`,
    `代码：${quote.symbol}`,
    `最新价格：${quote.price}${quote.currency ? ` ${quote.currency}` : ""}`,
    `数据时间：${quote.datetime || "数据源未返回时间"}`,
    `数据来源：${quote.source}`,
    quote.note ? `说明：${quote.note}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
