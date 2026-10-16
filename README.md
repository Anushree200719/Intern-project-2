# TaskBoard – Full-Stack Kanban Task Management System

TaskBoard is a modern, responsive, full-stack Kanban task and project management platform inspired by **Linear**, **Trello**, and **Jira**. Built with **Vanilla JavaScript (ES6+)**, **Node.js**, **Express.js**, and **SQLite3**, it demonstrates professional software engineering standards, database normalization, real HTML5 drag-and-drop, and security best practices.

---

## 🚀 Key Features

- **Authentication & Security**:
  - Secure registration and login with input validation.
  - Password hashing with **bcrypt** (10 salt rounds).
  - Stateless **JWT** authentication with 7-day expiration.
  - Role-based authorization: **Board Owner** vs. **Board Member** vs. **Non-member**.
  - Author-only comment deletion and SQL injection prevention via parameterized queries.
- **Kanban Board & Workflow**:
  - Horizontally scrollable board with customizable columns.
  - Automatic creation of default columns: `To Do`, `In Progress`, `Done`.
  - Column CRUD with safety confirmation for columns containing tasks.
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
| **Testing** | Node.js Automated Integration Suite | 12 end-to-end integration tests verifying all CRUD and authorization boundaries |

---

## 📂 Project Directory Structure

```
Mayur CEP/
├── server/
│   ├── app.js               # Main Express application & middleware configuration
│   ├── db.js                # SQLite database connection & schema bootstrap
│   ├── seed.js              # Database seed runner script
│   ├── schema.sql           # Normalized SQLite schema with foreign keys and indexes
│   ├── routes/
│   │   ├── auth.js          # /api/auth (register, login, me, user lookup)
│   │   ├── boards.js        # /api/boards (CRUD, members, search, activity)
│   │   ├── columns.js       # /api/columns (update, delete with safety checks)
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
├── test_api.js              # Automated 12-point API integration test suite
├── package.json             # NPM project manifest and dependencies
├── .env.example             # Template for environment configuration
├── .env                     # Local environment settings
├── .gitignore               # Excludes node_modules, data/*.db, .env
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

### 3. Seed the Database
Initialize the SQLite database with development sample data:
```bash
npm run seed
```

### 4. Start the Application
Start the server in development mode:
```bash
npm start
```
The server will start on: **`http://localhost:3000`**

Open your web browser and navigate to:
- **`http://localhost:3000/login.html`** or **`http://localhost:3000/dashboard.html`**

---

## 🔑 Sample Development Login Credentials

For quick evaluation during viva demonstrations, the login page features one-click quick-fill buttons for these sample accounts:

| Name | Role | Email | Password |
| :--- | :--- | :--- | :--- |
| **Alex Morgan** | Board Owner / Lead | `alex@taskboard.local` | `password123` |
| **Sam Taylor** | Full Stack Engineer | `sam@taskboard.local` | `password123` |
| **Jordan Lee** | UI/UX Designer & QA | `jordan@taskboard.local` | `password123` |

*All passwords are encrypted with bcrypt inside `taskboard.db`.*

---

## 🧪 Automated Testing & Verification

TaskBoard includes an automated backend integration test suite verifying authentication, board CRUD, permissions, drag-and-drop move transactions, comments, and author-only protections:

```bash
node test_api.js
```

### Expected Output:
```
--- 1. Testing Health Check ---
✔ Health check OK
--- 2. Testing Login ---
✔ Alex login OK, token received
--- 3. Testing Registration ---
✔ Registration OK, token received
--- 4. Testing Board Retrieval ---
✔ Boards retrieved: 1 board(s). First: "Sprint 14 - Web App Launch"
--- 5. Testing Board Details & Columns ---
✔ Board detail OK, columns count: 3 (names: To Do, In Progress, Done)
--- 6. Testing Task Creation in Column 1 ---
✔ Task created with ID 9: "Automated Test Task 1" at position 3
--- 7. Testing Comment Creation ---
✔ Comment created with ID 5
--- 8. Testing Authorization Enforcement (Non-member blocked) ---
✔ Non-member correctly blocked with 403 Forbidden
--- 9. Testing Task Movement & Transactional Reordering ---
✔ Task successfully moved to column "In Progress" at position 0
--- 10. Testing Search & Filters ---
✔ Search and filters working accurately (found matching task)
--- 11. Testing Comment Deletion (Author Allowed) ---
✔ Comment successfully deleted by author
--- 12. Testing Task Deletion ---
✔ Task successfully deleted

=======================================
ALL 12 BACKEND INTEGRATION TESTS PASSED!
=======================================
```

---

## 📊 Evaluation Criteria Alignment

| Area | Marks | Implementation Summary |
| :--- | :---: | :--- |
| **Database Design** | **15** | 7 normalized tables, foreign keys with cascading actions, unique constraints, and WAL mode. |
| **Backend APIs** | **20** | Clean REST conventions, comprehensive input validation, parameterized SQL, and error handling. |
| **Authentication** | **5** | bcrypt hashing, JWT issuance and verification, route guards, and session persistence. |
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
