# TaskBoard – Full-Stack Kanban Task Management System

TaskBoard is a modern, responsive, full-stack Kanban task and project management platform inspired by **Linear**, **Trello**, and **Jira**. Built with **Vanilla JavaScript (ES6+)**, **Node.js**, **Express.js**, and **SQLite3**, it demonstrates professional software engineering standards, database normalization, real HTML5 drag-and-drop, atomic transactional reordering, and security best practices.

---

## 🚀 Key Features

- **Authentication & Security**:
  - Secure registration and login with comprehensive input validation.
  - Password hashing with **bcrypt** (10 salt rounds).
  - Stateless **JWT** authentication with 7-day expiration and fail-safe startup validation (refuses to start if `JWT_SECRET` is missing or insecure).
  - Role-based authorization: **Board Owner** vs. **Board Member** vs. **Non-member**.
  - **Owner-Only Column Deletion**: Only board owners can delete columns (ordinary members receive `403 Forbidden`).
  - Author-only comment deletion and SQL injection prevention via 100% parameterized queries.
- **Kanban Board & Workflow**:
  - Horizontally scrollable board with customizable columns.
  - Automatic creation of default columns: `To Do`, `In Progress`, `Done`.
  - Column CRUD with safety confirmation for columns containing tasks.
  - **Column Reordering**: Reorder columns left (`◀`) or right (`▶`) with persistent ordering persisted via atomic SQLite transactions (`PATCH /api/columns/:id/move`).
- **Real HTML5 Drag-and-Drop**:
  - Drag tasks between columns or reorder within the same column.
  - Active drop indicator lines and visual drop target feedback.
  - **Atomic Transaction Re-indexing**: Server calculates consecutive zero-indexed positions in a single SQLite transaction.
  - **Optimistic UI with Rollback**: Instant user feedback with automatic state rollback on network failure.
  - **Accessible Move Fallback**: Dedicated `"⇄ Move"` quick menu and dropdown for keyboard and mobile accessibility.
- **Task Management**:
  - Priority badges: **Low** (emerald), **Medium** (amber), **High** (rose).
  - **Red Overdue Indicator**: Automatically highlights tasks in red if the due date is in the past and the task is not in the final column (`Done`).
  - Assign tasks to existing board members only.
- **Task Comments**:
  - Real-time discussion thread inside each task.
  - Displays author avatar, name, and timestamp.
  - Ownership enforcement: users can only delete their own comments.
- **Search & Multi-Filter**:
  - Real-time search across task titles and descriptions.
  - Combinable filters: Priority, Assignee, and a quick `"My Tasks"` toggle.
- **Board Collaborators**:
  - Invite registered users by email address.
  - Manage member roles and permissions.
- **Audit Trail & Activity Log**:
  - Board-level activity logging tracking task creation, movements, comments, and member additions.
- **Dark Mode**:
  - Instant theme switching between Light Mode and Slate Dark Mode with persistent local storage.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | Vanilla JavaScript (ES6+), HTML5, CSS3 | Zero framework overhead, modular controllers, Fetch API, HTML5 Drag & Drop |
| **Styling** | Custom CSS3 Design System | Responsive SaaS design inspired by Linear & Trello, CSS variables, Dark/Light theme |
| **Backend** | Node.js & Express.js | High-performance JSON REST APIs, middleware pipeline |
| **Database** | SQLite3 (`better-sqlite3`) | Normalized relational schema, foreign keys enabled, WAL mode, atomic transactions |
| **Authentication** | `jsonwebtoken` & `bcryptjs` | Cryptographic password hashing and JWT authorization |
| **Testing** | Automated Integration Suite | 31 end-to-end integration tests using an isolated disposable database |

---

## 📂 Project Directory Structure

```
Mayur CEP/
├── server/
│   ├── app.js               # Main Express application, security validation & middleware
│   ├── db.js                # SQLite database connection & schema bootstrap
│   ├── seed.js              # Safe database seed runner (supports --reset flag)
│   ├── schema.sql           # Normalized SQLite schema with foreign keys and indexes
│   ├── routes/
│   │   ├── auth.js          # /api/auth (register, login, me, user lookup)
│   │   ├── boards.js        # /api/boards (CRUD, members, search, activity)
│   │   ├── columns.js       # /api/columns (update, owner delete, move reorder)
│   │   ├── tasks.js         # /api/tasks (CRUD, transactional move re-ordering)
│   │   └── comments.js      # /api/comments (create, author-only delete)
│   └── middleware/
│       └── auth.js          # JWT authentication and board RBAC middleware
├── public/
│   ├── index.html           # Root entry redirect
│   ├── login.html           # Login page with demo credentials quick-fill
│   ├── register.html        # User registration page with client validation
│   ├── dashboard.html       # Workspaces dashboard, stats, and board creator
│   ├── board.html           # Full Kanban board with drag-and-drop & modals
│   ├── css/
│   │   └── styles.css       # Design system tokens, components, responsive layout
│   └── js/
│       ├── api.js           # Centralized Fetch API wrapper & toast system
│       ├── auth.js          # Auth state, theme management, navbar helpers
│       ├── dashboard.js     # Dashboard board list & modal handlers
│       └── board.js         # Kanban canvas, drag-and-drop, modals, filters
├── data/
│   └── taskboard.db         # Persistent SQLite database file (WAL mode)
├── seed.sql                 # Sample users, boards, columns, tasks, comments, logs
├── test_api.js              # Automated 31-point API integration test suite
├── package.json             # NPM project manifest and dependencies
├── .env.example             # Template for environment configuration
├── .env                     # Local environment settings
├── .gitignore               # Excludes node_modules, data/*.db, .env, *.log
├── README.md                # Project documentation and setup guide
├── TECHNICAL_DOCUMENTATION.md # Architecture, ER diagram, and viva defense guide
└── TASK_ORDERING.md         # Detailed ordering algorithm and complexity analysis
```

---

## ⚡ Quick Start & Installation

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher.
- `npm` v9.0.0 or higher.

### 2. Install Dependencies
```bash
npm install
```

### 3. Seed Development Database
- **Safe Mode** (seeds only if database is empty, preserves existing data):
  ```bash
  npm run seed
  ```
- **Explicit Reset** (resets database to clean initial sample state):
  ```bash
  npm run seed:reset
  ```

### 4. Start the Application
```bash
npm start
```
The server will start on: **`http://localhost:3000`**

Open your web browser and navigate to:
- **`http://localhost:3000/login.html`** or **`http://localhost:3000/dashboard.html`**

---

## 🔑 Sample Development Login Credentials

For quick evaluation during viva demonstrations, the login page features one-click quick-fill buttons:

| Name | Role | Email | Password |
| :--- | :--- | :--- | :--- |
| **Alex Morgan** | Board Owner / Lead | `alex@taskboard.local` | `password123` |
| **Sam Taylor** | Full Stack Engineer | `sam@taskboard.local` | `password123` |
| **Jordan Lee** | UI/UX Designer & QA | `jordan@taskboard.local` | `password123` |

*All passwords are encrypted with bcrypt inside `taskboard.db`.*

---

## 🧪 Automated Testing & Verification

TaskBoard includes an automated backend integration test suite verifying authentication, board CRUD, permissions, column reordering, drag-and-drop move transactions, comments, and author-only protections. Tests execute against an **isolated disposable database** that never modifies your real application data:

```bash
npm test
```

### Test Results Summary:
```
--- 1. Authentication & Token Verification ---
• Health check returns 200 OK... ✅ PASS
• Successful login for seed owner (Alex Morgan)... ✅ PASS
• Successful login for seed member (Sam Taylor)... ✅ PASS
• Login rejection for incorrect password (401)... ✅ PASS
• Login rejection for non-existent user (401)... ✅ PASS
• Successful registration of a new user... ✅ PASS
• Duplicate registration rejection (400)... ✅ PASS
• Missing token rejection on protected route (401)... ✅ PASS
• Invalid / malformed token rejection (401)... ✅ PASS
• Expired token rejection (401)... ✅ PASS

--- 2. Role-Based Authorization & Permissions ---
• Non-member cannot access private board (403)... ✅ PASS
• Non-owner cannot rename board (403)... ✅ PASS
• Non-owner cannot delete board (403)... ✅ PASS
• Non-owner cannot invite members (403)... ✅ PASS
• Board owner can invite existing registered user (201)... ✅ PASS
• Inviting user not registered returns 404... ✅ PASS
• Ordinary member CANNOT delete column (403 Forbidden)... ✅ PASS
• Board owner can delete an empty column (200)... ✅ PASS
• Column deletion with tasks requires confirmation (?force=true)... ✅ PASS
• Task assignee must be a member of the board (400 if not)... ✅ PASS
• Only comment author can delete their comment (403 for other member, 200 for author)... ✅ PASS

--- 3. Column and Task Ordering Verification ---
• Column reordering: move column to new position... ✅ PASS
• Task move within same column updates positions in transaction... ✅ PASS
• Task move to different column updates both columns in transaction... ✅ PASS
• Reject task move to column belonging to another board (400)... ✅ PASS

--- 4. Data Validation and Error Handling ---
• Reject task with invalid priority (400)... ✅ PASS
• Reject task with invalid due date format (400)... ✅ PASS
• Reject task creation with empty title (400)... ✅ PASS
• Reject comment creation with empty content (400)... ✅ PASS
• Reject task move with negative position (400)... ✅ PASS
• Reject column move with negative position (400)... ✅ PASS

======================================================
 Test Execution Completed: 31 Passed, 0 Failed
======================================================
```

---

## 📊 Evaluation Criteria Alignment

| Area | Marks | Implementation Summary |
| :--- | :---: | :--- |
| **Database Design** | **15** | 7 normalized tables, foreign keys with cascading actions, unique constraints, and WAL mode. |
| **Backend APIs** | **20** | Clean REST conventions, comprehensive input validation, parameterized SQL, and error handling. |
| **Authentication** | **5** | bcrypt hashing, fail-safe JWT validation, route guards, and session persistence. |
| **Frontend Functionality** | **25** | HTML5 Drag & Drop, optimistic UI with rollback, task CRUD, comments, filters, and modals. |
| **UI Design & Responsiveness**| **10** | SaaS dashboard aesthetics, dark/light theme, overdue alerts, and mobile compatibility. |
| **Code Quality & Architecture**| **20** | Modular ES6+ JavaScript, layered Express backend, automated tests, clean gitignore. |
| **Documentation** | **5** | Detailed `README.md`, `TECHNICAL_DOCUMENTATION.md`, and `TASK_ORDERING.md`. |

---

## 📄 Documentation Links
- [Technical Architecture & API Documentation](TECHNICAL_DOCUMENTATION.md)
- [Task Ordering & Algorithmic Design](TASK_ORDERING.md)
- [Database Schema (SQL)](server/schema.sql)
- [Database Seed Script (SQL)](seed.sql)
