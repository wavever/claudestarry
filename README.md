# Claude 余光 · Claude Starry

你的 Claude 账号没有消失，只是从此不再回应，化作了星河里的一点光。

[在线体验](https://claudestarry.pages.dev/) · [部署说明](docs/deployment.md) · [MIT License](LICENSE)

一个由 Claude 用户自发创建的非官方娱乐项目。用 Three.js 绘制星河，
让用户为停用的账号留下一颗星，以及一段可选的故事。

![Claude Starry 星河预览](public/og-preview.png)

## 功能

- 粒子文字开场、星云、旋转和连续缩放。
- 新记录以流星划入星河；通过 Supabase 同步给在线访客。
- 星星名片、图片复制与下载、由用户操作的 X 分享入口。
- 昵称和停用日期必填，注册日期和故事可留空。
- 支持减少动态效果的系统偏好。

## 本地运行

需要 Node.js 22.12+。

```sh
npm ci
npm run dev
```

打开 <http://127.0.0.1:4317/>。默认使用浏览器本地存储，
不连接正式数据库，也不会自动上传已有的本地记录。

```sh
npm test
npm run build
```

## 部署

正式站使用 Cloudflare Pages 和 Supabase 免费套餐。
按[部署说明](docs/deployment.md)创建自己的 Supabase 项目、执行全部迁移，
并设置生产环境变量；将构建后的 `dist/` 上传到 Cloudflare Pages。
当前站点采用手动上传，推送本仓库不会自动部署。

- 浏览器仅使用项目 URL 和公开的 `anon` key，并受只读权限控制。
- 新增记录经 Pages Worker 校验并限流，数据库统一分配星表编号。
- 管理员密钥和 IP 哈希盐仅配置在 Cloudflare 服务端。
- `.env.production.local`、`.deploy-private/`、构建产物和本地临时脚本不提交。

仓库只包含程序和建表迁移，不包含线上用户记录、数据库密码或管理员密钥。

## 说明

星图坐标和 `AL` 编号属于本站虚拟星图，不是真实天体登记。
历史背景光点使用公开汇总数据的聚合表示，没有逐账号的身份和故事；
页面右上角“已记录”仅统计本站新增记录。
数据口径见 [src/baseline.js](src/baseline.js)，
早期实现和调参记录保存在[开发笔记](docs/development-notes.md)。

本项目与 Anthropic 无隶属或官方合作关系。

## 许可证

项目代码采用 [MIT License](LICENSE)。依赖保留各自许可证。
