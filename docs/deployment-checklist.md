# 第一版部署清单

## 上线前检查

```bash
npm run verify
```

该命令会依次执行代码检查和生产构建。

## 必填环境变量

线上平台需要填写这些变量，真实值不要提交到 GitHub。

```txt
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
TWELVEDATA_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

## Supabase 必做项

1. SQL Editor 已执行 `supabase/schema.sql`。
2. `user-files` Storage bucket 已创建，且不是公开 bucket。
3. RLS 已开启，用户只能访问自己的对话、报告、文件、文件分析和阿U记忆。
4. Auth 邮箱登录可用。
5. 如果开启邮箱确认，需要在 Supabase Auth 里配置正式站点 URL。

## Vercel 部署

1. 导入 GitHub 仓库。
2. Framework 选择 Next.js。
3. Build command 使用 `npm run build`。
4. Install command 使用 `npm install`。
5. 在 Environment Variables 填写必填环境变量。
6. 部署完成后，把 Vercel 域名填到 Supabase Auth 的站点 URL / Redirect URLs。

## 自有服务器部署

1. 拉取 GitHub 仓库。
2. 安装依赖：`npm install`。
3. 在服务器上创建 `.env.local`，填写必填环境变量。
4. 构建：`npm run build`。
5. 启动：`npm run start`。
6. 用 Nginx 或其他反向代理绑定域名和 HTTPS。
7. 把正式域名填到 Supabase Auth 的站点 URL / Redirect URLs。

## 上线后验收

1. 打开市场行情页。
2. 注册或登录。
3. 提问实时价格，例如“黄金现在多少钱”。
4. 上传文件并生成分析。
5. 确认状态出现“已加入阿U记忆”。
6. 追问“根据我上传过的资料，总结核心风险”。
7. 打开历史记录，确认对话、报告、文件分析能查看、导出、删除。
8. 退出登录后确认历史记录不可见。
