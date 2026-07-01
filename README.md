# Web 联机桌游原型

第一阶段项目骨架：React + TypeScript 前端、Node.js + Express + Socket.IO 后端、共享类型包。

## 运行方式

```bash
npm install
npm run dev
```

默认地址：

- 前端：http://localhost:5173
- 后端：http://localhost:4000
- 健康检查：http://localhost:4000/health

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

## 目录结构

```txt
project-root
├─ client
│  ├─ src
│  │  ├─ components
│  │  ├─ pages
│  │  ├─ stores
│  │  ├─ socket
│  │  ├─ types
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
   ├─ types
   │  └─ index.ts
   ├─ package.json
   └─ tsconfig.json
```
