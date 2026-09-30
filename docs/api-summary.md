# Store API 调用摘要

## 商品查询

`GET /api/products?q=鼠标&category=数码` 返回商品 ID、名称、分类、价格（分）、库存、变体、`lowStock` 与 `soldOut`。搜索为空时返回空数组，不返回 404。

## 加入购物车

`POST /api/cart/items`

```json
{"productId":"p02","quantity":1}
```

成功返回 201 和完整购物车，并通过 HttpOnly、SameSite=Lax Cookie 保存购物车 ID。数量为 0 返回 400；商品售罄或超库存返回 409。

## 创建订单

`POST /api/orders`

```json
{
  "requestId":"浏览器生成的 UUID",
  "customerName":"侯宇晴",
  "phone":"13800138000",
  "address":"江苏省南京市软件大道 2304 号"
}
```

后端先用 `requestId` 查重，再校验地址和购物车，在 SQLite 立即事务中重新读取库存、扣减、写订单和明细、清购物车。重复提交相同 ID 返回原订单并带 `duplicate: true`，不会再次扣库存。

## 自主功能：低库存提示

管理页通过 `PUT /api/admin/settings/low-stock` 提交 `{"threshold":6}`。阈值存入 SQLite `settings` 表，商品列表根据实时库存计算状态。阈值只允许 1-20 的整数；售罄与低库存分开显示。
