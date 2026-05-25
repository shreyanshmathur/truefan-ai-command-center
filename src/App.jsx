import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  CreditCard,
  Download,
  FileText,
  Filter,
  FolderKanban,
  FolderPlus,
  Gauge,
  LayoutDashboard,
  LineChart,
  ListChecks,
  LogOut,
  Mail,
  MessageSquare,
  Paperclip,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Upload,
  UserCog,
  Users
} from "lucide-react";
import logoUrl from "../truefan_ai_logo_1740991244975.jpg";
import {
  buildSeedData,
  escalationTypes,
  languages,
  notificationRules,
  projectTypes,
  roleCredentials,
  roleLabels,
  taskStatuses,
  timelineItems
} from "./data";

const STORAGE_KEY = "truefan-command-center-store-v7-excel-scrum-flow";
const SESSION_KEY = "truefan-command-center-session-v2-login";
const dayMs = 24 * 60 * 60 * 1000;

const navItems = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, roles: ["sales", "delivery", "finance", "admin"] },
  { id: "sales", label: "Sales Dashboard", icon: BarChart3, roles: ["sales", "admin"] },
  { id: "create-project", label: "Project Creation", icon: FolderPlus, roles: ["sales", "admin"] },
  { id: "create-sample", label: "Sample Creation", icon: Sparkles, roles: ["sales", "admin"] },
  { id: "projects", label: "Project Detail", icon: FolderKanban, roles: ["sales", "delivery", "finance", "admin"] },
  { id: "delivery-board", label: "Delivery Task Board", icon: ClipboardList, roles: ["delivery", "admin"] },
  { id: "scrum", label: "Daily Scrum", icon: ListChecks, roles: ["delivery", "admin"] },
  { id: "timeline", label: "Timeline Builder", icon: CalendarDays, roles: ["delivery", "admin"] },
  { id: "gantt", label: "Gantt Timeline", icon: LineChart, roles: ["delivery", "admin"] },
  { id: "status-logs", label: "Status Logs", icon: FileText, roles: ["sales", "delivery", "admin"] },
  { id: "escalations", label: "Escalations", icon: AlertTriangle, roles: ["sales", "admin"] },
  { id: "finance", label: "Finance Dashboard", icon: CreditCard, roles: ["finance", "admin"] },
  { id: "team", label: "Team Bandwidth", icon: Users, roles: ["delivery", "admin"] },
  { id: "admin", label: "Admin Panel", icon: Settings, roles: ["admin"] },
  { id: "activity", label: "Activity Log", icon: Activity, roles: ["admin"] }
];

const dateInputDefault = (offset = 7) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

function dateOnly(dateLike) {
  if (!dateLike) return null;
  const date = typeof dateLike === "string" ? new Date(`${dateLike.slice(0, 10)}T00:00:00`) : new Date(dateLike);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(a, b) {
  const start = dateOnly(a);
  const end = dateOnly(b);
  if (!start || !end) return 0;
  return Math.round((end - start) / dayMs);
}

function isOverdue(date, status) {
  return status !== "completed" && daysBetween(date, new Date()) > 0;
}

function isLiveProject(project) {
  return project?.projectType === "Project" && (project.isLive || project.status === "active");
}

function isOpenWorkItem(project) {
  return project?.status !== "completed";
}

function formatDate(value) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(dateOnly(value));
}

function formatDateTime(value) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatMoney(value = 0) {
  if (value >= 10000000) {
    return `INR ${(value / 10000000).toFixed(1)} Cr`;
  }
  return `INR ${(value / 100000).toFixed(1)} L`;
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function getUser(store, id) {
  return store.users.find((user) => user.id === id);
}

function userName(store, id) {
  return getUser(store, id)?.name || "Unassigned";
}

function statusLabel(status) {
  return taskStatuses.find((item) => item.id === status)?.label || titleCase(status || "unknown");
}

function titleCase(value = "") {
  return value
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getProject(store, id) {
  return store.projects.find((project) => project.id === id);
}

function isDeliveryReady(project) {
  return isOpenWorkItem(project) && project.sowStatus !== "missing" && project.poStatus !== "missing";
}

function findDeliveryConflicts(store, selectedDate, projectId = null, windowDays = 2) {
  if (!selectedDate) return [];
  const projectConflicts = store.projects
    .filter((project) => project.id !== projectId && isOpenWorkItem(project))
    .filter((project) => Math.abs(daysBetween(selectedDate, project.expectedDeliveryDate)) <= windowDays)
    .map((project) => ({
      id: `project-${project.id}`,
      type: "Project",
      label: `${project.clientName} - ${project.projectName}`,
      date: project.expectedDeliveryDate,
      owner: userName(store, project.deliveryManagerId)
    }));

  const taskConflicts = store.tasks
    .filter((task) => Math.abs(daysBetween(selectedDate, task.endDate)) <= windowDays && task.status !== "completed")
    .map((task) => ({
      id: `task-${task.id}`,
      type: "Task",
      label: `${getProject(store, task.projectId)?.clientName || "Project"} - ${task.title}`,
      date: task.endDate,
      owner: userName(store, task.ownerId)
    }));

  return [...projectConflicts, ...taskConflicts].sort((a, b) => daysBetween(a.date, b.date));
}

function calculateHealth(project, store) {
  let score = 100;
  const reasons = [];
  const tasks = store.tasks.filter((task) => task.projectId === project.id);
  const escalations = store.escalations.filter((item) => item.projectId === project.id);
  const logs = store.statusLogs.filter((log) => log.projectId === project.id);
  const hasOverdueTask = tasks.some((task) => isOverdue(task.endDate, task.status));
  const hasOpenEscalation = escalations.some((item) => item.status !== "resolved");
  const hasConflict = project.deliveryConflict || findDeliveryConflicts(store, project.expectedDeliveryDate, project.id, 1).some((item) => item.type === "Project");
  const latestLog = logs
    .map((log) => log.date)
    .sort((a, b) => daysBetween(a, b))
    .at(-1);

  if (project.sowStatus !== "uploaded") {
    score -= 20;
    reasons.push("SOW missing or flagged");
  }
  if (project.poStatus !== "received") {
    score -= 20;
    reasons.push("PO missing or pending");
  }
  if (hasOverdueTask) {
    score -= 15;
    reasons.push("Task overdue");
  }
  if (hasOpenEscalation) {
    score -= 25;
    reasons.push("Open escalation");
  }
  if (hasConflict) {
    score -= 10;
    reasons.push("Delivery date conflict");
  }
  if (!latestLog || daysBetween(latestLog, new Date()) > 3) {
    score -= 10;
    reasons.push("No status update in 3 days");
  }

  const finalScore = Math.max(0, Math.min(100, score));
  return {
    score: finalScore,
    label: finalScore >= 80 ? "Healthy" : finalScore >= 60 ? "Watch" : "At Risk",
    reasons
  };
}

function getAccessibleProjects(store, role, userId) {
  if (role === "admin") return store.projects;
  if (role === "sales") {
    return store.projects.filter((project) => getUser(store, project.salespersonId)?.role === "sales");
  }
  if (role === "delivery") {
    return store.projects.filter(isDeliveryReady);
  }
  if (role === "finance") {
    return store.projects.filter((project) => ["active", "completed"].includes(project.status));
  }
  return [];
}

function getAccessibleSamples(store, role) {
  if (role === "admin") return store.samples;
  if (role === "sales") return store.samples;
  if (role === "delivery") return store.samples.filter((sample) => sample.status !== "draft");
  return [];
}

function sampleCreditsFor(store, salespersonId) {
  const used = store.samples.filter((sample) => sample.salespersonId === salespersonId).length;
  return { used, total: 50, remaining: Math.max(0, 50 - used) };
}

function getProjectTasks(store, projectIds) {
  const set = new Set(projectIds);
  return store.tasks.filter((task) => set.has(task.projectId));
}

function getProjectFinance(store, projectId) {
  return store.financeRecords.find((record) => record.projectId === projectId);
}

function normalizeStore(rawStore) {
  const seedStore = buildSeedData();
  const users = [...(rawStore.users || [])];
  seedStore.users.forEach((seedUser) => {
    if (!users.some((user) => user.id === seedUser.id)) {
      users.push(seedUser);
    }
  });

  return {
    ...rawStore,
    users,
    scrumNotes: rawStore.scrumNotes || [],
    scrumAssignments: rawStore.scrumAssignments || [],
    notifications: (rawStore.notifications || []).map((item) => ({
      targetRoles: item.targetRoles || [],
      targetUsers: item.targetUsers || [],
      readBy: item.readBy || [],
      ...item
    }))
  };
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadExcel(filename, sheets) {
  const worksheets = sheets.map((sheet) => {
    const safeName = xmlEscape(String(sheet.name || "Sheet").replace(/[\\/?*:[\]]/g, " ").slice(0, 31));
    const rows = sheet.rows || [];
    const table = rows.map((row) => (
      `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${xmlEscape(cell)}</Data></Cell>`).join("")}</Row>`
    )).join("");

    return `<Worksheet ss:Name="${safeName}"><Table>${table}</Table></Worksheet>`;
  }).join("");
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  ${worksheets}
</Workbook>`;
  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function projectExcelRows(store, projects) {
  return [
    ["Company", "Project", "Type", "Status", "Health", "Delivery manager", "Expected delivery", "SOW", "PO", "Revenue", "Notes"],
    ...projects.map((project) => {
      const health = calculateHealth(project, store);
      return [
        project.clientName,
        project.projectName,
        project.projectType,
        isLiveProject(project) ? "Live active" : titleCase(project.status),
        `${health.score} - ${health.label}`,
        userName(store, project.deliveryManagerId),
        project.expectedDeliveryDate,
        project.sowStatus,
        project.poStatus,
        project.revenue,
        project.notes
      ];
    })
  ];
}

function taskExcelRows(store, tasks) {
  return [
    ["Company", "Project", "Task", "Owner", "Start date", "End date", "Status", "Notes"],
    ...tasks.map((task) => {
      const project = getProject(store, task.projectId);
      return [
        project?.clientName,
        project?.projectName,
        task.title,
        userName(store, task.ownerId),
        task.startDate,
        task.endDate,
        statusLabel(task.status),
        task.notes
      ];
    })
  ];
}

function timelineExcelRows(store, rows) {
  return [
    ["Company", "Project", "Timeline item", "Owner", "Start date", "End date", "Status", "Notes"],
    ...rows.map((row) => {
      const project = getProject(store, row.projectId);
      return [
        project?.clientName,
        project?.projectName,
        row.item,
        userName(store, row.ownerId),
        row.startDate,
        row.endDate,
        statusLabel(row.status),
        row.notes
      ];
    })
  ];
}

function scrumExcelRows(store, notes, assignments) {
  return {
    notes: [
      ["Date", "Company", "Project", "Team", "DM", "Lead", "Priority", "Deadline", "Status", "Context"],
      ...notes.map((note) => {
        const project = getProject(store, note.projectId);
        return [
          note.date,
          project?.clientName,
          project?.projectName,
          note.team,
          userName(store, note.dmId),
          userName(store, note.headEditorId),
          note.priority,
          note.deadline,
          titleCase(note.status),
          note.note
        ];
      })
    ],
    assignments: [
      ["Assigned at", "Company", "Project", "Team", "DM", "Lead", "Editor", "Deadline", "Priority", "Status", "Context"],
      ...assignments.map((assignment) => {
        const project = getProject(store, assignment.projectId);
        return [
          assignment.createdAt,
          project?.clientName,
          project?.projectName,
          assignment.team,
          userName(store, assignment.dmId),
          userName(store, assignment.leadId),
          userName(store, assignment.assigneeId),
          assignment.deadline,
          assignment.priority,
          titleCase(assignment.status),
          assignment.context
        ];
      })
    ]
  };
}

function financeExcelRows(store, records) {
  return [
    ["Company", "Project", "Revenue booked", "PO status", "Invoice status", "Payment status", "Pending amount", "PO file", "Invoice file"],
    ...records.map((record) => {
      const project = getProject(store, record.projectId);
      return [
        project?.clientName,
        project?.projectName,
        record.revenueBooked,
        record.poStatus,
        record.invoiceStatus,
        record.paymentStatus,
        record.pendingAmount,
        record.poFile,
        record.invoiceFile
      ];
    })
  ];
}

function bandwidthExcelRows(rows) {
  return [
    ["Name", "Role", "Team", "Active live projects", "Active samples", "Active tasks", "Overdue tasks", "Upcoming deadlines", "Bandwidth score", "Workload"],
    ...rows.map((row) => [
      row.user.name,
      row.user.title,
      row.user.team,
      row.activeProjects,
      row.activeSamples,
      row.activeTasks,
      row.overdueTasks,
      row.upcomingDeadlines,
      row.score,
      row.workloadStatus
    ])
  ];
}

function App() {
  const [store, setStore] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return normalizeStore(saved ? JSON.parse(saved) : buildSeedData());
  });
  const [session, setSession] = useState(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [page, setPage] = useState("overview");
  const [selectedProjectId, setSelectedProjectId] = useState(store.projects[0]?.id);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  useEffect(() => {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const allowed = navItems.filter((item) => item.roles.includes(session.role)).map((item) => item.id);
    if (!allowed.includes(page)) {
      setPage(allowed[0] || "overview");
    }
  }, [page, session]);

  const addActivity = (actorId, action, entity) => {
    setStore((current) => ({
      ...current,
      activityLogs: [
        { id: makeId("a"), actorId, action, entity, createdAt: new Date().toISOString() },
        ...current.activityLogs
      ]
    }));
  };

  const addNotification = (notification) => {
    setStore((current) => ({
      ...current,
      notifications: [
        {
          id: makeId("n"),
          createdAt: new Date().toISOString(),
          priority: "medium",
          targetRoles: [],
          targetUsers: [],
          readBy: [],
          ...notification
        },
        ...current.notifications
      ]
    }));
  };

  const loginAs = (role) => {
    const user = store.users.find((item) => item.role === role) || store.users.find((item) => item.role === "admin");
    setSession({ role, userId: user.id });
    setPage("overview");
  };

  const logout = () => {
    setSession(null);
    setShowNotifications(false);
  };

  if (!session) {
    return <LoginPage store={store} onLogin={loginAs} />;
  }

  const currentUser = getUser(store, session.userId);
  const allowedNav = navItems.filter((item) => item.roles.includes(session.role));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage("overview")} type="button">
          <img src={logoUrl} alt="TrueFan AI" />
          <span>Command Center</span>
        </button>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {allowedNav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={page === item.id ? "nav-item active" : "nav-item"} onClick={() => setPage(item.id)} type="button">
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="eyebrow">Logged in as</span>
          <strong>{roleLabels[session.role]}</strong>
          <small>{currentUser?.name}</small>
        </div>
      </aside>

      <main className="main-shell">
        <Topbar
          page={page}
          session={session}
          currentUser={currentUser}
          store={store}
          showNotifications={showNotifications}
          setShowNotifications={setShowNotifications}
          setStore={setStore}
          logout={logout}
        />
        <section className="content-area">
          <PageRouter
            page={page}
            setPage={setPage}
            store={store}
            setStore={setStore}
            session={session}
            selectedProjectId={selectedProjectId}
            setSelectedProjectId={setSelectedProjectId}
            addActivity={addActivity}
            addNotification={addNotification}
          />
        </section>
      </main>
    </div>
  );
}

function LoginPage({ store, onLogin }) {
  const [selectedRole, setSelectedRole] = useState("sales");
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const loginCards = [
    { role: "sales", icon: BriefcaseBusiness, description: "Create projects, samples, escalations, and track delivery commitments." },
    { role: "delivery", icon: ClipboardList, description: "Manage delivery tasks, timelines, proof links, and bandwidth." },
    { role: "finance", icon: CreditCard, description: "Track revenue, PO status, invoices, payment status, and pending amounts." },
    { role: "admin", icon: Shield, description: "Control all data, role permissions, HubSpot sync, and notification rules." }
  ];

  const selectedCredentials = roleCredentials[selectedRole];
  const fillCredentials = () => {
    setCredentials(selectedCredentials);
    setError("");
  };
  const submitLogin = (event) => {
    event.preventDefault();
    if (
      credentials.username.trim().toLowerCase() === selectedCredentials.username.toLowerCase()
      && credentials.password === selectedCredentials.password
    ) {
      onLogin(selectedRole);
      return;
    }
    setError(`Use the fixed ${roleLabels[selectedRole]} section username and password.`);
  };

  return (
    <div className="login-screen">
      <section className="login-panel">
        <div className="login-brand">
          <img src={logoUrl} alt="TrueFan AI" />
          <div>
            <p className="eyebrow">Internal operations</p>
            <h1>TrueFan AI Command Center</h1>
            <p>Sales, Delivery, Finance, and Admin teams in one daily operating system.</p>
          </div>
        </div>

        <div className="login-grid">
          {loginCards.map((card) => {
            const Icon = card.icon;
            const defaultUser = store.users.find((user) => user.role === card.role);
            return (
              <button
                className={selectedRole === card.role ? "login-card active" : "login-card"}
                key={card.role}
                onClick={() => {
                  setSelectedRole(card.role);
                  setCredentials({ username: "", password: "" });
                  setError("");
                }}
                type="button"
              >
                <span className="login-icon">
                  <Icon size={22} />
                </span>
                <strong>{roleLabels[card.role]} login</strong>
                <small>{defaultUser?.name}</small>
                <p>{card.description}</p>
              </button>
            );
          })}
        </div>

        <form className="login-form" onSubmit={submitLogin}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">{roleLabels[selectedRole]} section</p>
              <h3>Sign in with fixed credentials</h3>
            </div>
            <button className="soft-button" type="button" onClick={fillCredentials}>
              <Shield size={16} />
              Fill demo login
            </button>
          </div>
          <div className="login-fields">
            <label className="field">
              <span>Username</span>
              <input
                value={credentials.username}
                onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))}
                placeholder={selectedCredentials.username}
                autoComplete="username"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={credentials.password}
                onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
                placeholder={selectedCredentials.password}
                autoComplete="current-password"
              />
            </label>
            <button className="primary-button" type="submit">
              Login to {roleLabels[selectedRole]}
            </button>
          </div>
          <div className="credential-strip">
            <strong>Fixed login:</strong>
            <span>{selectedCredentials.username}</span>
            <span>{selectedCredentials.password}</span>
          </div>
          {error && <p className="form-error">{error}</p>}
        </form>
      </section>

      <aside className="login-side">
        <div className="login-stat">
          <span>Live project health</span>
          <strong>{store.projects.filter((project) => isLiveProject(project) && calculateHealth(project, store).label === "At Risk").length} at risk</strong>
        </div>
        <div className="login-stat">
          <span>Revenue booked</span>
          <strong>{formatMoney(store.financeRecords.reduce((sum, record) => sum + record.revenueBooked, 0))}</strong>
        </div>
        <div className="login-stat">
          <span>Delivery workload</span>
          <strong>{store.tasks.filter((task) => task.status !== "completed").length} open tasks</strong>
        </div>
      </aside>
    </div>
  );
}

function Topbar({ page, session, currentUser, store, showNotifications, setShowNotifications, setStore, logout }) {
  const canSeeNotification = (item) => {
    if (session.role === "admin") return true;
    const targetUsers = item.targetUsers || [];
    const targetRoles = item.targetRoles || [];
    return targetUsers.includes(session.userId) || targetRoles.includes(session.role);
  };
  const visibleNotifications = store.notifications.filter(canSeeNotification);
  const unread = visibleNotifications.filter((item) => !item.readBy.includes(session.userId)).length;

  const markAllRead = () => {
    setStore((current) => ({
      ...current,
      notifications: current.notifications.map((item) =>
        canSeeNotification(item)
          ? { ...item, readBy: Array.from(new Set([...item.readBy, session.userId])) }
          : item
      )
    }));
  };

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{roleLabels[session.role]} workspace</p>
        <h2>{navItems.find((item) => item.id === page)?.label || "Command Center"}</h2>
      </div>
      <div className="topbar-actions">
        <div className="search-shell">
          <Search size={16} />
          <span>Search projects, clients, tasks</span>
        </div>
        <span className="role-pill">
          <UserCog size={15} />
          {currentUser?.name}
        </span>
        <div className="notification-wrap">
          <button className="icon-button" type="button" onClick={() => setShowNotifications(!showNotifications)} aria-label="Notifications">
            <Bell size={18} />
            {unread > 0 && <span className="count-badge">{unread}</span>}
          </button>
          {showNotifications && (
            <div className="notification-panel">
              <div className="panel-title">
                <strong>Notifications</strong>
                <button type="button" onClick={markAllRead}>Mark all read</button>
              </div>
              {visibleNotifications.length === 0 ? (
                <EmptyState title="No notifications" text="Your command center is clear." />
              ) : (
                visibleNotifications.slice(0, 8).map((item) => (
                  <article className={item.readBy.includes(session.userId) ? "notification read" : "notification"} key={item.id}>
                    <span className={`dot ${item.priority}`} />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                      <small>{formatDateTime(item.createdAt)}</small>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}
        </div>
        <button className="ghost-button" type="button" onClick={logout}>
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </header>
  );
}

function PageRouter(props) {
  const pages = {
    overview: <OverviewDashboard {...props} />,
    sales: <SalesDashboard {...props} />,
    "create-project": <ProjectCreationPage {...props} />,
    "create-sample": <SampleCreationPage {...props} />,
    projects: <ProjectsPage {...props} />,
    "delivery-board": <DeliveryTaskBoard {...props} />,
    scrum: <DailyScrumPage {...props} />,
    timeline: <TimelineBuilder {...props} />,
    gantt: <GanttTimelineView {...props} />,
    "status-logs": <StatusLogPage {...props} />,
    escalations: <EscalationPage {...props} />,
    finance: <FinanceDashboard {...props} />,
    team: <TeamBandwidthPage {...props} />,
    admin: <AdminPanel {...props} />,
    activity: <ActivityLogPage {...props} />
  };
  return pages[props.page] || pages.overview;
}

function OverviewDashboard({ store, session, setPage, setSelectedProjectId }) {
  const projects = getAccessibleProjects(store, session.role, session.userId);
  const projectIds = projects.map((project) => project.id);
  const tasks = getProjectTasks(store, projectIds);
  const samples = getAccessibleSamples(store, session.role);
  const finance = store.financeRecords.filter((record) => projectIds.includes(record.projectId));
  const health = projects.map((project) => ({ project, health: calculateHealth(project, store) }));
  const atRisk = health.filter((item) => item.health.label === "At Risk");
  const overdueTasks = tasks.filter((task) => isOverdue(task.endDate, task.status));
  const invoicesRaised = finance.filter((record) => record.invoiceStatus === "invoice raised").length;
  const pendingPayments = finance.reduce((sum, record) => sum + Number(record.pendingAmount || 0), 0);
  const recentEscalations = store.escalations
    .filter((item) => projectIds.includes(item.projectId))
    .slice()
    .sort((a, b) => daysBetween(b.createdDate, a.createdDate))
    .slice(0, 4);
  const recentUpdates = store.statusLogs
    .filter((log) => projectIds.includes(log.projectId))
    .slice()
    .sort((a, b) => daysBetween(b.date, a.date))
    .slice(0, 5);

  return (
    <div className="page-stack">
      <section className="metric-grid">
        <MetricCard label="Active projects" value={projects.filter(isLiveProject).length} icon={FolderKanban} />
        <MetricCard label="Active samples" value={samples.filter((sample) => sample.status !== "completed").length} icon={Sparkles} />
        <MetricCard label="Projects at risk" value={atRisk.length} icon={AlertTriangle} tone="danger" />
        <MetricCard label="Overdue tasks" value={overdueTasks.length} icon={Clock} tone="danger" />
        <MetricCard label="Revenue booked" value={formatMoney(finance.reduce((sum, record) => sum + record.revenueBooked, 0))} icon={CreditCard} />
        <MetricCard label="PO received" value={finance.filter((record) => record.poStatus === "received").length} icon={CheckCircle2} tone="success" />
        <MetricCard label="PO pending" value={finance.filter((record) => record.poStatus !== "received").length} icon={AlertTriangle} tone="warning" />
        <MetricCard label="Invoices raised" value={invoicesRaised} icon={FileText} />
        <MetricCard label="Pending payments" value={formatMoney(pendingPayments)} icon={CreditCard} tone="warning" />
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Command pulse</p>
              <h3>Team workload summary</h3>
            </div>
            <button className="soft-button" type="button" onClick={() => setPage("team")}>
              <Users size={16} />
              View bandwidth
            </button>
          </div>
          <BandwidthMini store={store} />
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Exceptions</p>
              <h3>Recent escalations</h3>
            </div>
          </div>
          {recentEscalations.length === 0 ? (
            <EmptyState title="No escalations" text="No open project risk surfaced for this role." />
          ) : (
            <div className="list-stack">
              {recentEscalations.map((item) => {
                const project = getProject(store, item.projectId);
                return (
                  <button
                    className="row-button"
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      setPage("projects");
                    }}
                  >
                    <span className={`severity ${item.severity.toLowerCase()}`}>{item.severity}</span>
                    <div>
                      <strong>{project?.clientName}</strong>
                      <small>{item.reason}</small>
                    </div>
                    <StatusBadge status={item.status} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Chronological status</p>
            <h3>Recent status updates</h3>
          </div>
          <button className="soft-button" type="button" onClick={() => setPage("status-logs")}>
            <MessageSquare size={16} />
            Open status logs
          </button>
        </div>
        <StatusTimeline store={store} logs={recentUpdates} />
      </section>
    </div>
  );
}

function SalesDashboard({ store, session, setPage, setSelectedProjectId }) {
  const salesUsers = store.users.filter((user) => user.role === "sales");
  const projects = getAccessibleProjects(store, "sales", session.userId);
  const warnings = projects.filter((project) => project.sowStatus !== "uploaded" || project.poStatus !== "received");
  const conflicts = projects.flatMap((project) => findDeliveryConflicts(store, project.expectedDeliveryDate, project.id, 1).map((conflict) => ({ project, conflict })));

  return (
    <div className="page-stack">
      <section className="metric-grid compact">
        {salesUsers.map((user) => {
          const credits = sampleCreditsFor(store, user.id);
          return (
            <MetricCard
              key={user.id}
              label={`${user.name} sample credits`}
              value={`${credits.remaining}/${credits.total}`}
              icon={Sparkles}
              detail={`${credits.used} samples created`}
            />
          );
        })}
        <MetricCard label="Commercial warnings" value={warnings.length} icon={AlertTriangle} tone="warning" />
        <MetricCard label="Date conflicts" value={conflicts.length} icon={CalendarDays} tone="warning" />
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Sales action center</p>
              <h3>Projects and samples created by Sales</h3>
            </div>
            <div className="button-row">
              <button className="primary-button" type="button" onClick={() => setPage("create-project")}>
                <Plus size={16} />
                New project
              </button>
              <button className="soft-button" type="button" onClick={() => setPage("create-sample")}>
                <Sparkles size={16} />
                New sample
              </button>
            </div>
          </div>
          <ProjectTable
            store={store}
            projects={projects}
            onOpen={(project) => {
              setSelectedProjectId(project.id);
              setPage("projects");
            }}
          />
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Before commitment</p>
              <h3>Warnings and conflicts</h3>
            </div>
          </div>
          <div className="list-stack">
            {warnings.map((project) => (
              <AlertRow key={project.id} icon={AlertTriangle} title={project.clientName} text={`${project.sowStatus !== "uploaded" ? "SOW missing. " : ""}${project.poStatus !== "received" ? "PO pending or missing." : ""}`} />
            ))}
            {conflicts.slice(0, 5).map(({ project, conflict }) => (
              <AlertRow key={`${project.id}-${conflict.id}`} icon={CalendarDays} title={`${project.clientName} conflict`} text={`${conflict.type} due ${formatDate(conflict.date)} with ${conflict.owner}`} />
            ))}
            {warnings.length === 0 && conflicts.length === 0 && <EmptyState title="No warnings" text="Sales commitments are commercially clean right now." />}
          </div>
        </div>
      </section>
    </div>
  );
}

function ProjectCreationPage({ store, setStore, session, setPage, setSelectedProjectId, addActivity, addNotification }) {
  const salesUsers = store.users.filter((user) => user.role === "sales");
  const deliveryUsers = store.users.filter((user) => user.role === "delivery");
  const [form, setForm] = useState({
    clientName: "",
    projectName: "",
    projectType: "Project",
    templateName: "",
    language: languages[0],
    salespersonId: session.role === "sales" ? session.userId : salesUsers[0]?.id,
    deliveryManagerId: deliveryUsers[0]?.id,
    expectedDeliveryDate: dateInputDefault(7),
    revenue: "",
    sowStatus: "missing",
    poStatus: "missing",
    notes: "",
    sowFile: "",
    poFile: ""
  });
  const conflicts = useMemo(() => findDeliveryConflicts(store, form.expectedDeliveryDate, null, 2), [store, form.expectedDeliveryDate]);
  const commercialWarning = form.sowStatus !== "uploaded" || form.poStatus !== "received";

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = (event) => {
    event.preventDefault();
    const id = makeId("p");
    const newProject = {
      id,
      clientName: form.clientName,
      projectName: form.projectName,
      projectType: form.projectType,
      templateName: form.templateName,
      language: form.language,
      salespersonId: form.salespersonId,
      deliveryManagerId: form.deliveryManagerId,
      expectedDeliveryDate: form.expectedDeliveryDate,
      revenue: Number(form.revenue || 0),
      sowStatus: form.sowStatus,
      poStatus: form.poStatus,
      notes: form.notes,
      status: "in-progress",
      createdAt: new Date().toISOString(),
      deliveryConflict: conflicts.length > 0
    };

    setStore((current) => ({
      ...current,
      projects: [newProject, ...current.projects],
      financeRecords: [
        {
          id: makeId("f"),
          projectId: id,
          revenueBooked: Number(form.revenue || 0),
          poStatus: form.poStatus,
          invoiceStatus: "not raised",
          paymentStatus: "payment pending",
          pendingAmount: Number(form.revenue || 0),
          poFile: form.poFile,
          invoiceFile: ""
        },
        ...current.financeRecords
      ],
      files: [
        ...current.files,
        ...(form.sowFile ? [{ id: makeId("file"), projectId: id, fileType: "SOW", name: form.sowFile, url: "", addedBy: session.userId, createdAt: new Date().toISOString() }] : []),
        ...(form.poFile ? [{ id: makeId("file"), projectId: id, fileType: "PO file", name: form.poFile, url: "", addedBy: session.userId, createdAt: new Date().toISOString() }] : [])
      ]
    }));

    addActivity(session.userId, "Created project", `${form.clientName} - ${form.projectName}`);
    addNotification({ title: "New project created", message: `${form.clientName} was created by Sales.`, targetRoles: ["sales", "delivery", "admin"], projectId: id, priority: "low" });
    if (form.sowStatus !== "uploaded") {
      addNotification({ title: "SOW missing", message: `${form.clientName} needs SOW before clean delivery flow.`, targetRoles: ["sales", "admin"], projectId: id, priority: "high" });
    }
    if (form.poStatus !== "received") {
      addNotification({ title: "PO missing", message: `${form.clientName} needs PO before clean delivery flow.`, targetRoles: ["sales", "finance", "admin"], projectId: id, priority: "high" });
    }
    if (conflicts.length > 0) {
      addNotification({ title: "Delivery date conflict", message: `${form.clientName} has ${conflicts.length} nearby delivery commitment(s).`, targetRoles: ["sales", "delivery", "admin"], projectId: id, priority: "medium" });
    }

    setSelectedProjectId(id);
    setPage("projects");
  };

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Sales intake</p>
            <h3>Create a new project</h3>
          </div>
          {commercialWarning && (
            <span className="inline-warning">
              <AlertTriangle size={16} />
              Project will be flagged until SOW and PO are complete.
            </span>
          )}
        </div>
        <form className="form-grid" onSubmit={submit}>
          <TextField label="Client name" value={form.clientName} onChange={(value) => setField("clientName", value)} required />
          <TextField label="Project name" value={form.projectName} onChange={(value) => setField("projectName", value)} required />
          <SelectField label="Project type" value={form.projectType} onChange={(value) => setField("projectType", value)} options={projectTypes} />
          <TextField label="Template name" value={form.templateName} onChange={(value) => setField("templateName", value)} required />
          <SelectField label="Language" value={form.language} onChange={(value) => setField("language", value)} options={languages} />
          <SelectField label="Salesperson" value={form.salespersonId} onChange={(value) => setField("salespersonId", value)} options={salesUsers.map((user) => ({ value: user.id, label: user.name }))} />
          <SelectField label="Delivery manager" value={form.deliveryManagerId} onChange={(value) => setField("deliveryManagerId", value)} options={deliveryUsers.map((user) => ({ value: user.id, label: user.name }))} />
          <TextField label="Expected delivery date" type="date" value={form.expectedDeliveryDate} onChange={(value) => setField("expectedDeliveryDate", value)} required />
          <TextField label="Revenue" type="number" value={form.revenue} onChange={(value) => setField("revenue", value)} required />
          <SelectField label="SOW" value={form.sowStatus} onChange={(value) => setField("sowStatus", value)} options={["uploaded", "missing", "flagged"]} />
          <SelectField label="PO status" value={form.poStatus} onChange={(value) => setField("poStatus", value)} options={["received", "pending", "missing", "flagged"]} />
          <FileField label="SOW file" onChange={(name) => setField("sowFile", name)} />
          <FileField label="PO file" onChange={(name) => setField("poFile", name)} />
          <label className="field full">
            <span>Notes</span>
            <textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} rows={4} />
          </label>

          {conflicts.length > 0 && (
            <div className="conflict-box full">
              <strong>Delivery date conflict warning</strong>
              <p>Existing work is due around {formatDate(form.expectedDeliveryDate)}. You can still proceed, but Delivery will see this as a health risk.</p>
              <div className="conflict-list">
                {conflicts.slice(0, 5).map((item) => (
                  <span key={item.id}>{item.type}: {item.label} on {formatDate(item.date)}</span>
                ))}
              </div>
            </div>
          )}

          <div className="form-actions full">
            <button className="primary-button" type="submit">
              <Plus size={16} />
              Create project
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function SampleCreationPage({ store, setStore, session, addActivity, addNotification }) {
  const salesUsers = store.users.filter((user) => user.role === "sales");
  const deliveryUsers = store.users.filter((user) => user.role === "delivery");
  const [form, setForm] = useState({
    clientName: "",
    sampleName: "",
    projectType: "Sample",
    templateName: "",
    language: languages[1],
    salespersonId: session.role === "sales" ? session.userId : salesUsers[0]?.id,
    deliveryManagerId: deliveryUsers[0]?.id,
    dueDate: dateInputDefault(4),
    notes: ""
  });
  const credits = sampleCreditsFor(store, form.salespersonId);
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = (event) => {
    event.preventDefault();
    if (credits.remaining <= 0) return;
    const sampleId = makeId("s");
    const projectId = `p-sample-${sampleId}`;
    const sample = {
      id: sampleId,
      ...form,
      status: "in-progress",
      createdAt: new Date().toISOString()
    };
    const sampleProject = {
      id: projectId,
      clientName: form.clientName,
      projectName: form.sampleName,
      projectType: "Sample",
      templateName: form.templateName,
      language: form.language,
      salespersonId: form.salespersonId,
      deliveryManagerId: form.deliveryManagerId,
      expectedDeliveryDate: form.dueDate,
      revenue: 0,
      sowStatus: "uploaded",
      poStatus: "received",
      notes: form.notes,
      status: "in-progress",
      createdAt: new Date().toISOString(),
      deliveryConflict: false,
      sampleId
    };
    const sampleTask = {
      id: makeId("t-sample"),
      projectId,
      title: "Sample delivery coordination",
      ownerId: form.deliveryManagerId,
      startDate: dateInputDefault(0),
      endDate: form.dueDate,
      status: "in-progress",
      notes: form.notes || "New sample created from Command Center."
    };
    setStore((current) => ({ ...current, samples: [sample, ...current.samples], projects: [sampleProject, ...current.projects], tasks: [sampleTask, ...current.tasks] }));
    addActivity(session.userId, "Created sample", `${form.clientName} - ${form.sampleName}`);
    addNotification({ title: "New sample created", message: `${form.sampleName} was created for ${form.clientName}.`, targetRoles: ["sales", "delivery", "admin"], projectId, priority: "low" });
    setForm((current) => ({ ...current, clientName: "", sampleName: "", templateName: "", notes: "" }));
  };

  return (
    <div className="page-stack">
      <section className="metric-grid compact">
        <MetricCard label="Available sample credits" value={credits.remaining} detail={`${credits.used} of 50 used`} icon={Sparkles} />
        <MetricCard label="Salesperson" value={userName(store, form.salespersonId)} icon={BriefcaseBusiness} />
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Sample intake</p>
            <h3>Create a new sample</h3>
          </div>
          {credits.remaining <= 0 && <span className="inline-warning"><AlertTriangle size={16} />No sample credits left.</span>}
        </div>
        <form className="form-grid" onSubmit={submit}>
          <TextField label="Client name" value={form.clientName} onChange={(value) => setField("clientName", value)} required />
          <TextField label="Sample name" value={form.sampleName} onChange={(value) => setField("sampleName", value)} required />
          <SelectField label="Project type" value={form.projectType} onChange={(value) => setField("projectType", value)} options={projectTypes} />
          <TextField label="Template name" value={form.templateName} onChange={(value) => setField("templateName", value)} required />
          <SelectField label="Language" value={form.language} onChange={(value) => setField("language", value)} options={languages} />
          <SelectField label="Salesperson" value={form.salespersonId} onChange={(value) => setField("salespersonId", value)} options={salesUsers.map((user) => ({ value: user.id, label: user.name }))} />
          <SelectField label="Delivery manager" value={form.deliveryManagerId} onChange={(value) => setField("deliveryManagerId", value)} options={deliveryUsers.map((user) => ({ value: user.id, label: user.name }))} />
          <TextField label="Due date" type="date" value={form.dueDate} onChange={(value) => setField("dueDate", value)} required />
          <label className="field full">
            <span>Notes</span>
            <textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} rows={4} />
          </label>
          <div className="form-actions full">
            <button className="primary-button" type="submit" disabled={credits.remaining <= 0}>
              <Sparkles size={16} />
              Create sample and use 1 credit
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ProjectsPage({ store, setStore, session, selectedProjectId, setSelectedProjectId, setPage, addActivity, addNotification }) {
  const projects = getAccessibleProjects(store, session.role, session.userId);
  const deliveryManagers = store.users.filter((user) => user.title === "Delivery Manager");
  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dmFilter, setDmFilter] = useState("all");
  const filtered = projects.filter((project) => {
    const health = calculateHealth(project, store).label;
    const matchesQuery = `${project.clientName} ${project.projectName} ${project.projectType}`.toLowerCase().includes(query.toLowerCase());
    const matchesHealth = healthFilter === "all" || health === healthFilter;
    const matchesStatus = statusFilter === "all" || (statusFilter === "live" ? isLiveProject(project) : project.status === statusFilter);
    const matchesType = typeFilter === "all" || project.projectType === typeFilter;
    const matchesDm = dmFilter === "all" || project.deliveryManagerId === dmFilter;
    return matchesQuery && matchesHealth && matchesStatus && matchesType && matchesDm;
  });
  const selected = filtered.find((project) => project.id === selectedProjectId) || filtered[0];
  const exportProjects = () => {
    downloadExcel("truefan-projects-export.xls", [
      { name: "Projects", rows: projectExcelRows(store, filtered) }
    ]);
  };

  useEffect(() => {
    if (selected && selected.id !== selectedProjectId) setSelectedProjectId(selected.id);
  }, [selected, selectedProjectId, setSelectedProjectId]);

  return (
    <div className="project-layout">
      <section className="panel project-list-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Project control</p>
            <h3>Projects</h3>
          </div>
          <button className="soft-button" type="button" onClick={exportProjects}>
            <Download size={16} />
            Export Excel
          </button>
        </div>
        <div className="filter-row">
          <label className="filter-input">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client or project" />
          </label>
          <select value={healthFilter} onChange={(event) => setHealthFilter(event.target.value)}>
            <option value="all">All health</option>
            <option value="Healthy">Healthy</option>
            <option value="Watch">Watch</option>
            <option value="At Risk">At Risk</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="live">Live active</option>
            <option value="in-progress">In progress</option>
            <option value="hold">On hold</option>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
          </select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">Projects and samples</option>
            <option value="Project">Projects</option>
            <option value="Sample">Samples</option>
          </select>
          <select value={dmFilter} onChange={(event) => setDmFilter(event.target.value)}>
            <option value="all">All DMs</option>
            {deliveryManagers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </div>
        <div className="project-list">
          {filtered.map((project) => {
            const health = calculateHealth(project, store);
            return (
              <button key={project.id} className={selected?.id === project.id ? "project-list-item active" : "project-list-item"} onClick={() => setSelectedProjectId(project.id)} type="button">
                <div>
                  <strong>{project.clientName}</strong>
                  <small>{project.projectName}</small>
                </div>
                <div className="badge-row">
                  <StatusBadge status={isLiveProject(project) ? "Live active" : project.status} />
                  <HealthPill health={health} />
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <EmptyState title="No projects found" text="Adjust filters to see more projects." />}
        </div>
      </section>

      <section className="project-detail-area">
        {selected ? (
          <ProjectDetail
            project={selected}
            store={store}
            setStore={setStore}
            session={session}
            setPage={setPage}
            addActivity={addActivity}
            addNotification={addNotification}
          />
        ) : (
          <EmptyState title="No project selected" text="Choose a project to inspect the full operating record." />
        )}
      </section>
    </div>
  );
}

function ProjectDetail({ project, store, setStore, session, setPage, addActivity, addNotification }) {
  const health = calculateHealth(project, store);
  const tasks = store.tasks.filter((task) => task.projectId === project.id);
  const timelines = store.timelines.filter((row) => row.projectId === project.id);
  const logs = store.statusLogs.filter((log) => log.projectId === project.id).sort((a, b) => daysBetween(b.date, a.date));
  const escalations = store.escalations.filter((item) => item.projectId === project.id);
  const finance = getProjectFinance(store, project.id);
  const files = store.files.filter((file) => file.projectId === project.id);
  const conflicts = findDeliveryConflicts(store, project.expectedDeliveryDate, project.id, 2);

  const updateCommercial = (field, value) => {
    setStore((current) => ({
      ...current,
      projects: current.projects.map((item) => item.id === project.id ? { ...item, [field]: value } : item),
      financeRecords: current.financeRecords.map((item) => item.projectId === project.id && field === "poStatus" ? { ...item, poStatus: value } : item)
    }));
    addActivity(session.userId, "Updated commercial status", `${project.clientName} ${field}`);
  };

  const statusCounts = taskStatuses.map((status) => ({
    ...status,
    count: tasks.filter((task) => task.status === status.id).length
  }));

  return (
    <div className="page-stack">
      <div className="project-hero">
        <div>
          <p className="eyebrow">{project.projectType}</p>
          <h2>{project.clientName}</h2>
          <p>{project.projectName}</p>
          <div className="badge-row">
            <StatusBadge status={project.status} />
            <StatusBadge status={`SOW ${project.sowStatus}`} />
            <StatusBadge status={`PO ${project.poStatus}`} />
            <span className="mini-badge">{project.language}</span>
          </div>
        </div>
        <div className="health-card">
          <HealthPill health={health} />
          <div className="health-score">{health.score}</div>
          <small>{health.reasons.length ? health.reasons.join(", ") : "No health deductions"}</small>
        </div>
      </div>

      <section className="metric-grid compact">
        <MetricCard label="Revenue" value={formatMoney(project.revenue)} icon={CreditCard} />
        <MetricCard label="Expected delivery" value={formatDate(project.expectedDeliveryDate)} icon={CalendarDays} />
        <MetricCard label="Delivery manager" value={userName(store, project.deliveryManagerId)} icon={Users} />
        <MetricCard label="Open tasks" value={tasks.filter((task) => task.status !== "completed").length} icon={ListChecks} />
      </section>

      {(project.sowStatus !== "uploaded" || project.poStatus !== "received" || conflicts.length > 0) && (
        <section className="warning-band">
          <AlertTriangle size={18} />
          <div>
            <strong>Commercial and delivery warnings</strong>
            <p>
              {project.sowStatus !== "uploaded" ? "SOW is missing or flagged. " : ""}
              {project.poStatus !== "received" ? "PO is pending or missing. " : ""}
              {conflicts.length > 0 ? `${conflicts.length} nearby delivery date conflict(s) detected.` : ""}
            </p>
          </div>
        </section>
      )}

      <section className="two-column">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Project details</p>
              <h3>Commercial record</h3>
            </div>
          </div>
          <div className="detail-grid">
            <Detail label="Template" value={project.templateName} />
            <Detail label="Salesperson" value={userName(store, project.salespersonId)} />
            <Detail label="Notes" value={project.notes} wide />
            {(session.role === "admin" || session.role === "finance" || session.role === "sales") && (
              <>
                <SelectField label="SOW status" value={project.sowStatus} onChange={(value) => updateCommercial("sowStatus", value)} options={["uploaded", "missing", "flagged"]} />
                <SelectField label="PO status" value={project.poStatus} onChange={(value) => updateCommercial("poStatus", value)} options={["received", "pending", "missing", "flagged"]} />
              </>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Task progress</p>
              <h3>Delivery status</h3>
            </div>
            {(session.role === "delivery" || session.role === "admin") && (
              <button className="soft-button" type="button" onClick={() => setPage("delivery-board")}>
                <ClipboardList size={16} />
                Open board
              </button>
            )}
          </div>
          <div className="status-count-grid">
            {statusCounts.map((item) => (
              <div key={item.id}>
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
          <ProgressBar value={tasks.length ? Math.round((tasks.filter((task) => task.status === "completed").length / tasks.length) * 100) : 0} />
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Timeline</p>
            <h3>Gantt rows and status logs</h3>
          </div>
          <div className="button-row">
            {(session.role === "delivery" || session.role === "admin") && (
              <button className="soft-button" type="button" onClick={() => setPage("timeline")}>
                <CalendarDays size={16} />
                Edit timeline
              </button>
            )}
            {["sales", "delivery", "admin"].includes(session.role) && (
              <button className="soft-button" type="button" onClick={() => setPage("status-logs")}>
                <MessageSquare size={16} />
                Add update
              </button>
            )}
          </div>
        </div>
        <SimpleTimeline store={store} rows={timelines} />
      </section>

      <section className="three-column">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Finance</p>
              <h3>PO, invoice, payment</h3>
            </div>
          </div>
          {finance ? (
            <div className="detail-grid one">
              <Detail label="Revenue booked" value={formatMoney(finance.revenueBooked)} />
              <Detail label="Invoice status" value={titleCase(finance.invoiceStatus)} />
              <Detail label="Payment status" value={titleCase(finance.paymentStatus)} />
              <Detail label="Pending amount" value={formatMoney(finance.pendingAmount)} />
            </div>
          ) : (
            <EmptyState title="No finance record" text="Finance has not created a record yet." />
          )}
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Escalations</p>
              <h3>Project risk</h3>
            </div>
          </div>
          <div className="list-stack">
            {escalations.map((item) => (
              <AlertRow key={item.id} icon={AlertTriangle} title={`${item.severity} - ${item.escalationType}`} text={item.reason} right={<StatusBadge status={item.status} />} />
            ))}
            {escalations.length === 0 && <EmptyState title="No escalations" text="No escalations are attached to this project." />}
          </div>
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Files</p>
              <h3>Proofs and links</h3>
            </div>
          </div>
          <div className="list-stack">
            {files.map((file) => (
              <AlertRow key={file.id} icon={Paperclip} title={file.name} text={`${file.fileType} - ${file.url || "Uploaded file reference"}`} />
            ))}
            {files.length === 0 && <EmptyState title="No files" text="Attach PO, invoice, proofs, or delivery links from relevant pages." />}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Chronology</p>
            <h3>Status history</h3>
          </div>
        </div>
        <StatusTimeline store={store} logs={logs} />
      </section>
    </div>
  );
}

function DeliveryTaskBoard({ store, setStore, session, addActivity, addNotification }) {
  const deliveryProjects = getAccessibleProjects(store, "delivery", session.userId);
  const deliveryUsers = store.users.filter((user) => user.role === "delivery");
  const [filters, setFilters] = useState({ owner: "all", project: "all", status: "all", projectStatus: "all" });
  const [form, setForm] = useState({
    projectId: deliveryProjects[0]?.id || "",
    title: "",
    ownerId: deliveryUsers[0]?.id || "",
    startDate: dateInputDefault(0),
    endDate: dateInputDefault(3),
    notes: "",
    status: "not-started"
  });

  const projectIds = new Set(deliveryProjects.map((project) => project.id));
  const visibleTasks = store.tasks
    .filter((task) => projectIds.has(task.projectId))
    .filter((task) => filters.owner === "all" || task.ownerId === filters.owner)
    .filter((task) => filters.project === "all" || task.projectId === filters.project)
    .filter((task) => filters.status === "all" || task.status === filters.status)
    .filter((task) => {
      const project = getProject(store, task.projectId);
      if (filters.projectStatus === "all") return true;
      if (filters.projectStatus === "live") return isLiveProject(project);
      return project?.status === filters.projectStatus;
    });
  const exportTasks = () => {
    downloadExcel("truefan-delivery-tasks-export.xls", [
      { name: "Delivery Tasks", rows: taskExcelRows(store, visibleTasks) }
    ]);
  };

  const setFormField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = (event) => {
    event.preventDefault();
    if (!form.projectId) return;
    const task = { id: makeId("t"), ...form };
    setStore((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    addActivity(session.userId, "Created task", `${getProject(store, form.projectId)?.clientName} - ${form.title}`);
    addNotification({ title: "Task assigned", message: `${form.title} assigned to ${userName(store, form.ownerId)}.`, targetRoles: ["delivery", "admin"], projectId: form.projectId, priority: "medium" });
    setForm((current) => ({ ...current, title: "", notes: "" }));
  };

  const updateTask = (taskId, field, value) => {
    setStore((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === taskId ? { ...task, [field]: value } : task)
    }));
  };

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Delivery board</p>
            <h3>Add and filter tasks</h3>
          </div>
          <button className="soft-button" type="button" onClick={exportTasks}>
            <Download size={16} />
            Export Excel
          </button>
        </div>
        <form className="form-grid dense" onSubmit={submit}>
          <SelectField label="Project" value={form.projectId} onChange={(value) => setFormField("projectId", value)} options={deliveryProjects.map((project) => ({ value: project.id, label: `${project.clientName} - ${project.projectName}` }))} />
          <TextField label="Task" value={form.title} onChange={(value) => setFormField("title", value)} required />
          <SelectField label="Owner" value={form.ownerId} onChange={(value) => setFormField("ownerId", value)} options={deliveryUsers.map((user) => ({ value: user.id, label: user.name }))} />
          <TextField label="Start date" type="date" value={form.startDate} onChange={(value) => setFormField("startDate", value)} />
          <TextField label="End date" type="date" value={form.endDate} onChange={(value) => setFormField("endDate", value)} />
          <SelectField label="Status" value={form.status} onChange={(value) => setFormField("status", value)} options={taskStatuses.map((status) => ({ value: status.id, label: status.label }))} />
          <TextField label="Notes" value={form.notes} onChange={(value) => setFormField("notes", value)} />
          <div className="form-actions">
            <button className="primary-button" type="submit">
              <Plus size={16} />
              Add task
            </button>
          </div>
        </form>
      </section>

      <section className="filter-bar">
        <Filter size={17} />
        <select value={filters.owner} onChange={(event) => setFilters((current) => ({ ...current, owner: event.target.value }))}>
          <option value="all">All owners</option>
          {deliveryUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
        <select value={filters.project} onChange={(event) => setFilters((current) => ({ ...current, project: event.target.value }))}>
          <option value="all">All projects</option>
          {deliveryProjects.map((project) => <option key={project.id} value={project.id}>{project.clientName}</option>)}
        </select>
        <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
          <option value="all">All statuses</option>
          {taskStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
        </select>
        <select value={filters.projectStatus} onChange={(event) => setFilters((current) => ({ ...current, projectStatus: event.target.value }))}>
          <option value="all">All project statuses</option>
          <option value="live">Live active</option>
          <option value="in-progress">In progress</option>
          <option value="hold">On hold</option>
          <option value="upcoming">Upcoming</option>
          <option value="completed">Completed</option>
        </select>
      </section>

      <section className="kanban-board">
        {taskStatuses.map((status) => {
          const tasks = visibleTasks.filter((task) => task.status === status.id);
          return (
            <div className="kanban-column" key={status.id}>
              <div className="kanban-heading">
                <strong>{status.label}</strong>
                <span>{tasks.length}</span>
              </div>
              {tasks.map((task) => {
                const project = getProject(store, task.projectId);
                return (
                  <article className={isOverdue(task.endDate, task.status) ? "task-card overdue" : "task-card"} key={task.id}>
                    <div>
                      <strong className="company-title">{project?.clientName || task.title}</strong>
                      <small>{task.title === "Delivery tracker update" ? project?.projectName : task.title}</small>
                    </div>
                    <p>{task.notes}</p>
                    <div className="task-meta">
                      <span>{userName(store, task.ownerId)}</span>
                      <span>{formatDate(task.endDate)}</span>
                    </div>
                    <select value={task.status} onChange={(event) => updateTask(task.id, "status", event.target.value)}>
                      {taskStatuses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </article>
                );
              })}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function DailyScrumPage({ store, setStore, session, addActivity, addNotification }) {
  const today = dateInputDefault(0);
  const deliveryProjects = getAccessibleProjects(store, "delivery", session.userId);
  const projectIds = new Set(deliveryProjects.map((project) => project.id));
  const dmUsers = store.users.filter((user) => user.title === "Delivery Manager");
  const deliveryLeads = store.users.filter((user) => ["Head Editor", "Head Audio"].includes(user.title));
  const juniorEditors = store.users.filter((user) => user.role === "delivery" && ["Video", "Audio"].includes(user.team) && !["Head Editor", "Head Audio"].includes(user.title));
  const openTasks = store.tasks
    .filter((task) => projectIds.has(task.projectId) && task.status !== "completed")
    .sort((a, b) => daysBetween(a.endDate || today, b.endDate || today));
  const todayQueue = openTasks.filter((task) => !task.endDate || daysBetween(today, task.endDate) <= 1);
  const firstLead = deliveryLeads[0];
  const [filters, setFilters] = useState({ date: today, dm: "all", lead: "all", team: "all", projectStatus: "all" });
  const [form, setForm] = useState({
    date: today,
    projectId: deliveryProjects[0]?.id || "",
    taskId: openTasks[0]?.id || "",
    dmId: dmUsers.find((user) => user.id === session.userId)?.id || dmUsers[0]?.id || session.userId,
    team: firstLead?.team || "Video",
    headEditorId: firstLead?.id || "",
    priority: "High",
    deadline: deliveryProjects[0]?.expectedDeliveryDate || dateInputDefault(1),
    note: ""
  });
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const scrumNotes = store.scrumNotes || [];
  const scrumAssignments = store.scrumAssignments || [];
  const visibleNotes = scrumNotes
    .filter((note) => note.date === filters.date)
    .filter((note) => filters.dm === "all" || note.dmId === filters.dm)
    .filter((note) => filters.lead === "all" || note.headEditorId === filters.lead)
    .filter((note) => filters.team === "all" || (note.team || getUser(store, note.headEditorId)?.team) === filters.team)
    .filter((note) => {
      const project = getProject(store, note.projectId);
      if (filters.projectStatus === "all") return true;
      if (filters.projectStatus === "live") return isLiveProject(project);
      return project?.status === filters.projectStatus;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const filteredQueue = todayQueue
    .filter((task) => {
      const project = getProject(store, task.projectId);
      if (filters.dm !== "all" && project?.deliveryManagerId !== filters.dm) return false;
      if (filters.projectStatus === "live") return isLiveProject(project);
      if (filters.projectStatus !== "all" && project?.status !== filters.projectStatus) return false;
      return true;
    })
    .slice(0, 12);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setTeam = (team) => {
    const lead = deliveryLeads.find((user) => user.team === team) || deliveryLeads[0];
    setForm((current) => ({ ...current, team, headEditorId: lead?.id || "" }));
  };
  const setProjectForScrum = (projectId) => {
    const project = getProject(store, projectId);
    setForm((current) => ({
      ...current,
      projectId,
      dmId: project?.deliveryManagerId || current.dmId,
      deadline: project?.expectedDeliveryDate || current.deadline
    }));
  };
  const pickTaskForToday = (task) => {
    const project = getProject(store, task.projectId);
    const lead = deliveryLeads.find((user) => user.team === "Video") || deliveryLeads[0];
    setForm((current) => ({
      ...current,
      date: today,
      projectId: task.projectId,
      taskId: task.id,
      dmId: project?.deliveryManagerId || current.dmId,
      team: lead?.team || current.team,
      headEditorId: lead?.id || current.headEditorId,
      deadline: task.endDate || project?.expectedDeliveryDate || current.deadline,
      note: `Pick for today: ${task.title}. ${task.notes || project?.notes || ""}`.trim()
    }));
  };
  const submit = (event) => {
    event.preventDefault();
    if (!form.note.trim() || !form.projectId || !form.headEditorId) return;
    const project = getProject(store, form.projectId);
    const task = openTasks.find((item) => item.id === form.taskId);
    const deadline = form.deadline || task?.endDate || project?.expectedDeliveryDate || form.date;
    const note = {
      id: makeId("scrum"),
      ...form,
      deadline,
      status: "open",
      createdAt: new Date().toISOString(),
      createdBy: session.userId
    };
    setStore((current) => ({ ...current, scrumNotes: [note, ...(current.scrumNotes || [])] }));
    addActivity(session.userId, "Added scrum note", `${getProject(store, form.projectId)?.projectName || "Delivery work"} for ${userName(store, form.headEditorId)}`);
    addNotification({
      title: "Pick for today from DM",
      message: `${userName(store, form.dmId)} briefed ${userName(store, form.headEditorId)} on ${project?.clientName || "a project"} by ${formatDate(deadline)}. Context: ${form.note}`,
      targetRoles: ["delivery", "admin"],
      targetUsers: [form.headEditorId],
      projectId: form.projectId,
      priority: "medium"
    });
    setForm((current) => ({ ...current, note: "" }));
  };

  const updateNote = (noteId, field, value) => {
    setStore((current) => ({
      ...current,
      scrumNotes: (current.scrumNotes || []).map((note) => note.id === noteId ? { ...note, [field]: value } : note)
    }));
  };

  const juniorEditorsFor = (note) => {
    const team = note.team || getUser(store, note.headEditorId)?.team || "Video";
    return juniorEditors.filter((user) => user.team === team);
  };
  const assignmentDraftFor = (note, members) => assignmentDrafts[note.id] || {
    assigneeId: members[0]?.id || "",
    deadline: note.deadline || getProject(store, note.projectId)?.expectedDeliveryDate || note.date,
    context: ""
  };
  const setAssignmentDraft = (note, members, field, value) => {
    setAssignmentDrafts((current) => ({
      ...current,
      [note.id]: {
        ...assignmentDraftFor(note, members),
        ...current[note.id],
        [field]: value
      }
    }));
  };
  const assignToEditor = (note) => {
    const members = juniorEditorsFor(note);
    const draft = assignmentDraftFor(note, members);
    if (!draft.assigneeId) return;
    const project = getProject(store, note.projectId);
    const lead = getUser(store, note.headEditorId);
    const context = [
      `DM: ${userName(store, note.dmId)}`,
      `Lead: ${lead?.name || "Lead"}`,
      `Project deadline: ${formatDate(project?.expectedDeliveryDate)}`,
      `Assigned deadline: ${formatDate(draft.deadline)}`,
      `DM context: ${note.note}`,
      draft.context ? `Lead instruction: ${draft.context}` : ""
    ].filter(Boolean).join("\n");
    const task = {
      id: makeId("t"),
      projectId: note.projectId,
      title: `Daily pick - ${project?.clientName || "Project"}`,
      ownerId: draft.assigneeId,
      startDate: note.date,
      endDate: draft.deadline,
      notes: context,
      status: "not-started"
    };
    const assignment = {
      id: makeId("scrumassign"),
      scrumNoteId: note.id,
      projectId: note.projectId,
      team: note.team || lead?.team,
      dmId: note.dmId,
      leadId: note.headEditorId,
      assigneeId: draft.assigneeId,
      deadline: draft.deadline,
      priority: note.priority,
      context,
      status: "assigned",
      taskId: task.id,
      createdAt: new Date().toISOString()
    };
    setStore((current) => ({
      ...current,
      tasks: [task, ...current.tasks],
      scrumAssignments: [assignment, ...(current.scrumAssignments || [])],
      scrumNotes: (current.scrumNotes || []).map((item) => item.id === note.id ? { ...item, status: "in-progress" } : item)
    }));
    addActivity(session.userId, "Assigned scrum work", `${project?.clientName || "Project"} to ${userName(store, draft.assigneeId)}`);
    addNotification({
      title: "Editor work assigned",
      message: `${lead?.name || "Lead"} assigned you ${project?.clientName || "a project"} work due ${formatDate(draft.deadline)}. DM: ${userName(store, note.dmId)}. Context: ${context}`,
      targetRoles: ["delivery", "admin"],
      targetUsers: [draft.assigneeId],
      projectId: note.projectId,
      priority: note.priority === "Critical" ? "high" : "medium"
    });
    setAssignmentDrafts((current) => ({
      ...current,
      [note.id]: {
        ...assignmentDraftFor(note, members),
        context: ""
      }
    }));
  };
  const exportScrum = () => {
    const visibleNoteIds = new Set(visibleNotes.map((note) => note.id));
    const visibleAssignments = scrumAssignments.filter((assignment) => visibleNoteIds.has(assignment.scrumNoteId));
    const rows = scrumExcelRows(store, visibleNotes, visibleAssignments);
    downloadExcel("truefan-daily-scrum-export.xls", [
      { name: "Scrum Notes", rows: rows.notes },
      { name: "Editor Assignments", rows: rows.assignments }
    ]);
  };

  return (
    <div className="page-stack">
      <section className="metric-grid compact">
        <MetricCard label="Today's scrum notes" value={scrumNotes.filter((note) => note.date === today).length} icon={ListChecks} />
        <MetricCard label="Delivery leads" value={deliveryLeads.length} detail="Head editor and head audio" icon={Users} />
        <MetricCard label="Due today or overdue" value={todayQueue.length} icon={Clock} tone={todayQueue.length ? "warning" : "success"} />
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Daily scrum</p>
              <h3>DM pick for today</h3>
            </div>
            <span className="mini-badge">DMs are managers</span>
          </div>
          <form className="form-grid" onSubmit={submit}>
            <TextField label="Scrum date" type="date" value={form.date} onChange={(value) => setField("date", value)} />
            <SelectField label="DM manager" value={form.dmId} onChange={(value) => setField("dmId", value)} options={dmUsers.map((user) => ({ value: user.id, label: user.name }))} />
            <SelectField label="Team" value={form.team} onChange={setTeam} options={["Video", "Audio"]} />
            <SelectField label="Head editor / head audio" value={form.headEditorId} onChange={(value) => setField("headEditorId", value)} options={deliveryLeads.map((user) => ({ value: user.id, label: `${user.name} - ${user.title}` }))} />
            <SelectField label="Project or sample" value={form.projectId} onChange={setProjectForScrum} options={deliveryProjects.map((project) => ({ value: project.id, label: `${project.projectType}: ${project.clientName} - ${project.projectName}` }))} />
            <SelectField label="Task" value={form.taskId} onChange={(value) => setField("taskId", value)} options={[{ value: "", label: "General note" }, ...openTasks.map((task) => ({ value: task.id, label: `${getProject(store, task.projectId)?.clientName || "Work"} - ${task.title}` }))]} />
            <SelectField label="Priority" value={form.priority} onChange={(value) => setField("priority", value)} options={["Critical", "High", "Medium", "Low"]} />
            <TextField label="Deadline" type="date" value={form.deadline} onChange={(value) => setField("deadline", value)} />
            <label className="field full">
              <span>Context for the lead</span>
              <textarea value={form.note} onChange={(event) => setField("note", event.target.value)} rows={4} placeholder="Example: Pick this for today. Finish WhatsApp proof edit, QA first 20 outputs, and share blockers by 4 PM." />
            </label>
            <div className="form-actions full">
              <button className="primary-button" type="submit">
                <Plus size={16} />
                Send to lead
              </button>
            </div>
          </form>
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Today</p>
              <h3>Editor work queue</h3>
            </div>
          </div>
          <div className="list-stack">
            {filteredQueue.map((task) => {
              const project = getProject(store, task.projectId);
              return (
                <AlertRow
                  key={task.id}
                  icon={Clock}
                  title={project?.clientName || task.title}
                  text={`${project?.clientName || "Work item"} - ${userName(store, task.ownerId)} - due ${formatDate(task.endDate)}`}
                  right={(
                    <button className="soft-button compact-button" type="button" onClick={() => pickTaskForToday(task)}>
                      Pick for today
                    </button>
                  )}
                />
              );
            })}
            {filteredQueue.length === 0 && <EmptyState title="No editor queue" text="No overdue or today/tomorrow editor tasks match these filters." />}
          </div>
        </div>
      </section>

      <section className="filter-bar">
        <Filter size={17} />
        <input type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} />
        <select value={filters.dm} onChange={(event) => setFilters((current) => ({ ...current, dm: event.target.value }))}>
          <option value="all">All DM managers</option>
          {dmUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
        <select value={filters.lead} onChange={(event) => setFilters((current) => ({ ...current, lead: event.target.value }))}>
          <option value="all">All leads</option>
          {deliveryLeads.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
        <select value={filters.team} onChange={(event) => setFilters((current) => ({ ...current, team: event.target.value }))}>
          <option value="all">All teams</option>
          <option value="Video">Video team</option>
          <option value="Audio">Audio team</option>
        </select>
        <select value={filters.projectStatus} onChange={(event) => setFilters((current) => ({ ...current, projectStatus: event.target.value }))}>
          <option value="all">All project statuses</option>
          <option value="live">Live active</option>
          <option value="in-progress">In progress</option>
          <option value="hold">On hold</option>
          <option value="upcoming">Upcoming</option>
          <option value="completed">Completed</option>
        </select>
        <button className="soft-button" type="button" onClick={exportScrum}>
          <Download size={16} />
          Export Excel
        </button>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Editor instructions</p>
            <h3>Lead distribution board</h3>
          </div>
        </div>
        <div className="scrum-grid">
          {visibleNotes.map((note) => {
            const project = getProject(store, note.projectId);
            const members = juniorEditorsFor(note);
            const draft = assignmentDraftFor(note, members);
            const noteAssignments = scrumAssignments.filter((assignment) => assignment.scrumNoteId === note.id);
            return (
              <article className="scrum-card" key={note.id}>
                <div className="scrum-card-head">
                  <div>
                    <strong className="company-title">{project?.clientName}</strong>
                    <small>{project?.projectName} - {note.team || getUser(store, note.headEditorId)?.team}</small>
                  </div>
                  <span className={`severity ${String(note.priority || "Medium").toLowerCase()}`}>{note.priority || "Medium"}</span>
                </div>
                <p>{note.note}</p>
                <div className="task-meta">
                  <span>DM: {userName(store, note.dmId)}</span>
                  <span>Lead: {userName(store, note.headEditorId)}</span>
                  <span>Due: {formatDate(note.deadline)}</span>
                </div>
                <div className="assignment-box">
                  <SelectField label="Assign junior editor" value={draft.assigneeId} onChange={(value) => setAssignmentDraft(note, members, "assigneeId", value)} options={members.map((user) => ({ value: user.id, label: `${user.name} - ${user.title}` }))} />
                  <TextField label="Editor deadline" type="date" value={draft.deadline} onChange={(value) => setAssignmentDraft(note, members, "deadline", value)} />
                  <label className="field full">
                    <span>Context for assigned editor</span>
                    <textarea value={draft.context} onChange={(event) => setAssignmentDraft(note, members, "context", event.target.value)} rows={3} placeholder="Add edit/audio instructions, client expectation, proof link, or blocker context." />
                  </label>
                  <button className="primary-button" type="button" onClick={() => assignToEditor(note)} disabled={!members.length}>
                    <Plus size={16} />
                    Assign to editor
                  </button>
                </div>
                {noteAssignments.length > 0 && (
                  <div className="assignment-list">
                    {noteAssignments.map((assignment) => (
                      <span key={assignment.id}>
                        {userName(store, assignment.assigneeId)} - due {formatDate(assignment.deadline)}
                      </span>
                    ))}
                  </div>
                )}
                <select value={note.status} onChange={(event) => updateNote(note.id, "status", event.target.value)}>
                  <option value="open">Open</option>
                  <option value="in-progress">In progress</option>
                  <option value="completed">Done</option>
                  <option value="blocked">Blocked</option>
                </select>
              </article>
            );
          })}
          {visibleNotes.length === 0 && <EmptyState title="No scrum notes yet" text="Add a note for the lead editor to see today's priorities." />}
        </div>
      </section>
    </div>
  );
}

function TimelineBuilder({ store, setStore, session, addActivity }) {
  const deliveryProjects = getAccessibleProjects(store, "delivery", session.userId);
  const deliveryUsers = store.users.filter((user) => user.role === "delivery");
  const [projectId, setProjectId] = useState(deliveryProjects[0]?.id || "");
  const [form, setForm] = useState({
    item: timelineItems[0],
    ownerId: deliveryUsers[0]?.id || "",
    startDate: dateInputDefault(0),
    endDate: dateInputDefault(2),
    notes: "",
    status: "not-started"
  });
  const rows = store.timelines.filter((row) => !projectId || row.projectId === projectId);
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = (event) => {
    event.preventDefault();
    if (!projectId) return;
    const row = { id: makeId("tl"), projectId, ...form };
    setStore((current) => ({ ...current, timelines: [...current.timelines, row] }));
    addActivity(session.userId, "Added timeline row", `${getProject(store, projectId)?.clientName} - ${form.item}`);
    setForm((current) => ({ ...current, notes: "" }));
  };

  const updateRow = (rowId, field, value) => {
    setStore((current) => ({
      ...current,
      timelines: current.timelines.map((row) => row.id === rowId ? { ...row, [field]: value } : row)
    }));
  };

  const exportRows = () => {
    downloadExcel("truefan-timeline-export.xls", [
      { name: "Timeline", rows: timelineExcelRows(store, rows) }
    ]);
  };

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Timeline builder</p>
            <h3>Predefined delivery rows</h3>
          </div>
          <button className="soft-button" type="button" onClick={exportRows}>
            <Download size={16} />
            Export Excel
          </button>
        </div>
        <form className="form-grid dense" onSubmit={submit}>
          <SelectField label="Project" value={projectId} onChange={setProjectId} options={deliveryProjects.map((project) => ({ value: project.id, label: `${project.clientName} - ${project.projectName}` }))} />
          <SelectField label="Timeline item" value={form.item} onChange={(value) => setField("item", value)} options={timelineItems} />
          <SelectField label="Owner" value={form.ownerId} onChange={(value) => setField("ownerId", value)} options={deliveryUsers.map((user) => ({ value: user.id, label: user.name }))} />
          <TextField label="Start date" type="date" value={form.startDate} onChange={(value) => setField("startDate", value)} />
          <TextField label="End date" type="date" value={form.endDate} onChange={(value) => setField("endDate", value)} />
          <SelectField label="Status" value={form.status} onChange={(value) => setField("status", value)} options={taskStatuses.map((status) => ({ value: status.id, label: status.label }))} />
          <TextField label="Notes" value={form.notes} onChange={(value) => setField("notes", value)} />
          <div className="form-actions">
            <button className="primary-button" type="submit">
              <Plus size={16} />
              Add row
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Timeline item</th>
                <th>Owner</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.item}</td>
                  <td>{userName(store, row.ownerId)}</td>
                  <td>{formatDate(row.startDate)}</td>
                  <td>{formatDate(row.endDate)}</td>
                  <td>
                    <select value={row.status} onChange={(event) => updateRow(row.id, "status", event.target.value)}>
                      {taskStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
                    </select>
                  </td>
                  <td>{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function GanttTimelineView({ store, session }) {
  const projects = getAccessibleProjects(store, session.role === "admin" ? "admin" : "delivery", session.userId);
  const projectIds = new Set(projects.map((project) => project.id));
  const rows = store.timelines.filter((row) => projectIds.has(row.projectId));
  const dates = rows.flatMap((row) => [row.startDate, row.endDate]).map(dateOnly);
  const minDate = dates.length ? new Date(Math.min(...dates)) : dateOnly(new Date());
  const maxDate = dates.length ? new Date(Math.max(...dates)) : dateOnly(dateInputDefault(7));
  const span = Math.max(1, Math.round((maxDate - minDate) / dayMs) + 1);

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Gantt timeline</p>
            <h3>Delivery windows by project</h3>
          </div>
          <span className="mini-badge">{formatDate(minDate)} to {formatDate(maxDate)}</span>
        </div>
        <div className="gantt">
          {rows.map((row) => {
            const left = Math.max(0, Math.round(((dateOnly(row.startDate) - minDate) / dayMs / span) * 100));
            const width = Math.max(6, Math.round((((dateOnly(row.endDate) - dateOnly(row.startDate)) / dayMs + 1) / span) * 100));
            const project = getProject(store, row.projectId);
            return (
              <div className="gantt-row" key={row.id}>
                <div className="gantt-label">
                  <strong>{row.item}</strong>
                  <small>{project?.clientName} - {userName(store, row.ownerId)}</small>
                </div>
                <div className="gantt-track">
                  <span className={`gantt-bar ${row.status}`} style={{ left: `${left}%`, width: `${width}%` }}>
                    {statusLabel(row.status)}
                  </span>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <EmptyState title="No timeline rows" text="Create timeline rows to render the Gantt view." />}
        </div>
      </section>
    </div>
  );
}

function StatusLogPage({ store, setStore, session, addActivity }) {
  const projects = getAccessibleProjects(store, session.role, session.userId);
  const [form, setForm] = useState({
    projectId: projects[0]?.id || "",
    date: dateInputDefault(0),
    updateType: "Delivery update",
    text: "",
    channel: "internal update",
    attachmentName: "",
    attachmentUrl: ""
  });
  const projectIds = new Set(projects.map((project) => project.id));
  const logs = store.statusLogs
    .filter((log) => projectIds.has(log.projectId))
    .sort((a, b) => daysBetween(b.date, a.date));
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = (event) => {
    event.preventDefault();
    if (!form.projectId) return;
    const log = { id: makeId("sl"), ...form, addedBy: session.userId };
    setStore((current) => ({
      ...current,
      statusLogs: [log, ...current.statusLogs],
      files: form.attachmentName || form.attachmentUrl
        ? [
            ...current.files,
            {
              id: makeId("file"),
              projectId: form.projectId,
              fileType: "Communication proof",
              name: form.attachmentName || "External proof link",
              url: form.attachmentUrl,
              addedBy: session.userId,
              createdAt: new Date().toISOString()
            }
          ]
        : current.files
    }));
    addActivity(session.userId, "Added status update", getProject(store, form.projectId)?.clientName || "Project");
    setForm((current) => ({ ...current, text: "", attachmentName: "", attachmentUrl: "" }));
  };

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Status log</p>
            <h3>Add project communication</h3>
          </div>
          <span className="mini-badge">Heavy videos should be external links</span>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <SelectField label="Project" value={form.projectId} onChange={(value) => setField("projectId", value)} options={projects.map((project) => ({ value: project.id, label: `${project.clientName} - ${project.projectName}` }))} />
          <TextField label="Date" type="date" value={form.date} onChange={(value) => setField("date", value)} />
          <SelectField label="Update type" value={form.updateType} onChange={(value) => setField("updateType", value)} options={["Delivery update", "Client dependency", "Finance update", "Escalation note", "Final delivery"]} />
          <SelectField label="Channel" value={form.channel} onChange={(value) => setField("channel", value)} options={["WhatsApp", "email", "call", "internal update"]} />
          <FileField label="Screenshot or proof attachment" onChange={(name) => setField("attachmentName", name)} />
          <TextField label="Proof link" value={form.attachmentUrl} onChange={(value) => setField("attachmentUrl", value)} placeholder="Drive, HubSpot, WhatsApp proof link" />
          <label className="field full">
            <span>Update text</span>
            <textarea value={form.text} onChange={(event) => setField("text", event.target.value)} rows={4} required />
          </label>
          <div className="form-actions full">
            <button className="primary-button" type="submit">
              <MessageSquare size={16} />
              Add status update
            </button>
          </div>
        </form>
      </section>
      <section className="panel">
        <StatusTimeline store={store} logs={logs} />
      </section>
    </div>
  );
}

function EscalationPage({ store, setStore, session, addActivity, addNotification }) {
  const projects = getAccessibleProjects(store, session.role, session.userId);
  const owners = store.users.filter((user) => ["sales", "delivery", "admin"].includes(user.role));
  const [form, setForm] = useState({
    projectId: projects[0]?.id || "",
    escalationType: escalationTypes[0],
    severity: "High",
    reason: "",
    ownerId: session.userId,
    status: "open",
    resolutionNotes: ""
  });
  const projectIds = new Set(projects.map((project) => project.id));
  const escalations = store.escalations.filter((item) => projectIds.has(item.projectId));
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = (event) => {
    event.preventDefault();
    const escalation = { id: makeId("e"), ...form, createdDate: dateInputDefault(0) };
    setStore((current) => ({ ...current, escalations: [escalation, ...current.escalations] }));
    addActivity(session.userId, "Raised escalation", getProject(store, form.projectId)?.clientName || "Project");
    addNotification({ title: "Escalation raised", message: `${form.severity} escalation raised for ${getProject(store, form.projectId)?.clientName}.`, targetRoles: ["sales", "delivery", "admin"], projectId: form.projectId, priority: "high" });
    setForm((current) => ({ ...current, reason: "", resolutionNotes: "" }));
  };

  const updateEscalation = (id, field, value) => {
    setStore((current) => ({
      ...current,
      escalations: current.escalations.map((item) => item.id === id ? { ...item, [field]: value } : item)
    }));
  };

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Escalation desk</p>
            <h3>Raise a project escalation</h3>
          </div>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <SelectField label="Project" value={form.projectId} onChange={(value) => setField("projectId", value)} options={projects.map((project) => ({ value: project.id, label: `${project.clientName} - ${project.projectName}` }))} />
          <SelectField label="Escalation type" value={form.escalationType} onChange={(value) => setField("escalationType", value)} options={escalationTypes} />
          <SelectField label="Severity" value={form.severity} onChange={(value) => setField("severity", value)} options={["Low", "Medium", "High", "Critical"]} />
          <SelectField label="Owner" value={form.ownerId} onChange={(value) => setField("ownerId", value)} options={owners.map((user) => ({ value: user.id, label: user.name }))} />
          <label className="field full">
            <span>Reason</span>
            <textarea rows={4} value={form.reason} onChange={(event) => setField("reason", event.target.value)} required />
          </label>
          <div className="form-actions full">
            <button className="primary-button" type="submit">
              <AlertTriangle size={16} />
              Raise escalation
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Resolution notes</th>
              </tr>
            </thead>
            <tbody>
              {escalations.map((item) => (
                <tr key={item.id}>
                  <td>{getProject(store, item.projectId)?.clientName}</td>
                  <td>{item.escalationType}</td>
                  <td><span className={`severity ${item.severity.toLowerCase()}`}>{item.severity}</span></td>
                  <td>{userName(store, item.ownerId)}</td>
                  <td>
                    <select value={item.status} onChange={(event) => updateEscalation(item.id, "status", event.target.value)}>
                      <option value="open">Open</option>
                      <option value="in review">In review</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </td>
                  <td>
                    <input value={item.resolutionNotes} onChange={(event) => updateEscalation(item.id, "resolutionNotes", event.target.value)} placeholder="Add notes" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FinanceDashboard({ store, setStore, session, addActivity, addNotification }) {
  const projects = getAccessibleProjects(store, "finance", session.userId);
  const projectIds = new Set(projects.map((project) => project.id));
  const records = store.financeRecords.filter((record) => projectIds.has(record.projectId));
  const totalRevenue = records.reduce((sum, record) => sum + Number(record.revenueBooked || 0), 0);
  const pendingAmount = records.reduce((sum, record) => sum + Number(record.pendingAmount || 0), 0);
  const updateRecord = (id, field, value) => {
    setStore((current) => {
      const record = current.financeRecords.find((item) => item.id === id);
      return {
        ...current,
        financeRecords: current.financeRecords.map((item) => item.id === id ? { ...item, [field]: field.includes("Amount") || field === "revenueBooked" ? Number(value) : value } : item),
        projects: field === "poStatus" && record
          ? current.projects.map((project) => project.id === record.projectId ? { ...project, poStatus: value } : project)
          : current.projects
      };
    });
  };

  const notifyPending = (record) => {
    const project = getProject(store, record.projectId);
    addNotification({ title: "Payment pending", message: `${project?.clientName} has ${formatMoney(record.pendingAmount)} pending.`, targetRoles: ["finance", "admin"], projectId: record.projectId, priority: "medium" });
    addActivity(session.userId, "Sent payment reminder", project?.clientName || "Project");
  };
  const exportFinance = () => {
    downloadExcel("truefan-finance-export.xls", [
      { name: "Finance", rows: financeExcelRows(store, records) }
    ]);
  };

  return (
    <div className="page-stack">
      <section className="metric-grid">
        <MetricCard label="Revenue booked" value={formatMoney(totalRevenue)} icon={CreditCard} />
        <MetricCard label="PO received" value={records.filter((record) => record.poStatus === "received").length} icon={CheckCircle2} tone="success" />
        <MetricCard label="PO pending" value={records.filter((record) => record.poStatus !== "received").length} icon={AlertTriangle} tone="warning" />
        <MetricCard label="Invoice raised" value={records.filter((record) => record.invoiceStatus === "invoice raised").length} icon={FileText} />
        <MetricCard label="Invoice pending" value={records.filter((record) => record.invoiceStatus !== "invoice raised").length} icon={Clock} tone="warning" />
        <MetricCard label="Payment received" value={records.filter((record) => record.paymentStatus === "received").length} icon={CheckCircle2} tone="success" />
        <MetricCard label="Payment pending" value={records.filter((record) => record.paymentStatus !== "received").length} icon={Clock} tone="warning" />
        <MetricCard label="Pending amount" value={formatMoney(pendingAmount)} icon={CreditCard} tone="danger" />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Finance operations</p>
            <h3>Project-wise finance status</h3>
          </div>
          <button className="soft-button" type="button" onClick={exportFinance}>
            <Download size={16} />
            Export Excel
          </button>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Revenue</th>
                <th>PO</th>
                <th>Invoice</th>
                <th>Payment</th>
                <th>Pending</th>
                <th>Files</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const project = getProject(store, record.projectId);
                return (
                  <tr key={record.id}>
                    <td>
                      <strong>{project?.clientName}</strong>
                      <small>{project?.projectName}</small>
                    </td>
                    <td><input type="number" value={record.revenueBooked} onChange={(event) => updateRecord(record.id, "revenueBooked", event.target.value)} /></td>
                    <td>
                      <select value={record.poStatus} onChange={(event) => updateRecord(record.id, "poStatus", event.target.value)}>
                        <option value="received">Received</option>
                        <option value="pending">Pending</option>
                        <option value="missing">Missing</option>
                        <option value="flagged">Flagged</option>
                      </select>
                    </td>
                    <td>
                      <select value={record.invoiceStatus} onChange={(event) => updateRecord(record.id, "invoiceStatus", event.target.value)}>
                        <option value="not raised">Not raised</option>
                        <option value="invoice pending">Invoice pending</option>
                        <option value="invoice raised">Invoice raised</option>
                      </select>
                    </td>
                    <td>
                      <select value={record.paymentStatus} onChange={(event) => updateRecord(record.id, "paymentStatus", event.target.value)}>
                        <option value="payment pending">Payment pending</option>
                        <option value="partially received">Partially received</option>
                        <option value="received">Received</option>
                      </select>
                    </td>
                    <td><input type="number" value={record.pendingAmount} onChange={(event) => updateRecord(record.id, "pendingAmount", event.target.value)} /></td>
                    <td>
                      <div className="file-mini">
                        <FileField label="PO" onChange={(name) => updateRecord(record.id, "poFile", name)} />
                        <FileField label="Invoice" onChange={(name) => updateRecord(record.id, "invoiceFile", name)} />
                      </div>
                    </td>
                    <td>
                      <button className="soft-button" type="button" onClick={() => notifyPending(record)}>
                        <Mail size={15} />
                        Notify
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TeamBandwidthPage({ store }) {
  const [filters, setFilters] = useState({ team: "all", workload: "all", projectStatus: "all" });
  const rows = computeBandwidth(store, { projectStatus: filters.projectStatus })
    .filter((row) => filters.team === "all" || row.user.team === filters.team || row.user.title === filters.team)
    .filter((row) => filters.workload === "all" || row.workloadStatus === filters.workload);
  const teams = Array.from(new Set(store.users.map((user) => user.team || user.title).filter(Boolean)));
  const exportBandwidth = () => {
    downloadExcel("truefan-bandwidth-export.xls", [
      { name: "Bandwidth", rows: bandwidthExcelRows(rows) }
    ]);
  };
  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Capacity</p>
            <h3>Team bandwidth visibility</h3>
          </div>
          <button className="soft-button" type="button" onClick={exportBandwidth}>
            <Download size={16} />
            Export Excel
          </button>
        </div>
        <div className="filter-bar embedded">
          <Filter size={17} />
          <select value={filters.team} onChange={(event) => setFilters((current) => ({ ...current, team: event.target.value }))}>
            <option value="all">All teams</option>
            <option value="Delivery Management">DM managers</option>
            <option value="Head Editor">Head editors</option>
            <option value="Video">Video team</option>
            <option value="Audio">Audio team</option>
            <option value="Sales">Sales / SDM</option>
            {teams.filter((team) => !["Delivery Management", "Video", "Audio", "Sales"].includes(team)).map((team) => <option key={team} value={team}>{team}</option>)}
          </select>
          <select value={filters.workload} onChange={(event) => setFilters((current) => ({ ...current, workload: event.target.value }))}>
            <option value="all">All workload</option>
            <option value="Available">Available</option>
            <option value="Moderate">Moderate</option>
            <option value="Busy">Busy</option>
            <option value="Overloaded">Overloaded</option>
          </select>
          <select value={filters.projectStatus} onChange={(event) => setFilters((current) => ({ ...current, projectStatus: event.target.value }))}>
            <option value="all">All project statuses</option>
            <option value="live">Live active</option>
            <option value="in-progress">In progress</option>
            <option value="hold">On hold</option>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div className="bandwidth-grid">
          {rows.map((row) => (
            <article className="bandwidth-card" key={row.user.id}>
              <div className="bandwidth-head">
                <div>
                  <strong>{row.user.name}</strong>
                  <small>{row.user.title}</small>
                </div>
                <StatusBadge status={row.workloadStatus} />
              </div>
              <div className="bandwidth-score">
                <ProgressBar value={row.score} />
                <span>{row.score}</span>
              </div>
              <div className="bandwidth-stats">
                <span>Active projects <strong>{row.activeProjects}</strong></span>
                <span>Active samples <strong>{row.activeSamples}</strong></span>
                <span>Active tasks <strong>{row.activeTasks}</strong></span>
                <span>Overdue <strong>{row.overdueTasks}</strong></span>
                <span>Deadlines <strong>{row.upcomingDeadlines}</strong></span>
                <span>On hold <strong>{row.statusCounts.hold || 0}</strong></span>
                <span>In progress <strong>{row.statusCounts["in-progress"] || 0}</strong></span>
                <span>Upcoming <strong>{row.statusCounts.upcoming || 0}</strong></span>
              </div>
            </article>
          ))}
          {rows.length === 0 && <EmptyState title="No team members found" text="Adjust bandwidth filters to see more people." />}
        </div>
      </section>
    </div>
  );
}

function AdminPanel({ store, setStore, session, addActivity, addNotification }) {
  const [member, setMember] = useState({ name: "", email: "", role: "delivery", title: "Delivery Manager" });
  const [dropdown, setDropdown] = useState({ group: "projectTypes", value: "" });
  const teamTitleOptions = ["Sales / SDM", "Delivery Manager", "Head Editor", "Head Audio", "Video Team", "Audio Team", "Finance Controller", "Command Center Admin"];

  const teamForTitle = (title, role) => {
    if (title === "Video Team") return "Video";
    if (title === "Head Editor") return "Video";
    if (title === "Head Audio") return "Audio";
    if (title === "Audio Team") return "Audio";
    if (title === "Delivery Manager") return "Delivery Management";
    if (role === "sales") return "Sales";
    if (role === "finance") return "Finance";
    if (role === "admin") return "Admin";
    return "Delivery Management";
  };

  const updateUser = (id, field, value) => {
    setStore((current) => ({
      ...current,
      users: current.users.map((user) => user.id === id ? { ...user, [field]: value } : user)
    }));
  };

  const addMember = (event) => {
    event.preventDefault();
    if (!member.name) return;
    const safeEmail = member.email || `${member.name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/(^\.|\.$)/g, "")}@truefan.ai`;
    setStore((current) => ({
      ...current,
      users: [...current.users, { id: makeId("u"), ...member, email: safeEmail, team: teamForTitle(member.title, member.role), active: true }]
    }));
    addActivity(session.userId, "Added team member", member.name);
    setMember({ name: "", email: "", role: "delivery", title: "Delivery Manager" });
  };

  const triggerSync = () => {
    setStore((current) => ({
      ...current,
      hubspotSync: {
        ...current.hubspotSync,
        lastSyncAt: new Date().toISOString(),
        status: "success",
        error: "",
        syncLogs: [
          { id: makeId("hs"), createdAt: new Date().toISOString(), status: "success", message: "Manual sync pulled 3 deals and pushed 2 project updates." },
          ...current.hubspotSync.syncLogs
        ]
      }
    }));
    addNotification({ title: "HubSpot sync complete", message: "Manual sync completed successfully.", targetRoles: ["admin"], priority: "low" });
    addActivity(session.userId, "Triggered HubSpot sync", "HubSpot integration");
  };

  const toggleMapping = (index) => {
    setStore((current) => ({
      ...current,
      hubspotSync: {
        ...current.hubspotSync,
        mappings: current.hubspotSync.mappings.map((mapping, idx) => idx === index ? { ...mapping, enabled: !mapping.enabled } : mapping)
      }
    }));
  };

  const toggleRule = (index, field) => {
    setStore((current) => ({
      ...current,
      settings: {
        ...current.settings,
        notificationRules: current.settings.notificationRules.map((rule, idx) => idx === index ? { ...rule, [field]: !rule[field] } : rule)
      }
    }));
  };

  const addDropdownValue = (event) => {
    event.preventDefault();
    if (!dropdown.value.trim()) return;
    setStore((current) => ({
      ...current,
      settings: {
        ...current.settings,
        dropdowns: {
          ...current.settings.dropdowns,
          [dropdown.group]: [...current.settings.dropdowns[dropdown.group], dropdown.value.trim()]
        }
      }
    }));
    setDropdown((current) => ({ ...current, value: "" }));
  };

  return (
    <div className="page-stack">
      <section className="two-column">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Admin controls</p>
              <h3>Team members and roles</h3>
            </div>
          </div>
          <form className="form-grid dense" onSubmit={addMember}>
            <TextField label="Name" value={member.name} onChange={(value) => setMember((current) => ({ ...current, name: value }))} />
            <TextField label="Email" value={member.email} onChange={(value) => setMember((current) => ({ ...current, email: value }))} />
            <SelectField label="Role" value={member.role} onChange={(value) => setMember((current) => ({ ...current, role: value }))} options={Object.entries(roleLabels).map(([value, label]) => ({ value, label }))} />
            <SelectField label="Team / title" value={member.title} onChange={(value) => setMember((current) => ({ ...current, title: value }))} options={teamTitleOptions} />
            <div className="form-actions">
              <button className="primary-button" type="submit">
                <Plus size={16} />
                Add team member
              </button>
            </div>
          </form>
          <div className="credential-strip admin-credentials">
            <strong>Section logins:</strong>
            {Object.entries(roleCredentials).map(([role, login]) => (
              <span key={role}>{roleLabels[role]}: {login.username} / {login.password}</span>
            ))}
          </div>
          <div className="table-shell compact-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {store.users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </td>
                    <td>
                      <select value={user.role} onChange={(event) => updateUser(user.id, "role", event.target.value)}>
                        {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="checkbox" checked={user.active} onChange={(event) => updateUser(user.id, "active", event.target.checked)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">HubSpot sync</p>
              <h3>Integration settings</h3>
            </div>
            <button className="primary-button" type="button" onClick={triggerSync}>
              <RefreshCw size={16} />
              Manual sync
            </button>
          </div>
          <div className="sync-status">
            <StatusBadge status={store.hubspotSync.status} />
            <span>Last sync: {formatDateTime(store.hubspotSync.lastSyncAt)}</span>
            {store.hubspotSync.error && <strong>{store.hubspotSync.error}</strong>}
          </div>
          <div className="mapping-list">
            {store.hubspotSync.mappings.map((mapping, index) => (
              <button className="mapping-row" type="button" key={`${mapping.hubspotField}-${mapping.appField}`} onClick={() => toggleMapping(index)}>
                <span>{mapping.hubspotField}</span>
                <span>{mapping.appField}</span>
                <StatusBadge status={mapping.enabled ? "enabled" : "disabled"} />
              </button>
            ))}
          </div>
          <div className="list-stack">
            {store.hubspotSync.syncLogs.slice(0, 3).map((log) => (
              <AlertRow key={log.id} icon={RefreshCw} title={formatDateTime(log.createdAt)} text={log.message} right={<StatusBadge status={log.status} />} />
            ))}
          </div>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Notifications</p>
              <h3>In-app and email rules</h3>
            </div>
          </div>
          <div className="rule-list">
            {store.settings.notificationRules.map((rule, index) => (
              <div className="rule-row" key={rule.name}>
                <strong>{rule.name}</strong>
                <label><input type="checkbox" checked={rule.inApp} onChange={() => toggleRule(index, "inApp")} /> In-app</label>
                <label><input type="checkbox" checked={rule.email} onChange={() => toggleRule(index, "email")} /> Email</label>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Dropdowns</p>
              <h3>Edit operational values</h3>
            </div>
          </div>
          <form className="form-grid dense" onSubmit={addDropdownValue}>
            <SelectField label="Dropdown" value={dropdown.group} onChange={(value) => setDropdown((current) => ({ ...current, group: value }))} options={Object.keys(store.settings.dropdowns)} />
            <TextField label="New value" value={dropdown.value} onChange={(value) => setDropdown((current) => ({ ...current, value }))} />
            <div className="form-actions">
              <button className="soft-button" type="submit">
                <Plus size={16} />
                Add value
              </button>
            </div>
          </form>
          <div className="tag-cloud">
            {store.settings.dropdowns[dropdown.group].map((value) => <span key={value}>{value}</span>)}
          </div>
        </div>
      </section>
    </div>
  );
}

function ActivityLogPage({ store }) {
  const logs = store.activityLogs.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Audit trail</p>
            <h3>Activity log</h3>
          </div>
        </div>
        <div className="activity-feed">
          {logs.map((log) => (
            <article key={log.id}>
              <span className="activity-dot" />
              <div>
                <strong>{log.action}</strong>
                <p>{log.entity}</p>
                <small>{userName(store, log.actorId)} - {formatDateTime(log.createdAt)}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, detail, tone = "neutral" }) {
  return (
    <article className={`metric-card ${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
      <Icon size={21} />
    </article>
  );
}

function ProjectTable({ store, projects, onOpen }) {
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Client</th>
            <th>Status</th>
            <th>Health</th>
            <th>Delivery</th>
            <th>Commercial</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const health = calculateHealth(project, store);
            return (
              <tr key={project.id} onClick={() => onOpen(project)}>
                <td>
                  <strong>{project.clientName}</strong>
                  <small>{project.projectName}</small>
                </td>
                <td><StatusBadge status={isLiveProject(project) ? "Live active" : project.status} /></td>
                <td><HealthPill health={health} /></td>
                <td>{formatDate(project.expectedDeliveryDate)}</td>
                <td>
                  <div className="badge-row">
                    <StatusBadge status={`SOW ${project.sowStatus}`} />
                    <StatusBadge status={`PO ${project.poStatus}`} />
                  </div>
                </td>
                <td>{formatMoney(project.revenue)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusTimeline({ store, logs }) {
  if (!logs.length) return <EmptyState title="No status updates" text="Add an update to build the chronological history." />;
  return (
    <div className="status-timeline">
      {logs.map((log) => {
        const Icon = log.channel === "WhatsApp" ? MessageSquare : log.channel === "email" ? Mail : log.channel === "call" ? Phone : FileText;
        const project = getProject(store, log.projectId);
        return (
          <article key={log.id}>
            <span className="timeline-icon"><Icon size={16} /></span>
            <div>
              <div className="timeline-head">
                <strong className="company-title">{project?.clientName || log.updateType}</strong>
                <small>{log.updateType} - {formatDate(log.date)} - {userName(store, log.addedBy)}</small>
              </div>
              <p>{log.text}</p>
              <div className="badge-row">
                <StatusBadge status={log.channel} />
                {(log.attachmentName || log.attachmentUrl) && <span className="mini-badge"><Paperclip size={13} /> {log.attachmentName || log.attachmentUrl}</span>}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function SimpleTimeline({ store, rows }) {
  if (!rows.length) return <EmptyState title="No timeline rows" text="Delivery can create timeline rows from the builder." />;
  return (
    <div className="simple-timeline">
      {rows.map((row) => (
        <article key={row.id}>
          <div>
            <strong>{row.item}</strong>
            <small>{userName(store, row.ownerId)}</small>
          </div>
          <span>{formatDate(row.startDate)} to {formatDate(row.endDate)}</span>
          <StatusBadge status={row.status} />
        </article>
      ))}
    </div>
  );
}

function BandwidthMini({ store }) {
  return (
    <div className="mini-bandwidth">
      {computeBandwidth(store).slice(0, 6).map((row) => (
        <div key={row.user.id}>
          <span>{row.user.name}</span>
          <ProgressBar value={row.score} />
          <StatusBadge status={row.workloadStatus} />
        </div>
      ))}
    </div>
  );
}

function computeBandwidth(store, options = {}) {
  const projectMatchesStatus = (project) => {
    if (!options.projectStatus || options.projectStatus === "all") return true;
    if (options.projectStatus === "live") return isLiveProject(project);
    return project.status === options.projectStatus;
  };
  return store.users
    .filter((user) => ["delivery", "sales"].includes(user.role))
    .map((user) => {
      const ownedProjectIds = new Set(
        store.projects
          .filter((project) => projectMatchesStatus(project) && isOpenWorkItem(project) && (project.deliveryManagerId === user.id || project.salespersonId === user.id || project.videoOwnerId === user.id || project.audioOwnerId === user.id))
          .map((project) => project.id)
      );
      store.tasks
        .filter((task) => {
          const project = getProject(store, task.projectId);
          return task.ownerId === user.id && task.status !== "completed" && project && projectMatchesStatus(project);
        })
        .forEach((task) => ownedProjectIds.add(task.projectId));
      const ownedProjects = store.projects.filter((project) => ownedProjectIds.has(project.id));
      const activeProjects = ownedProjects.filter(isLiveProject).length;
      const activeSamples = store.samples.filter((sample) => sample.status !== "completed" && (sample.deliveryManagerId === user.id || sample.salespersonId === user.id || sample.videoOwnerId === user.id || sample.audioOwnerId === user.id)).length;
      const ownedTasks = store.tasks.filter((task) => {
        const project = getProject(store, task.projectId);
        return task.ownerId === user.id && task.status !== "completed" && project && projectMatchesStatus(project);
      });
      const activeTasks = ownedTasks.length;
      const overdueTasks = ownedTasks.filter((task) => isOverdue(task.endDate, task.status)).length;
      const upcomingDeadlines = ownedTasks.filter((task) => daysBetween(new Date(), task.endDate) >= 0 && daysBetween(new Date(), task.endDate) <= 7).length;
      const statusCounts = ownedProjects.reduce((counts, project) => {
        counts[project.status] = (counts[project.status] || 0) + 1;
        return counts;
      }, {});
      const score = Math.min(100, activeProjects * 14 + activeSamples * 8 + activeTasks * 10 + overdueTasks * 18 + upcomingDeadlines * 7);
      const workloadStatus = score < 30 ? "Available" : score < 55 ? "Moderate" : score < 80 ? "Busy" : "Overloaded";
      return { user, activeProjects, activeSamples, activeTasks, overdueTasks, upcomingDeadlines, statusCounts, score, workloadStatus };
    })
    .sort((a, b) => b.score - a.score);
}

function HealthPill({ health }) {
  return (
    <span className={`health-pill ${health.label.toLowerCase().replace(" ", "-")}`}>
      <Gauge size={14} />
      {health.label} {health.score}
    </span>
  );
}

function StatusBadge({ status }) {
  return <span className={`status-badge ${String(status).toLowerCase().replaceAll(" ", "-")}`}>{titleCase(status)}</span>;
}

function ProgressBar({ value }) {
  return (
    <div className="progress" aria-label={`Progress ${value}%`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function Detail({ label, value, wide = false }) {
  return (
    <div className={wide ? "detail wide" : "detail"}>
      <span>{label}</span>
      <strong>{value || "Not set"}</strong>
    </div>
  );
}

function AlertRow({ icon: Icon, title, text, right }) {
  return (
    <article className="alert-row">
      <Icon size={17} />
      <div>
        <strong>{title}</strong>
        <small>{text}</small>
      </div>
      {right}
    </article>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <SlidersHorizontal size={22} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function TextField({ label, value, onChange, type = "text", required = false, placeholder = "" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={placeholder} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? titleCase(option) : option.label;
          return <option key={value} value={value}>{label}</option>;
        })}
      </select>
    </label>
  );
}

function FileField({ label, onChange }) {
  return (
    <label className="field file-field">
      <span>{label}</span>
      <input type="file" onChange={(event) => onChange(event.target.files?.[0]?.name || "")} />
      <Upload size={16} />
    </label>
  );
}

export default App;
