# 线上运维与备份清单

本文档用于第一版上线后的日常维护。目标是：服务器重启能自动恢复，关键配置有备份，更新失败时知道怎么回退。

## 需要备份的内容

以下内容不要提交到 GitHub，但需要由项目负责人保存一份离线备份。

### 1. 服务器环境变量

服务器文件：

```bash
/var/www/financial-agent-product/.env.local
```

里面包含 DeepSeek、Twelve Data、Supabase 等密钥。备份时只保存到可信位置，不要发到公开聊天、GitHub、网盘公开链接。

检查文件是否存在：

```bash
sudo ls -l /var/www/financial-agent-product/.env.local
```

查看变量名，不显示具体值：

```bash
sudo awk -F= '{print $1}' /var/www/financial-agent-product/.env.local
```

### 2. Nginx 配置

金融智能体配置：

```bash
/etc/nginx/sites-available/financial-agent-product
```

备份命令：

```bash
sudo cp /etc/nginx/sites-available/financial-agent-product /root/financial-agent-product.nginx.backup
```

恢复命令：

```bash
sudo cp /root/financial-agent-product.nginx.backup /etc/nginx/sites-available/financial-agent-product
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Cloudflare 源站证书

证书位置：

```bash
/etc/ssl/cloudflare/agent.717828.xyz.pem
/etc/ssl/cloudflare/agent.717828.xyz.key
```

注意：

- `.pem` 是 Certificate。
- `.key` 是 Private Key。
- `.key` 不能公开。

检查开头：

```bash
sudo head -n 1 /etc/ssl/cloudflare/agent.717828.xyz.pem
sudo head -n 1 /etc/ssl/cloudflare/agent.717828.xyz.key
```

正确结果：

```txt
-----BEGIN CERTIFICATE-----
-----BEGIN PRIVATE KEY-----
```

第二行也可能是：

```txt
-----BEGIN RSA PRIVATE KEY-----
```

### 4. Cloudflare DNS 设置

需要截图或记录：

```txt
Type: A
Name: agent
IPv4 address: 47.83.123.63
Proxy status: Proxied
TTL: Auto
```

Cloudflare SSL/TLS 模式：

```txt
Full (strict)
```

### 5. Supabase 项目配置

需要记录：

```txt
Site URL:
https://agent.717828.xyz

Redirect URLs:
https://agent.717828.xyz/**
http://localhost:3000/**
http://localhost:3001/**
```

还需要确认：

- Auth 已启用。
- Storage bucket `user-files` 已存在。
- 数据表 RLS 已启用。
- SQL 脚本已经执行：`schema.sql`、`add-storage-and-knowledge.sql`、`harden-rls.sql`。

## PM2 开机自启

金融智能体由 PM2 托管。

查看进程：

```bash
pm2 status
```

应该看到：

```txt
financial-agent-product
```

并且状态是：

```txt
online
```

保存当前进程列表：

```bash
pm2 save
```

生成开机自启命令：

```bash
pm2 startup
```

执行后，PM2 会输出一行很长的 `sudo env PATH=...` 命令。复制它并执行一次。

验证重启后是否恢复：

```bash
sudo reboot
```

服务器重启后重新连接，检查：

```bash
pm2 status
curl http://127.0.0.1:3001
```

然后浏览器打开：

```txt
https://agent.717828.xyz
```

## 日常健康检查

每次更新前后都建议检查：

```bash
pm2 status
sudo nginx -t
sudo ss -tulpn | grep -E ':80|:443|:3000|:3001'
```

预期：

- 80 和 443 由 Nginx 监听。
- 3000 由 One API 使用。
- 3001 由金融智能体使用。
- `financial-agent-product` 在 PM2 中为 online。

## 更新发布流程

本地完成开发并推送 GitHub 后，在服务器执行：

```bash
cd /var/www/financial-agent-product
git pull origin main
npm install
npm run build
pm2 restart financial-agent-product --update-env
pm2 save
```

更新后检查：

```bash
pm2 status
curl http://127.0.0.1:3001
```

浏览器验收：

1. 打开 `https://agent.717828.xyz`。
2. 登录。
3. 问一句普通问题。
4. 问一句行情问题。
5. 上传文件分析。
6. 打开历史记录。
7. 测试导出。

## 简单回滚方式

如果更新后线上不能用，先不要改数据库。

查看最近提交：

```bash
cd /var/www/financial-agent-product
git log --oneline -5
```

回到上一个稳定提交：

```bash
git checkout <稳定提交号>
npm install
npm run build
pm2 restart financial-agent-product --update-env
```

确认恢复后，再决定是否把代码分支切回 `main` 或重新修复。

回到 main：

```bash
git checkout main
git pull origin main
```

## 常见问题

### 打开 agent 域名还是 One API

检查：

```bash
sudo nginx -T | grep -n -E 'server_name|proxy_pass'
```

确认 `agent.717828.xyz` 代理到：

```txt
http://127.0.0.1:3001
```

### 页面打不开

检查：

```bash
pm2 status
pm2 logs financial-agent-product
curl http://127.0.0.1:3001
```

### HTTPS 报错

检查：

```bash
sudo nginx -t
sudo head -n 1 /etc/ssl/cloudflare/agent.717828.xyz.pem
sudo head -n 1 /etc/ssl/cloudflare/agent.717828.xyz.key
```

同时确认 Cloudflare 是 `Full (strict)`。

### 登录跳转异常

检查 Supabase Auth URL Configuration：

```txt
Site URL: https://agent.717828.xyz
Redirect URLs: https://agent.717828.xyz/**
```

## 后续增强

第一版稳定后，建议继续补：

- 新建普通部署用户，减少 root 登录。
- 配置服务器定期快照。
- 配置 Supabase 数据库定期备份。
- 增加 Sentry 错误监控。
- 增加接口频率限制。
- 增加用户每日 AI 调用额度。
- 增加重要环境变量轮换记录。
