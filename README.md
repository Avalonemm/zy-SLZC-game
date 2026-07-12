# 富饶之城 Web 联机桌游原型

这是一个网页端朋友联机桌游 Demo。当前项目保持三段式结构：

- `client`：React + TypeScript + Vite 前端
- `server`：Node.js + Express + Socket.IO 后端
- `shared`：前后端共享类型

后端是权威状态，房间、行动、角色技能、结算都由服务端验证。前端只负责展示和发送玩家操作。

## 本地开发

安装依赖：

```bash
npm install
```

启动前后端：

```bash
npm run dev
```

默认地址：

- 前端：http://localhost:5173
- 后端：http://localhost:3000
- 健康检查：http://localhost:3000/health
- 反向代理预留健康检查：http://localhost:3000/api/health

本地开发时，`client/.env.development` 会让前端连接：

```text
VITE_SERVER_URL=http://localhost:3000
```

也可以分别启动：

```bash
npm run dev:server
npm run dev:client
```

## 一键启动

Windows 下可以直接双击项目根目录里的 `启动游戏.cmd`。

这个启动控件会：

1. 自动进入项目目录。
2. 如果还没有安装依赖，自动运行 `npm install`。
3. 启动前端和后端。
4. 自动打开 `http://localhost:5173`。

停止服务时，在启动窗口里按 `Ctrl+C`。启动控件会同时关闭前端和后端进程。

## 环境变量

### 前端

```text
VITE_SERVER_URL=https://你的后端地址
```

连接规则：

1. 如果存在 `VITE_SERVER_URL`，Socket.IO 客户端连接这个地址。
2. 如果不存在，默认使用 `window.location.origin`。

这意味着：

- Vercel + Render 分离部署时，前端用 `VITE_SERVER_URL` 指向 Render 后端。
- 单台云服务器同域部署时，可以不设置 `VITE_SERVER_URL`，前端会连接当前域名。

### 后端

```text
PORT=3000
CLIENT_ORIGIN=https://你的前端地址
ROOM_SNAPSHOT_PATH=/var/data/active-rooms.json
```

规则：

- 后端端口使用 `process.env.PORT || 3000`。
- 开发环境默认允许 `localhost:5173`、`127.0.0.1:5173`、`localhost:3000`、`127.0.0.1:3000`。
- 生产环境使用 `CLIENT_ORIGIN` 配置允许访问的前端地址。
- `CLIENT_ORIGIN` 支持多个地址，用英文逗号分隔。
- `ROOM_SNAPSHOT_PATH` 保存活动房间、对局状态和恢复凭证；生产环境应指向持久磁盘。

示例：

```text
CLIENT_ORIGIN=https://example.com,https://www.example.com
```

## Vercel 前端 + Render 后端

这是当前公网测试推荐方案。

### Render 后端

仓库根目录已有 `render.yaml`。Render 会使用：

```bash
npm ci && npm run build --workspace server
npm run start --workspace server
```

需要在 Render 环境变量里设置：

```text
CLIENT_ORIGIN=https://你的 Vercel 前端地址
```

后端健康检查：

```text
https://你的 Render 后端地址/health
```

`render.yaml` 已挂载 1GB 持久磁盘到 `/var/data`，用于活动房间快照。更换部署平台时也要为
`ROOM_SNAPSHOT_PATH` 提供持久目录，否则服务器重启后无法恢复进行中的房间。

### Vercel 前端

仓库根目录已有 `vercel.json`。Vercel 会使用：

```bash
npm ci
npm run build --workspace client
```

输出目录：

```text
client/dist
```

需要在 Vercel 环境变量里设置：

```text
VITE_SERVER_URL=https://你的 Render 后端地址
```

注意：不要把游戏后端写成 Vercel Functions。Socket.IO 后端必须保持为普通 Node.js 长连接服务。

## 单台云服务器部署

后续迁移到自己购买的云服务器时，可以使用这种方式：

1. 在服务器上安装 Node.js、npm、PM2、Nginx。
2. 拉取仓库代码。
3. 构建前端：

```bash
npm ci
npm run build --workspace client
```

4. 用 Nginx 托管 `client/dist` 静态文件。
5. 用 PM2 启动后端：

```bash
PORT=3000 CLIENT_ORIGIN=https://你的域名 pm2 start "npm run start --workspace server" --name zy-board-game-server
```

6. Nginx 反向代理：

- `/api` -> `http://127.0.0.1:3000`
- `/socket.io` -> `http://127.0.0.1:3000`

前端和后端同域时，可以不设置 `VITE_SERVER_URL`，前端会默认连接 `window.location.origin`。

Nginx 需要支持 WebSocket Upgrade。示例片段：

```nginx
location / {
  root /var/www/zy-board-game/client/dist;
  try_files $uri $uri/ /index.html;
}

location /api/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}

location /socket.io/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 部署原则

- 不依赖 Vercel 或 Render 的平台专属能力。
- 不使用 Vercel Functions 承载游戏后端。
- 房间逻辑、状态机、Socket.IO 都保持在 `server` 中。
- 前端构建产物始终在 `client/dist`。
- 共享类型始终放在 `shared`。

## 验证命令

```bash
powershell -ExecutionPolicy Bypass -File scripts/check-deploy.ps1
```

这个脚本会运行：

- 后端测试
- TypeScript 检查
- 前端生产构建
- 后端生产构建

卡牌美术资源检查：

```bash
npm run verify:art
npm run verify:art -- --strict  # 正式卡图全部交付后使用
```

## 目录结构

```txt
project-root
├─ client
│  ├─ src
│  │  ├─ components
│  │  ├─ pages
│  │  ├─ socket
│  │  ├─ App.tsx
│  │  ├─ main.tsx
│  │  └─ styles.css
│  ├─ index.html
│  ├─ package.json
│  ├─ tsconfig.json
│  └─ vite.config.ts
├─ server
│  ├─ src
│  │  ├─ data
│  │  ├─ game
│  │  ├─ socket
│  │  │  └─ registerSocketHandlers.ts
│  │  ├─ types
│  │  └─ index.ts
│  ├─ package.json
│  └─ tsconfig.json
└─ shared
   ├─ src
   │  └─ index.ts
   ├─ package.json
   └─ tsconfig.json
```
