# yushugeBase — Ngọc Thư Các 网站源码备份

本站点源码备份，取自明玉的 Vercel 线上部署（项目 `ngocthucac`，https://ngocthucac.vercel.app）。

- 备份时间：2026-11-17
- 来源部署：`dpl_4BRHE7h3tuz9XnqNGyoRwP3hjGnh`（production，Vercel Drop 部署）
- 获取方式：Vercel REST API（部署文件接口，v8）逐文件原字节下载，非网页抓取
- 文件数：40 个（2 个 HTML、9 个 CSS、28 个 JS、1 张图片）
- `_vercel_file_tree.json`：本次下载时部署的文件树（含各文件在 Vercel 的文件 ID），备查用

注意：

- `supabase-config.js` 里配的是明玉 live 项目（NGOCTHUCAC-LMS）的 Supabase 地址和公开 key，照原样备份。部署副本时要改成开发项目再跑。
- `assets-trang-chu/co-ngoc.jpeg`（首页明玉照片）因推送工具只支持文本文件，未随这批一起推，需另外上传。
- 本仓库是源码备份，不是多教师升级版。升级开发在开发项目 NGOCTHUCAC-LMS-v2-dev 里做，改动以可重放的 SQL 文件记录，开发完再迁回 live。
