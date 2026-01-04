# ACE Prep

Google Cloud certification preparation application with AI-powered question generation and spaced repetition. Supports multiple certifications including Associate Cloud Engineer (ACE) and Professional Cloud Architect (PCA).

## Features

- **Multi-Certification Support** - Switch between ACE and PCA certifications
- **Practice Exams** - Full 50-question timed exams matching real certification formats
- **AI Question Generation** - Generate unlimited practice questions via Claude or GPT-4
- **Progress Tracking** - Track performance by domain and certification, identify weak areas
- **Spaced Repetition** - SM-2 algorithm schedules reviews for missed questions
- **Study Hub** - Learning path breakdown with explanations for each topic
- **Exam Review** - Detailed explanations for every question

## Prerequisites

- Node.js 18+
- npm 9+
- Anthropic or OpenAI API key (for question generation)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Initialize Database

```bash
npm run db:setup
```

This creates the SQLite database and seeds it with:
- ACE and PCA certifications
- Certification-specific domains and topics
- 10 sample questions

### 3. Start the Application

**Option A: Start both servers together**
```bash
npm run dev
```

**Option B: Start separately (two terminals)**
```bash
# Terminal 1 - API Server
npm run dev:server

# Terminal 2 - Frontend
npm run dev:client
```

### 4. Open the App

Navigate to **http://localhost:5173**

### 5. Configure API Key

1. Go to **Settings**
2. Select your LLM provider (Anthropic or OpenAI)
3. Enter your API key
4. Click "Test & Save API Key"
5. Click "Generate 50 Questions" to populate the question bank

## Project Structure

```
ace-prep/
├── packages/
│   ├── client/          # React + TypeScript + Vite frontend
│   │   ├── src/
│   │   │   ├── components/   # React components
│   │   │   ├── stores/       # Zustand state management
│   │   │   ├── api/          # API client
│   │   │   └── styles/       # Global CSS
│   │   └── vite.config.ts
│   │
│   ├── server/          # Fastify + SQLite backend
│   │   ├── src/
│   │   │   ├── routes/       # API endpoints
│   │   │   ├── services/     # LLM integration, spaced repetition
│   │   │   └── db/           # Drizzle schema, migrations
│   │   └── drizzle.config.ts
│   │
│   └── shared/          # Shared TypeScript types
│
├── data/                # SQLite database (gitignored)
└── package.json         # npm workspaces root
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Zustand, TanStack Query |
| Backend | Fastify, Drizzle ORM, better-sqlite3 |
| AI | Anthropic Claude / OpenAI GPT-4 |
| Styling | CSS Modules, CSS Variables |

## Available Scripts

```bash
# Development
npm run dev              # Start both client and server
npm run dev:server       # Start API server only (port 3001)
npm run dev:client       # Start frontend only (port 5173)

# Database
npm run db:setup         # Create tables and seed data
npm run db:generate      # Generate Drizzle migrations
npm run db:add-pca       # Add PCA certification data

# Build
npm run build            # Build all packages for production
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/certifications` | List available certifications |
| GET | `/api/exams` | List all exams |
| POST | `/api/exams` | Start new exam |
| GET | `/api/exams/:id` | Get exam with questions |
| PATCH | `/api/exams/:id/answer` | Submit answer |
| PATCH | `/api/exams/:id/complete` | Complete exam |
| GET | `/api/exams/:id/review` | Get exam review |
| GET | `/api/questions` | List questions |
| POST | `/api/questions/generate` | Generate questions via AI |
| GET | `/api/progress/dashboard` | Dashboard stats |
| GET | `/api/study/domains` | Exam domains |
| GET | `/api/study/learning-path` | Learning path |

## Certification Coverage

### Associate Cloud Engineer (ACE) - 5 Domains

1. **Setting Up a Cloud Solution Environment** (~17.5%)
2. **Planning and Configuring a Cloud Solution** (~17.5%)
3. **Deploying and Implementing a Cloud Solution** (~25%)
4. **Ensuring Successful Operation** (~20%)
5. **Configuring Access and Security** (~20%)

### Professional Cloud Architect (PCA) - 6 Domains

1. **Designing and Planning** (~24%)
2. **Managing and Provisioning** (~15%)
3. **Security and Compliance** (~18%)
4. **Technical & Business Process Analysis** (~17%)
5. **Managing Implementation** (~13%)
6. **Ensuring Solution & Operations Reliability** (~13%)

## License

MIT
