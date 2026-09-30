# Pull Request 自审记录

拟定 PR：`feat(store): complete shopping and low-stock flow`。

- [x] 商品价格和库存只由后端决定。
- [x] 创建订单使用事务，失败会回滚。
- [x] `requestId` 唯一约束避免重复订单。
- [x] 零库存、超量、无效地址和删除不存在项目均有明确错误。
- [x] 数据库、Cookie、日志和敏感配置未提交。
- [x] 自动测试 12/12 通过，移动端无水平溢出。
- [x] 管理页明确标注没有生产级身份认证。
- [x] README 如实记录没有运行 Medusa 全栈的环境限制。

已知风险：Node.js 22 的 `node:sqlite` 仍标记为实验特性；本地管理页无认证；单进程 SQLite 不适合高并发生产负载。
