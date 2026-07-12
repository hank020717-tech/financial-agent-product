# Financial Agent Product

金融行情与 AI 智能体产品原型。

## Current Modules

- `/` 市场行情页，使用 TradingView 组件展示真实行情。
- `/agent` 阿U智能体，接入 DeepSeek 聊天与固定金融研究能力。
- `/api/chat` 服务端接口，用于调用 DeepSeek Chat Completions API。
- `/api/quote` 服务端接口，用于查询实时行情工具。
- `/api/report` 服务端接口，用于分章节生成个股分析、行业研报、BP 风险分析和路演稿。
- `/api/analyze-file` 服务端接口，用于解析并分析 PDF、DOCX、PPTX、TXT、MD 等文件。

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

For first-version acceptance testing, use the production preview mode:

```bash
npm run preview
```

Open:

```txt
http://127.0.0.1:3000
```

## DeepSeek Setup

Create `.env.local` in the project root:

```txt
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_MODEL=deepseek-v4-flash
TWELVEDATA_API_KEY=your_twelve_data_api_key_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url_here
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key_here
```

`.env.local` is ignored by Git and must not be uploaded to GitHub.

`TWELVEDATA_API_KEY` is used by the agent when users ask real-time quote
questions, such as gold, BTC, NVDA, S&P 500, oil, or the US dollar index.

Supabase is used for login, history, reports, file records, Storage, and the
agent memory created from uploaded file analyses.

## Checks

```bash
npm run lint
npm run build
npm run verify
```

## Deployment

See `docs/deployment-checklist.md` before deploying to Vercel or your own
server.

For the current Alibaba Cloud + Cloudflare production setup, see
`docs/online-deployment-guide.md`.

For production maintenance, backups, PM2 auto-start, and rollback steps, see
`docs/operations-backup-checklist.md`.

For the first-version credit balance and usage ledger, see
`docs/credits-and-usage.md`.

## Acceptance

See `docs/first-version-acceptance.md` for the first-version product test flow.
