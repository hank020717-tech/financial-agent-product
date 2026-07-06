"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ChevronRight, Search, Star, UserRound } from "lucide-react";

type MarketInstrument = {
  name: string;
  category: string;
  symbol: string;
  tvSymbol: string;
  region: string;
};

const watchlist: MarketInstrument[] = [
  {
    name: "上证指数",
    category: "指数",
    symbol: "000001",
    tvSymbol: "SSE:000001",
    region: "中国内地",
  },
  {
    name: "恒生指数",
    category: "指数",
    symbol: "HSI",
    tvSymbol: "HSI:HSI",
    region: "中国香港",
  },
  {
    name: "纳斯达克",
    category: "指数",
    symbol: "IXIC",
    tvSymbol: "NASDAQ:IXIC",
    region: "美国",
  },
  {
    name: "标普500",
    category: "指数",
    symbol: "SPX",
    tvSymbol: "TVC:SPX",
    region: "美国",
  },
  {
    name: "黄金",
    category: "大宗商品",
    symbol: "XAUUSD",
    tvSymbol: "OANDA:XAUUSD",
    region: "全球",
  },
  {
    name: "原油",
    category: "大宗商品",
    symbol: "CL1!",
    tvSymbol: "NYMEX:CL1!",
    region: "全球",
  },
  {
    name: "美元指数",
    category: "外汇",
    symbol: "DXY",
    tvSymbol: "TVC:DXY",
    region: "全球",
  },
  {
    name: "BTC",
    category: "加密货币",
    symbol: "BTCUSDT",
    tvSymbol: "BINANCE:BTCUSDT",
    region: "全球",
  },
  {
    name: "ETH",
    category: "加密货币",
    symbol: "ETHUSDT",
    tvSymbol: "BINANCE:ETHUSDT",
    region: "全球",
  },
  {
    name: "NVDA",
    category: "股票",
    symbol: "NVDA",
    tvSymbol: "NASDAQ:NVDA",
    region: "美国",
  },
  {
    name: "AAPL",
    category: "股票",
    symbol: "AAPL",
    tvSymbol: "NASDAQ:AAPL",
    region: "美国",
  },
  {
    name: "TSLA",
    category: "股票",
    symbol: "TSLA",
    tvSymbol: "NASDAQ:TSLA",
    region: "美国",
  },
];

function TradingViewTickerTape() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: watchlist.map((item) => ({
        proName: item.tvSymbol,
        title: item.name,
      })),
      showSymbolLogo: true,
      isTransparent: true,
      displayMode: "adaptive",
      colorTheme: "light",
      locale: "zh_CN",
    });

    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, []);

  return (
    <div className="min-h-[72px] overflow-hidden border-y border-zinc-200 bg-white">
      <div ref={containerRef} className="tradingview-widget-container" />
    </div>
  );
}

function TradingViewChart({ instrument }: { instrument: MarketInstrument }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerId = useMemo(
    () => `tradingview-chart-${instrument.tvSymbol.replace(/[^a-zA-Z0-9]/g, "-")}`,
    [instrument.tvSymbol],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = `<div id="${containerId}" class="tradingview-widget-container__widget h-full w-full"></div>`;

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: instrument.tvSymbol,
      interval: "15",
      timezone: "Asia/Shanghai",
      theme: "light",
      style: "1",
      locale: "zh_CN",
      allow_symbol_change: true,
      calendar: false,
      details: true,
      hide_side_toolbar: false,
      hotlist: false,
      support_host: "https://www.tradingview.com",
      withdateranges: true,
    });

    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [containerId, instrument.tvSymbol]);

  return (
    <div className="h-[520px] min-h-[420px] overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div ref={containerRef} className="tradingview-widget-container h-full w-full" />
    </div>
  );
}

export default function Home() {
  const [selectedSymbol, setSelectedSymbol] = useState("TVC:SPX");
  const [query, setQuery] = useState("");

  const selectedInstrument =
    watchlist.find((item) => item.tvSymbol === selectedSymbol) ?? watchlist[3];

  const filteredWatchlist = watchlist.filter((item) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;

    return [item.name, item.symbol, item.tvSymbol, item.category, item.region]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-zinc-950">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-4 px-4 sm:px-6">
          <div className="flex min-w-[132px] items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 bg-zinc-50 text-sm font-semibold text-zinc-500">
              市
            </div>
            <span className="text-base font-semibold text-zinc-900">
              市场行情
            </span>
          </div>

          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索股票、指数、大宗商品、外汇、加密货币"
              className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          <Link
            href="/agent"
            className="hidden h-10 shrink-0 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 sm:inline-flex"
          >
            <Bot className="h-4 w-4" aria-hidden="true" />
            阿U智能体
          </Link>

          <Link
            href="/login"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            <UserRound className="h-4 w-4" aria-hidden="true" />
            登录/注册
          </Link>
        </div>
      </header>

      <TradingViewTickerTape />

      <section className="mx-auto grid w-full max-w-[1440px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="h-fit rounded-lg border border-zinc-200 bg-white">
          <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
            <div>
              <h1 className="text-sm font-semibold text-zinc-950">自选关注</h1>
              <p className="text-xs text-zinc-500">默认市场观察列表</p>
            </div>
            <Star className="h-4 w-4 text-amber-500" aria-hidden="true" />
          </div>

          <div className="max-h-[calc(100vh-190px)] overflow-auto p-2">
            {filteredWatchlist.map((instrument) => {
              const isSelected = instrument.tvSymbol === selectedSymbol;

              return (
                <button
                  key={instrument.tvSymbol}
                  onClick={() => setSelectedSymbol(instrument.tvSymbol)}
                  className={`mb-1 flex h-[68px] w-full items-center justify-between rounded-lg px-3 text-left transition ${
                    isSelected
                      ? "bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200"
                      : "text-zinc-800 hover:bg-zinc-50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {instrument.name}
                    </span>
                    <span className="mt-1 block truncate text-xs text-zinc-500">
                      {instrument.symbol} · {instrument.category}
                    </span>
                  </span>
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 ${
                      isSelected ? "text-emerald-600" : "text-zinc-300"
                    }`}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {selectedInstrument.category} · {selectedInstrument.region}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-zinc-950">
                    {selectedInstrument.name}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    TradingView: {selectedInstrument.tvSymbol}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-right">
                  <p className="text-xs text-zinc-500">默认详情</p>
                  <p className="text-sm font-semibold text-zinc-900">
                    15分钟 / 日内切换
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-sm font-semibold text-zinc-950">数据说明</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                第一版行情、图表和报价跳动由 TradingView 提供。后续接入自有
                API 或专业机构数据时，保留当前页面结构，替换行情数据层。
              </p>
            </div>
          </div>

          <TradingViewChart instrument={selectedInstrument} />
        </section>
      </section>
    </main>
  );
}
