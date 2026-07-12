# 点数与用量账本

第一版用点数控制 AI 和行情接口成本。用户看到的是产品点数，不看到底层模型、供应商和 token 成本。

## 用户看到什么

- 用户中心显示剩余点数。
- 阿U页面显示剩余点数。
- 点数不足时提示充值。

用户不会看到：

- 具体模型名称。
- 供应商名称。
- token 成本。
- 单次调用的真实供应商费用。

## 第一版默认规则

新用户第一次读取余额时，自动获得：

```txt
100 点
```

扣点规则：

```txt
普通问答：2 点
行情问答：2 点
基于阿U记忆问答：3 点
个股分析：10 点
行业研报：20 点
BP 风险分析：30 点
路演稿生成：30 点
文件分析：40 点
```

后续可以根据真实成本、用户反馈和商业套餐调整。

## 后台记录什么

每次成功调用后，后台写入 `ai_usage_logs`：

- 用户 ID
- 功能类型
- 扣除点数
- 输入 token
- 输出 token
- 总 token
- 估算模型成本
- 调用时间
- 其他元信息

这些信息用于内部成本核算，不展示给用户。

## Supabase 需要执行

上线前在 Supabase SQL Editor 执行：

```txt
supabase/add-credits-and-usage.sql
```

注意：不是粘贴文件名，而是打开本地文件，复制里面的完整 SQL 内容，再粘贴到 Supabase SQL Editor 点 Run。

成功后会新增：

```txt
user_credits
ai_usage_logs
spend_user_credits()
```

## 手动充值

第一版先不接支付。用户充值后，可以在 Supabase SQL Editor 手动加点。

示例，把某个用户增加 1000 点：

```sql
update public.user_credits
set
  balance = balance + 1000,
  lifetime_granted = lifetime_granted + 1000,
  updated_at = now()
where user_id = '用户 UUID';
```

用户 UUID 可以在 Supabase Auth Users 或 `user_credits` 表里查看。

## 后续升级

- 增加充值订单表。
- 接微信/支付宝支付。
- 支付成功后自动加点。
- 增加套餐：体验版、专业版、企业版。
- 增加后台管理页面，查看用户余额和用量。
