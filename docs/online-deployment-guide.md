# 线上部署说明

本文档记录第一版线上部署方式，用于以后迁移、重启、排错和交接。

## 当前线上信息

- 正式访问地址：https://agent.717828.xyz
- 主域名：717828.xyz
- 智能体子域名：agent.717828.xyz
- 服务器：阿里云 ECS，Ubuntu 22.04
- 服务器公网 IP：47.83.123.63
- 代码目录：/var/www/financial-agent-product
- GitHub 仓库：https://github.com/hank020717-tech/financial-agent-product

## 服务分工

服务器上同时保留两个服务：

- One API：继续使用原来的服务，运行在 3000 端口。
- 金融行情与阿U智能体：运行在 3001 端口。

Nginx 负责按域名转发：

- 717828.xyz / www.717828.xyz：继续转发到 One API。
- agent.717828.xyz：转发到金融智能体应用。

不要为了部署金融智能体停止 One API，除非明确要调整旧服务。

## 服务器依赖

服务器需要具备：

```bash
node -v
npm -v
git --version
nginx -v
pm2 -v
```

如果 Node.js 或 npm 不存在，需要先安装 Node.js。生产环境建议使用长期支持版 Node.js。

## 拉取代码

首次部署：

```bash
cd /var/www
git clone https://github.com/hank020717-tech/financial-agent-product.git
cd financial-agent-product
npm install
```

后续更新：

```bash
cd /var/www/financial-agent-product
git pull origin main
npm install
npm run build
pm2 restart financial-agent-product
```

## 环境变量

线上项目目录需要有 `.env.local`，真实密钥只放服务器，不提交到 GitHub。

文件位置：

```bash
/var/www/financial-agent-product/.env.local
```

需要包含：

```txt
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
TWELVEDATA_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

修改 `.env.local` 后，需要重新构建并重启：

```bash
npm run build
pm2 restart financial-agent-product
```

## 启动应用

金融智能体固定运行在 3001 端口，避免和 One API 的 3000 端口冲突。

```bash
cd /var/www/financial-agent-product
npm run build
pm2 start npm --name financial-agent-product -- run start -- -p 3001
pm2 save
```

查看状态：

```bash
pm2 status
pm2 logs financial-agent-product
```

如果之前有错误进程，可以先删除再重启：

```bash
pm2 delete financial-agent-product
pm2 start npm --name financial-agent-product -- run start -- -p 3001
pm2 save
```

服务器内部测试：

```bash
curl http://127.0.0.1:3001
```

能看到包含页面内容的 HTML，说明 Next.js 应用已经启动。

## Nginx 配置

金融智能体的 Nginx 配置文件：

```bash
/etc/nginx/sites-available/financial-agent-product
```

当前配置：

```nginx
server {
    listen 80;
    server_name agent.717828.xyz;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name agent.717828.xyz;

    client_max_body_size 60M;

    ssl_certificate /etc/ssl/cloudflare/agent.717828.xyz.pem;
    ssl_certificate_key /etc/ssl/cloudflare/agent.717828.xyz.key;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
}
```

启用配置：

```bash
sudo ln -sf /etc/nginx/sites-available/financial-agent-product /etc/nginx/sites-enabled/financial-agent-product
sudo nginx -t
sudo systemctl reload nginx
```

域名转发测试：

```bash
curl -H "Host: agent.717828.xyz" http://127.0.0.1
```

## HTTPS 证书

HTTPS 使用 Cloudflare Origin Certificate。

证书文件：

```bash
/etc/ssl/cloudflare/agent.717828.xyz.pem
```

私钥文件：

```bash
/etc/ssl/cloudflare/agent.717828.xyz.key
```

注意：

- `.pem` 放 Certificate，开头应该是 `-----BEGIN CERTIFICATE-----`。
- `.key` 放 Private Key，开头应该是 `-----BEGIN PRIVATE KEY-----` 或 `-----BEGIN RSA PRIVATE KEY-----`。

检查方式：

```bash
sudo head -n 1 /etc/ssl/cloudflare/agent.717828.xyz.pem
sudo head -n 1 /etc/ssl/cloudflare/agent.717828.xyz.key
```

设置私钥权限：

```bash
sudo chmod 600 /etc/ssl/cloudflare/agent.717828.xyz.key
```

Cloudflare 中的 SSL/TLS 模式使用：

```txt
Full (strict)
```

## Cloudflare DNS

需要存在 DNS 记录：

```txt
Type: A
Name: agent
IPv4 address: 47.83.123.63
Proxy status: Proxied
TTL: Auto
```

正式 HTTPS 通过后，浏览器访问：

```txt
https://agent.717828.xyz
```

应显示金融行情与阿U智能体页面，且浏览器不再提示不安全。

## Supabase 配置

Supabase Auth 的 URL 配置：

```txt
Site URL:
https://agent.717828.xyz
```

Redirect URLs：

```txt
https://agent.717828.xyz/**
http://localhost:3000/**
http://localhost:3001/**
```

Supabase 已承担：

- 用户登录和注册。
- 保存对话、报告、文件分析。
- 保存上传文件。
- 保存阿U记忆和知识片段。
- 通过 RLS 隔离不同用户数据。

## 线上验收

部署或更新后，按顺序检查：

1. 打开 https://agent.717828.xyz，确认不是 One API 页面。
2. 地址栏不显示不安全。
3. 首页市场行情能加载。
4. 进入阿U智能体页面。
5. 登录已有账号。
6. 提问一句普通问题，确认能回复。
7. 问价格问题，例如“黄金现在多少钱”，确认能调用行情数据。
8. 上传文件并生成 BP 风险分析或路演稿。
9. 打开历史记录，确认对话、报告、文件分析已保存。
10. 测试导出 MD / TXT。
11. 刷新页面后再次进入历史记录，确认数据仍在。

## 常用排错

查看端口占用：

```bash
sudo ss -tulpn | grep -E ':80|:443|:3000|:3001'
```

查看 PM2：

```bash
pm2 status
pm2 logs financial-agent-product
```

查看 Docker 中的 One API：

```bash
docker ps
```

查看 Nginx 实际配置：

```bash
sudo nginx -T | grep -n -E 'listen|server_name|proxy_pass'
```

测试 Nginx 配置：

```bash
sudo nginx -t
```

重载 Nginx：

```bash
sudo systemctl reload nginx
```

如果 `agent.717828.xyz` 打开成 One API，优先检查：

1. Cloudflare DNS 里的 `agent` 是否指向 47.83.123.63。
2. Nginx 是否有 `server_name agent.717828.xyz`。
3. 该 server 是否代理到 `127.0.0.1:3001`。
4. Next.js 应用是否真的在 3001 端口运行。

如果 HTTPS 报错，优先检查：

1. Cloudflare SSL/TLS 是否为 `Full (strict)`。
2. `.pem` 和 `.key` 是否放反。
3. Nginx `ssl_certificate` 和 `ssl_certificate_key` 路径是否正确。
4. `sudo nginx -t` 是否通过。

## 更新发布流程

每次本地开发完成后：

```bash
npm run verify
git status --short
git add .
git commit -m "描述本次更新"
git push origin main
```

服务器更新：

```bash
cd /var/www/financial-agent-product
git pull origin main
npm install
npm run build
pm2 restart financial-agent-product
pm2 save
```

然后按“线上验收”重新检查。

## 后续建议

- 给服务器新增普通部署用户，减少 root 登录。
- 增加 Sentry 错误监控。
- 增加 PostHog 产品分析。
- 增加数据库和服务器定期备份。
- 增加接口频率限制和用户用量额度。
- 等第一版产品名确定后，替换页面中的临时命名。
