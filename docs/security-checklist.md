# 第一版安全检查清单

## 已处理

1. `.env.local` 不进入 GitHub，真实密钥只放本地和服务器。
2. AI 相关接口要求登录后才能调用。
3. 文件分析限制上传文件类型和大小。
4. Supabase 主表已开启 RLS，用户只能访问自己的记录。
5. 新增 `supabase/harden-rls.sql`，用于强化子表和父表的归属检查。

## Supabase 需要执行

在 Supabase SQL Editor 按顺序执行：

```text
supabase/schema.sql
supabase/harden-rls.sql
```

如果已经执行过 `schema.sql`，只需要补跑：

```text
supabase/harden-rls.sql
```

## GitHub 检查

每次推送前确认：

```bash
git status --short
git ls-files .env .env.local
```

正常情况下只能看到 `.env.example`，不能看到 `.env.local`。

## 服务器检查

1. `.env.local` 只保存在服务器项目目录。
2. Nginx 只暴露 80 和 443。
3. Next.js 应用只监听本机端口，例如 `127.0.0.1:3001`。
4. Cloudflare SSL 使用 `Full (strict)`。
5. PM2 已保存当前进程，服务器重启后应用能自动恢复。

## 后续仍需补强

1. 给每个用户加每日 AI 调用额度。
2. 给接口加更细的频率限制。
3. 给服务器新建普通部署用户，减少 root 登录使用。
4. 增加错误监控和日志告警。
5. 给数据库和服务器配置做定期备份。
