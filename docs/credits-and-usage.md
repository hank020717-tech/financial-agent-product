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

第一版先不接支付。请使用下方的“内部手动充值”流程，不要直接修改 `user_credits`，否则不会留下完整的点数流水。

## 后续升级

- 增加充值订单表。
- 接微信/支付宝支付。
- 支付成功后自动加点。
- 增加套餐：体验版、专业版、企业版。

## 用户中心和点数流水

登录用户可以在“用户中心”看到：

- 当前余额、累计获得和累计消耗。
- 最近的点数流水。
- 哪个功能消耗了点数，以及消耗时间。

首次使用这项功能前，需要在 Supabase SQL Editor 执行：

```txt
supabase/add-credit-ledger-and-admin.sql
```

这是增量 SQL，不需要重复执行之前的点数 SQL。执行成功后会新增：

```txt
credit_transactions
admin_users
admin_grant_user_credits()
```

## 内部手动充值

第一版暂时不接微信或支付宝。管理员可以使用隐藏地址：

```txt
/admin/credits
```

先在 Supabase Auth Users 中复制管理员自己的 UUID，然后在 SQL Editor 执行一次：

```sql
insert into public.admin_users (user_id, note)
values ('管理员自己的用户 UUID', '产品管理员');
```

之后管理员登录产品，用目标用户的 UUID、充值点数和备注完成充值。充值会自动写入 `credit_transactions`，客户会在用户中心看到余额变化。

注意：不要把 `admin_users` 表开放给普通用户，也不要给浏览器端配置 Supabase Service Role Key。管理员权限由数据库函数检查。
