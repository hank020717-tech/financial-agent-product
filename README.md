# Financial Agent Product

金融行情与 AI 智能体产品原型。

## Current Modules

- `/` 市场行情页，使用 TradingView 组件展示真实行情。
- `/agent` 阿U智能体，接入 DeepSeek 聊天与固定金融研究能力。
- `/api/chat` 服务端接口，用于调用 DeepSeek Chat Completions API。
- `/api/report` 服务端接口，用于分章节生成个股分析、行业研报、BP 风险分析和路演稿。

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
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
```

`.env.local` is ignored by Git and must not be uploaded to GitHub.

## Checks

```bash
npm run lint
npm run build
```
