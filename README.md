# Ask your DB 🤖📊

**Ask your DB** is a full-stack, AI-powered database analytics and querying application. It enables users to connect PostgreSQL data sources and query their databases using natural language, automatically generating SQL queries, executing them securely, and rendering interactive results, tables, and visualizations.

---

## 🌟 Key Features

- 💬 **Natural Language Text-to-SQL Chat**: Ask questions about your data in plain English; get SQL queries, execution results, and context-aware summaries.
- 🔌 **Datasource Management**: Connect, inspect schemas, test connections, and manage multiple PostgreSQL databases.
- ⚡ **Real-Time AI Streaming**: Smooth streaming chat responses powered by Mastra AI and Streamdown with syntax-highlighted code blocks, math formatting, and Mermaid diagrams.
- 🔐 **Authentication**: User authentication and session management powered by Better-Auth.
- 📦 **Monorepo Architecture**: Clean separation of concerns with shared packages for UI primitives, database schema, API routers, auth, and environment configuration.
- 🛡️ **End-to-End Type Safety**: Strict TypeScript integration from database schema definitions (Drizzle ORM) to API contracts (tRPC) and frontend components.

---

## 🛠️ Tech Stack

### 🚀 Core & Frameworks
- **[Next.js 16](https://nextjs.org/)** (App Router) – Full-stack React framework
- **[React 19](https://react.dev/)** – Frontend UI library
- **[TypeScript 6](https://www.typescriptlang.org/)** – Static typing & type safety

### 🤖 AI & Streaming
- **[Mastra AI](https://mastra.ai/)** (`@mastra/core`, `@mastra/memory`, `@mastra/pg`, `@mastra/ai-sdk`) – Agentic workflow engine, tool execution, and database memory integration
- **[Vercel AI SDK](https://sdk.vercel.ai/docs)** (`ai`, `@ai-sdk/react`) – AI UI hooks and streaming abstractions
- **[Streamdown](https://github.com/streamdown/streamdown)** (`streamdown`, `@streamdown/code`, `@streamdown/mermaid`, `@streamdown/math`) – High-performance markdown rendering engine with code syntax highlighting, math, and Mermaid charts

### 🔌 API & State Management
- **[tRPC v11](https://trpc.io/)** (`@trpc/server`, `@trpc/client`, `@trpc/tanstack-react-query`) – End-to-end type-safe APIs without code generation
- **[TanStack Query v5](https://tanstack.com/query)** (`@tanstack/react-query`) – Asynchronous data fetching, caching, and state management
- **[TanStack Form](https://tanstack.com/form)** (`@tanstack/react-form`) – Headless type-safe form management
- **[Zod v4](https://zod.dev/)** – Schema validation and type inference

### 🗄️ Database, ORM & Auth
- **[PostgreSQL](https://www.postgresql.org/)** – Relational database engine
- **[Drizzle ORM](https://orm.drizzle.team/)** – TypeScript-first ORM for database schema management and queries
- **[Better-Auth](https://www.better-auth.com/)** – Complete authentication solution

### 🎨 Styling & UI Components
- **[TailwindCSS v4](https://tailwindcss.com/)** – Utility-first CSS framework with `@tailwindcss/postcss`
- **[shadcn/ui](https://ui.shadcn.com/) / Base UI** – Accessible, customizable shared component primitives (`packages/ui`)
- **[Lucide React](https://lucide.dev/)** – Icon library
- **[Sonner](https://sonner.emilkowal.ski/)** – Toast notification system

### 🏗️ Build, Tooling & Monorepo
- **[Turborepo](https://turbo.build/repo)** – High-performance build system for JavaScript/TypeScript monorepos
- **[Bun](https://bun.sh/)** – Package manager and fast JavaScript runtime
- **[Biome](https://biomejs.dev/)** – Fast formatting and linting tool

---

## 📂 Project Architecture

```text
nextjs-starter/
├── apps/
│   └── web/                # Main Next.js application (Chat, Datasources, Dashboard, Mastra agents)
├── packages/
│   ├── api/                # tRPC API routers, context, & datasource service logic
│   ├── auth/               # Better-Auth configuration and session handling
│   ├── config/             # Shared TypeScript, Biome, and Tailwind configurations
│   ├── db/                 # Drizzle ORM schemas, migrations, & database client initialization
│   ├── env/                # Environment variable schemas and validation
│   └── ui/                 # Shared shadcn/ui components, design system, & global styles
└── spec/                   # Database schemas and design documentation
```

---

## 🚦 Getting Started

### Prerequisites

- **[Bun](https://bun.sh/)** (v1.3.1 or higher)
- **[Node.js](https://nodejs.org/)** (v20 or higher)
- **[PostgreSQL](https://www.postgresql.org/)** database instance

### 1. Installation

Install all project workspace dependencies using Bun:

```bash
bun install
```

### 2. Environment Variables

Create and configure `.env` files in `apps/web/.env` (and root if needed):

```env
DATABASE_URL=postgres://user:password@localhost:5432/ask_your_db
BETTER_AUTH_SECRET=your_auth_secret_here
BETTER_AUTH_URL=http://localhost:3001
OPENAI_API_KEY=your_openai_api_key
```

### 3. Database Setup

Push the Drizzle schema to your PostgreSQL database:

```bash
bun run db:push
```

*(Optional)* Seed sample analytics data for testing:

```bash
bun run db:seed-analytics
```

### 4. Running Development Server

Start the entire monorepo in development mode:

```bash
bun run dev
```

Or start only the Next.js web app:

```bash
bun run dev:web
```

Open [http://localhost:3001](http://localhost:3001) in your browser to access the application.

---

## 📜 Available Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start all applications and services in development mode |
| `bun run dev:web` | Start only the Next.js web application (`apps/web`) |
| `bun run build` | Build all workspace applications for production |
| `bun run check-types` | Run TypeScript type-checking across all workspaces |
| `bun run check` | Run Biome linting and code formatting checks |
| `bun run db:push` | Push database schema directly to PostgreSQL using Drizzle |
| `bun run db:generate` | Generate database migrations |
| `bun run db:migrate` | Execute pending database migrations |
| `bun run db:studio` | Launch Drizzle Studio UI to inspect your database |
| `bun run db:seed-analytics` | Seed test analytics tables and data |

---

## 🎨 UI & Component System

Shared UI primitives are hosted in `packages/ui`. 

- **Global Styles**: Defined in `packages/ui/src/styles/globals.css`
- **Adding Shared Components**:
  ```bash
  npx shadcn@latest add <component-name> -c packages/ui
  ```
- **Importing Shared UI Components**:
  ```tsx
  import { Button } from "@nextjs-starter/ui/components/button";
  ```
