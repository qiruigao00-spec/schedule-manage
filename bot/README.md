# 微信档期查询服务（待线上联调）

通过腾讯 openclaw-weixin HTTP 协议对接 ClawBot，不运行完整 OpenClaw：
https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol.md

## 云托管配置

先提交并推送 bot 目录。选择该仓库和分支，构建上下文/根目录填写 bot，Dockerfile 为 Dockerfile，服务端口 8080，健康检查 GET /healthz。
持续运行，最小/最大实例数均为1。先确认费用。更新时停止旧版本再启动新版本，避免滚动发布产生两个轮询实例；暂未实现分布式租约。

环境变量：
- CLOUDBASE_ENV_ID=shanli-d7gagpq0537ff1303
- ADMIN_TOKEN：至少32字符随机管理密钥，不提交Git，不发到聊天
- PORT=8080

在该环境手动创建 bot_state 文档集合，禁止小程序客户端读写，仅服务端可访问。其中存储微信绑定凭证和游标。服务身份还需有读取 schedules 的权限。SDK 使用云运行环境身份，须上线验证。

## 扫码绑定

用可信 HTTP 客户端请求服务 HTTPS 地址。所有管理接口必须携带 Authorization: Bearer <ADMIN_TOKEN>；不要把密钥放进 URL。

1. POST /admin/login，空请求体。将返回的 qrcode_img_content 在可信客户端显示为二维码或打开其二维码链接。
2. 手机微信扫码确认，重复 POST /admin/login/status，直到 confirmed。
3. GET /admin/status 检查 bound 和 lastSuccess，不会返回凭证。
4. 微信询问“山梨2026年11月7日有档期吗”或“11月7日谁有空”。

普通扫码和受信任微信域名重定向已实现。验证码、已绑定跳转等额外状态尚未适配，遇到需停止并补充登录流程。-14 会话失效会暂停一小时；重新绑定恢复流程尚未实现。

## 查询范围

支持年月日或月日：2026年11月7日、2026-11-07、2026/11/7、11月7日、11/7。
缺省年份按上海当前年份。不支持明天、下周六、日期范围、上午下午、语音、多轮对话。
摄影师：山梨、牧羊、小拐。仅扫码绑定本人可查询。回复已有项目、地点、完整备注；无记录时只说明系统未记录安排，需进一步确认。

绑定与游标保存于数据库，容器重启可恢复。发送成功但游标未保存时可能重试，稳定 client_id 降低重复风险，但不保证端到端严格一次。/healthz 仅证明HTTP存活，lastSuccess 用于检查微信轮询。

## 验证

Node 22 运行 npm install 后 npm test。基础规则也可执行 node query.test.js。
目前仅查询规则和语法检查通过，依赖安装、云身份、扫码绑定、线上收发尚未验证，不应直接视为生产可用。
