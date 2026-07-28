import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft, Plus, Check, Play, Mic, Volume2, Square,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Camera, X, Settings, Cloud, CloudDownload, Home, Eye, EyeOff,
  Heart, UserPlus, Search, FileText, ClipboardList, SkipForward,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────

type RepeatInterval =
  | "none" | "daily" | "weekly" | "two-weeks" | "four-weeks"
  | "monthly" | "two-months" | "yearly" | "weekdays" | "weekends";

const REPEAT_OPTIONS: { key: RepeatInterval; label: string }[] = [
  { key: "none",       label: "None" },
  { key: "daily",      label: "Daily" },
  { key: "weekly",     label: "Weekly" },
  { key: "two-weeks",  label: "Two Weeks" },
  { key: "four-weeks", label: "Four Weeks" },
  { key: "monthly",    label: "Monthly" },
  { key: "two-months", label: "Two Months" },
  { key: "yearly",     label: "Yearly" },
  { key: "weekdays",   label: "Weekdays" },
  { key: "weekends",   label: "Weekends" },
];

const REPEAT_LABELS: Record<RepeatInterval, string> = {
  none:"None", daily:"Daily", weekly:"Weekly", "two-weeks":"Two Weeks",
  "four-weeks":"Four Weeks", monthly:"Monthly", "two-months":"Two Months",
  yearly:"Yearly", weekdays:"Weekdays", weekends:"Weekends",
};

type Screen =
  | "welcome"
  | "login" | "signup" | "verify-email" | "signup-info" | "forgot-password"
  | "caregiver-login" | "caregiver-forgot" | "caregiver-home"
  | "caregiver-overview" | "caregiver-add-patient"
  | "home" | "all-tasks" | "categories" | "category-detail" | "calendar"
  | "task-detail" | "step-view" | "create" | "settings";

type SessionRole = "patient" | "caregiver" | null;

interface Patient {
  id: string;
  firstName: string;
  lastName?: string;
  avatarColor: string;     // reuse the category palette for the avatar circle
}

interface Caregiver {
  id: string;
  firstName: string;
  lastName?: string;
  relationship?: string;   // "Parent" | "Support worker" | ...
  patientIds: string[];    // patients this caregiver can manage
}

interface AppSettings {
  notificationAlert: "none" | "15min" | "attime";
  startingPage: "calendar" | "all-tasks" | "categories";
  simpleMode: boolean;
  allowChangingDate: boolean;
  useCategories: boolean;
  showOverdue: boolean;
  onlyToday: boolean;
  allowCompleting: boolean;
  autoAddCompleted: boolean;
  autoPlaySounds: boolean;
  speechSpeed: number;
  taskIconSize: number;
  showCaregiverTags: boolean;   // caregiver portal: show the "Caregiver" chip on tasks
}

interface Step {
  id: number;
  title: string;
  description?: string;
  imageUrl?: string;
  mediaType: "photo" | "video" | "audio" | null;
  completed: boolean;
}

interface Schedule {
  repeat: RepeatInterval;
  startDate: string;
  startTime: string;
}

interface Task {
  id: number;
  title: string;
  steps: Step[];
  category?: string;
  schedule?: Schedule;
  photoUrl?: string;
  caregiverEdited?: boolean;   // added/edited by a caregiver — flagged for the patient
  skipped?: boolean;           // task skipped for now (shows in the Calendar "Skipped" tab)
}

interface DraftStep {
  id: number;
  title: string;
  description: string;
  mediaType: "photo" | "video" | "audio" | null;
}

interface Category {
  id: string;
  label: string;
  color: string;
}

// ── Constants ─────────────────────────────────────────────────────────

const CATEGORY_COLORS = [
  "#E8623A","#3DB8AD","#F5C842","#9B6DFF","#3B82F6",
  "#22C55E","#F97316","#EC4899","#1C1A2E","#D4183D",
];

const INITIAL_CATEGORIES: Category[] = [
  { id: "morning",  label: "Morning Routine", color: "#F5C842" },
  { id: "health",   label: "Health",          color: "#3DB8AD" },
  { id: "shopping", label: "Shopping",        color: "#9B6DFF" },
  { id: "work",     label: "Work",            color: "#3B82F6" },
  { id: "personal", label: "Personal",        color: "#E8623A" },
];

const INITIAL_TASKS: Task[] = [
  {
    id: 1, title: "Make Breakfast",
    category: "morning", schedule: { repeat: "daily", startDate: "2026-06-19", startTime: "07:30" },
    photoUrl: "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=600&h=300&fit=crop&auto=format",
    steps: [
      { id: 1, title: "Get eggs from fridge", imageUrl: "https://images.unsplash.com/photo-1506084868230-bb9d95c24759?w=600&h=400&fit=crop&auto=format", mediaType: "photo", completed: true },
      { id: 2, title: "Put bread in toaster", imageUrl: "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=600&h=400&fit=crop&auto=format", mediaType: "photo", completed: true },
      { id: 3, title: "Cook eggs in pan", imageUrl: "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=600&h=400&fit=crop&auto=format", mediaType: "video", completed: false },
      { id: 4, title: "Put food on plate", imageUrl: "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=600&h=400&fit=crop&auto=format", mediaType: "photo", completed: false },
    ],
  },
  {
    id: 2, title: "Take Medication",
    category: "health", schedule: { repeat: "daily", startDate: "2026-06-19", startTime: "08:00" },
    photoUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=300&fit=crop&auto=format",
    steps: [
      { id: 1, title: "Get pill organizer", imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=400&fit=crop&auto=format", mediaType: "photo", completed: false },
      { id: 2, title: "Open today's section", mediaType: "audio", completed: false },
      { id: 3, title: "Drink a full glass of water", imageUrl: "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=600&h=400&fit=crop&auto=format", mediaType: "photo", completed: false },
    ],
  },
  {
    id: 3, title: "Go for a Walk",
    category: "health", schedule: { repeat: "weekly", startDate: "2026-06-20", startTime: "09:00" },
    photoUrl: "https://images.unsplash.com/photo-1569336415962-a4bd9f69c0b4?w=600&h=300&fit=crop&auto=format",
    steps: [
      { id: 1, title: "Put on shoes", imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=400&fit=crop&auto=format", mediaType: "photo", completed: false },
      { id: 2, title: "Grab your water bottle", imageUrl: "https://images.unsplash.com/photo-1523362628745-0c100150b504?w=600&h=400&fit=crop&auto=format", mediaType: "photo", completed: false },
      { id: 3, title: "Walk to the park", imageUrl: "https://images.unsplash.com/photo-1569336415962-a4bd9f69c0b4?w=600&h=400&fit=crop&auto=format", mediaType: "video", completed: false },
    ],
  },
];

// ── Caregiver mock data ───────────────────────────────────────────────

const INITIAL_PATIENTS: Patient[] = [
  { id: "p-emma", firstName: "Emma", lastName: "Carter", avatarColor: "#9B6DFF" },
  { id: "p-liam", firstName: "Liam", lastName: "Brooks", avatarColor: "#3DB8AD" },
];

const EMMA_CATEGORIES: Category[] = [
  { id: "emma-morning", label: "Morning Routine", color: "#F5C842" },
  { id: "emma-health",  label: "Health",          color: "#3DB8AD" },
  { id: "emma-school",  label: "School",           color: "#3B82F6" },
];

const EMMA_TASKS: Task[] = [
  {
    id: 101, title: "Brush Teeth",
    category: "emma-morning", schedule: { repeat: "daily", startDate: "2026-06-20", startTime: "07:15" },
    steps: [
      { id: 1, title: "Put toothpaste on brush", mediaType: "photo", completed: true },
      { id: 2, title: "Brush for two minutes", mediaType: "photo", completed: false },
      { id: 3, title: "Rinse and put brush away", mediaType: "photo", completed: false },
    ],
  },
  {
    id: 102, title: "Pack School Bag", caregiverEdited: true,
    category: "emma-school", schedule: { repeat: "weekdays", startDate: "2026-06-22", startTime: "08:00" },
    photoUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&h=300&fit=crop&auto=format",
    steps: [
      { id: 1, title: "Put lunch box in bag", mediaType: "photo", completed: false },
      { id: 2, title: "Add water bottle", mediaType: "photo", completed: false },
      { id: 3, title: "Check homework folder", mediaType: "photo", completed: false },
    ],
  },
  {
    id: 103, title: "Take Vitamins",
    category: "emma-health", schedule: { repeat: "daily", startDate: "2026-06-20", startTime: "08:30" },
    steps: [
      { id: 1, title: "Get vitamin bottle", mediaType: "photo", completed: true },
      { id: 2, title: "Take one with water", mediaType: "audio", completed: true },
    ],
  },
];

const LIAM_CATEGORIES: Category[] = [
  { id: "liam-health",   label: "Health",   color: "#3DB8AD" },
  { id: "liam-personal", label: "Personal", color: "#E8623A" },
];

const LIAM_TASKS: Task[] = [
  {
    id: 201, title: "Take Medication",
    category: "liam-health", schedule: { repeat: "daily", startDate: "2026-06-20", startTime: "09:00" },
    photoUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=300&fit=crop&auto=format",
    steps: [
      { id: 1, title: "Get pill organizer", mediaType: "photo", completed: false },
      { id: 2, title: "Open today's section", mediaType: "audio", completed: false },
      { id: 3, title: "Drink a full glass of water", mediaType: "photo", completed: false },
    ],
  },
  {
    id: 202, title: "Tidy Bedroom", caregiverEdited: true,
    category: "liam-personal",
    steps: [
      { id: 1, title: "Make the bed", mediaType: "photo", completed: false },
      { id: 2, title: "Put clothes in basket", mediaType: "photo", completed: false },
    ],
  },
];

const INITIAL_PATIENT_DATA: Record<string, { tasks: Task[]; categories: Category[] }> = {
  self:     { tasks: INITIAL_TASKS, categories: INITIAL_CATEGORIES },
  "p-emma": { tasks: EMMA_TASKS,    categories: EMMA_CATEGORIES },
  "p-liam": { tasks: LIAM_TASKS,    categories: LIAM_CATEGORIES },
};

// ── Helpers ───────────────────────────────────────────────────────────

function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.88; u.pitch = 1.05;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    utterRef.current = u;
    window.speechSynthesis.speak(u);
  };
  const stop = () => { window.speechSynthesis.cancel(); setSpeaking(false); };
  useEffect(() => () => window.speechSynthesis.cancel(), []);
  return { speak, stop, speaking };
}

type TaskStatus = "done" | "overdue" | "todo" | "skipped";

function computeTaskStatus(task: Task, today: Date): TaskStatus {
  if (task.skipped) return "skipped";
  const total = task.steps.length;
  const done = task.steps.filter(s => s.completed).length;
  if (total > 0 && done === total) return "done";
  if (task.schedule) {
    const start = new Date(task.schedule.startDate + "T00:00:00");
    const tmid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (start < tmid) return "overdue";
  }
  return "todo";
}

const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  todo:    { label: "To Do",   color: "#E8623A" },
  overdue: { label: "Overdue", color: "#D4183D" },
  done:    { label: "Done",    color: "#3DB8AD" },
  skipped: { label: "Skipped", color: "#7A6F6A" },
};

// Gray chip shown on tasks that have been skipped.
function SkippedTag() {
  return (
    <span className="inline-flex items-center gap-1 px-2 h-5 rounded-full flex-shrink-0" style={{ background:"#ECE7E1" }}>
      <SkipForward size={10} style={{ color:"#7A6F6A" }} strokeWidth={2.5}/>
      <span className="text-[10px] font-black leading-none" style={{ color:"#7A6F6A", fontFamily:"Nunito, sans-serif" }}>Skipped</span>
    </span>
  );
}

// Small marker shown on tasks a caregiver created or edited, so both the
// caregiver and the patient can tell them apart from self-made tasks.
function CaregiverTag() {
  return (
    <span className="inline-flex items-center gap-1 px-2 h-5 rounded-full flex-shrink-0" style={{ background:"#EBF9F8" }}>
      <Heart size={10} style={{ color:"#3DB8AD" }} strokeWidth={2.5}/>
      <span className="text-[10px] font-black leading-none" style={{ color:"#3DB8AD", fontFamily:"Nunito, sans-serif" }}>Caregiver</span>
    </span>
  );
}

// Build a clinical/educational PDF by opening a styled report in a new window
// and triggering the browser's print → "Save as PDF". No PDF dependency needed.
const reportEsc = (s: string) => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

function printReport(docTitle: string, headerHtml: string, bodyHtml: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${reportEsc(docTitle)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1C1A2E;margin:0;padding:48px 56px;background:#fff}
    .head{display:flex;align-items:center;gap:16px;border-bottom:3px solid #E8623A;padding-bottom:18px;margin-bottom:24px}
    .avatar{width:54px;height:54px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;flex-shrink:0}
    h1{font-size:24px;margin:0} .sub{color:#7A6F6A;font-size:13px;margin-top:2px}
    .brand{margin-left:auto;text-align:right;color:#E8623A;font-weight:800;font-size:18px} .brand small{display:block;color:#7A6F6A;font-weight:600;font-size:11px}
    .cards{display:flex;gap:12px;margin:8px 0 28px}
    .card{flex:1;border:1px solid #eee;border-radius:14px;padding:14px 16px} .card .n{font-size:30px;font-weight:800} .card .l{font-size:12px;color:#7A6F6A;text-transform:uppercase;letter-spacing:.06em;font-weight:700}
    .bar{height:12px;background:#F5EDE0;border-radius:99px;overflow:hidden;margin:6px 0 4px} .bar > i{display:block;height:100%;background:#3DB8AD}
    h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#7A6F6A;margin:26px 0 10px}
    table{width:100%;border-collapse:collapse;font-size:13px} th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #eee} th{color:#7A6F6A;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
    .pill{color:#fff;font-weight:700;font-size:11px;padding:3px 9px;border-radius:99px} .tag{font-size:9px;font-weight:800;color:#3DB8AD;background:#EBF9F8;padding:2px 6px;border-radius:99px;vertical-align:middle}
    .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:7px;vertical-align:middle}
    .foot{margin-top:34px;color:#9b9089;font-size:11px;border-top:1px solid #eee;padding-top:12px}
    @media print{body{padding:24px 28px}}
  </style></head><body>
    ${headerHtml}
    ${bodyHtml}
    <div class="foot">This report summarises in-app task engagement for review purposes. Figures reflect the current session of the CanPlan 2.0 prototype.</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>
  </body></html>`;
  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) { alert("Please allow pop-ups to generate the report."); return; }
  win.document.write(html);
  win.document.close();
}

function reportHeader(title: string, subtitle: string, avatar?: { initials: string; color: string }) {
  const today = new Date();
  const generated = today.toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const av = avatar ? `<div class="avatar" style="background:${avatar.color}">${reportEsc(avatar.initials)}</div>` : "";
  return `<div class="head">${av}
    <div><h1>${reportEsc(title)}</h1><div class="sub">${reportEsc(subtitle)} · Generated ${reportEsc(generated)}</div></div>
    <div class="brand">CanPlan 2.0<small>Clinical / educational review</small></div>
  </div>`;
}

function patientTotals(tasks: Task[], today: Date) {
  const byStatus = { todo: 0, overdue: 0, done: 0, skipped: 0 };
  let totalSteps = 0, doneSteps = 0;
  tasks.forEach(t => {
    const st = computeTaskStatus(t, today);
    byStatus[st]++;
    if (st !== "skipped") {                 // skipped tasks are excluded from completion %
      totalSteps += t.steps.length;
      doneSteps += t.steps.filter(s => s.completed).length;
    }
  });
  const pct = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;
  return { byStatus, totalSteps, doneSteps, pct };
}

function openPatientReport(patient: Patient, tasks: Task[], categories: Category[]) {
  const today = new Date();
  const { byStatus, totalSteps, doneSteps, pct } = patientTotals(tasks, today);
  const rows = tasks.map(t => {
    const cat = categories.find(c => c.id === t.category);
    const d = t.steps.filter(s => s.completed).length;
    const st = computeTaskStatus(t, today);
    const sched = t.schedule ? `${REPEAT_LABELS[t.schedule.repeat]} · ${t.schedule.startTime}` : "Unscheduled";
    return `<tr>
      <td>${reportEsc(t.title)}${t.caregiverEdited ? ' <span class="tag">caregiver</span>' : ""}</td>
      <td>${cat ? reportEsc(cat.label) : "—"}</td>
      <td>${reportEsc(sched)}</td>
      <td>${d}/${t.steps.length}</td>
      <td><span class="pill" style="background:${STATUS_META[st].color}">${STATUS_META[st].label}</span></td>
    </tr>`;
  }).join("");
  const header = reportHeader(
    `${patient.firstName}${patient.lastName ? " " + patient.lastName : ""}`,
    "Task engagement report",
    { initials: (patient.firstName[0] + (patient.lastName?.[0] ?? "")).toUpperCase(), color: patient.avatarColor }
  );
  const body = `
    <div class="cards">
      <div class="card"><div class="n">${tasks.length}</div><div class="l">Tasks</div></div>
      <div class="card"><div class="n" style="color:#E8623A">${byStatus.todo}</div><div class="l">To Do</div></div>
      <div class="card"><div class="n" style="color:#D4183D">${byStatus.overdue}</div><div class="l">Overdue</div></div>
      <div class="card"><div class="n" style="color:#3DB8AD">${byStatus.done}</div><div class="l">Done</div></div>
      <div class="card"><div class="n" style="color:#7A6F6A">${byStatus.skipped}</div><div class="l">Skipped</div></div>
    </div>
    <h2>Overall step completion — ${pct}%</h2>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="sub">${doneSteps} of ${totalSteps} steps completed across all tasks</div>
    <h2>Task detail</h2>
    <table><thead><tr><th>Task</th><th>Category</th><th>Schedule</th><th>Steps</th><th>Status</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="color:#9b9089">No tasks recorded.</td></tr>'}</tbody></table>`;
  printReport(`CanPlan Report — ${patient.firstName}`, header, body);
}

function openAllPatientsReport(patients: Patient[], patientData: Record<string, { tasks: Task[]; categories: Category[] }>) {
  const today = new Date();
  const agg = { todo: 0, overdue: 0, done: 0, skipped: 0 };
  let allSteps = 0, allDone = 0, allTasks = 0;
  const rows = patients.map(p => {
    const tasks = patientData[p.id]?.tasks ?? [];
    const { byStatus, totalSteps, doneSteps, pct } = patientTotals(tasks, today);
    agg.todo += byStatus.todo; agg.overdue += byStatus.overdue; agg.done += byStatus.done; agg.skipped += byStatus.skipped;
    allSteps += totalSteps; allDone += doneSteps; allTasks += tasks.length;
    return `<tr>
      <td><span class="dot" style="background:${p.avatarColor}"></span>${reportEsc(p.firstName)}${p.lastName ? " " + reportEsc(p.lastName) : ""}</td>
      <td>${tasks.length}</td>
      <td style="color:#E8623A;font-weight:700">${byStatus.todo}</td>
      <td style="color:#D4183D;font-weight:700">${byStatus.overdue}</td>
      <td style="color:#3DB8AD;font-weight:700">${byStatus.done}</td>
      <td style="color:#7A6F6A;font-weight:700">${byStatus.skipped}</td>
      <td>${pct}%</td>
    </tr>`;
  }).join("");
  const pct = allSteps ? Math.round((allDone / allSteps) * 100) : 0;
  const header = reportHeader("All people", `${patients.length} ${patients.length === 1 ? "person" : "people"} supported`);
  const body = `
    <div class="cards">
      <div class="card"><div class="n">${patients.length}</div><div class="l">People</div></div>
      <div class="card"><div class="n">${allTasks}</div><div class="l">Tasks</div></div>
      <div class="card"><div class="n" style="color:#E8623A">${agg.todo}</div><div class="l">To Do</div></div>
      <div class="card"><div class="n" style="color:#D4183D">${agg.overdue}</div><div class="l">Overdue</div></div>
      <div class="card"><div class="n" style="color:#3DB8AD">${agg.done}</div><div class="l">Done</div></div>
      <div class="card"><div class="n" style="color:#7A6F6A">${agg.skipped}</div><div class="l">Skipped</div></div>
    </div>
    <h2>Combined step completion — ${pct}%</h2>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="sub">${allDone} of ${allSteps} steps completed across everyone</div>
    <h2>Per-person summary</h2>
    <table><thead><tr><th>Person</th><th>Tasks</th><th>To Do</th><th>Overdue</th><th>Done</th><th>Skipped</th><th>Complete</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" style="color:#9b9089">No people linked.</td></tr>'}</tbody></table>`;
  printReport("CanPlan Report — All people", header, body);
}

function TaskCard({ task, categories, onClick }: { task: Task; categories: Category[]; onClick: () => void }) {
  const done = task.steps.filter(s => s.completed).length;
  const total = task.steps.length;
  const allDone = total > 0 && done === total;
  const cat = categories.find(c => c.id === task.category);
  return (
    <button onClick={onClick}
      className="w-full bg-white rounded-[1.75rem] overflow-hidden text-left shadow-sm border border-black/[0.06] active:scale-[0.98] transition-transform">
      {task.photoUrl && (
        <div className="relative w-full" style={{ height:120 }}>
          <img src={task.photoUrl} alt={task.title} className="w-full h-full object-cover"/>
          {cat && <div className="absolute top-0 left-0 bottom-0 w-1.5" style={{ background:cat.color }}/>}
        </div>
      )}
      <div className="flex">
        {!task.photoUrl && cat && <div className="w-1.5 flex-shrink-0" style={{ background: cat.color }} />}
        <div className="flex-1 p-5">
          <p className="text-xl font-black text-[#1C1A2E] leading-snug" style={{ fontFamily: "Nunito, sans-serif" }}>{task.title}</p>
          {cat && <p className="text-xs font-semibold mt-0.5" style={{ color: cat.color, fontFamily: "DM Sans, sans-serif" }}>{cat.label}</p>}
          <p className="text-sm text-[#7A6F6A] mt-1 font-semibold" style={{ fontFamily: "DM Sans, sans-serif" }}>
            {total === 0 ? "No steps" : allDone ? "✓ Done!" : `${done} of ${total} steps done`}
          </p>
          {total > 0 && (
            <div className="mt-3 h-2.5 bg-[#F5EDE0] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width:`${(done/total)*100}%`, background: allDone?"#3DB8AD":"#E8623A" }} />
            </div>
          )}
        </div>
        <div className="flex items-center pr-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: allDone?"#EBF9F8":"#FEF0EB" }}>
            {allDone ? <Check size={18} style={{ color:"#3DB8AD" }} strokeWidth={3} /> : <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 5l4 4-4 4" stroke="#E8623A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── App ───────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  notificationAlert: "attime",
  startingPage: "calendar",
  simpleMode: false,
  allowChangingDate: true,
  useCategories: true,
  showOverdue: false,
  onlyToday: false,
  allowCompleting: true,
  autoAddCompleted: true,
  autoPlaySounds: false,
  speechSpeed: 50,
  taskIconSize: 50,
  showCaregiverTags: true,
};

export default function App() {
  // Task/category data is keyed by patient. The patient's own login uses "self";
  // a caregiver switches the active patient to manage their slice.
  const [patientData, setPatientData] = useState<Record<string, { tasks: Task[]; categories: Category[] }>>(INITIAL_PATIENT_DATA);
  const [patients, setPatients] = useState<Patient[]>(INITIAL_PATIENTS);
  const [role, setRole] = useState<SessionRole>(null);
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [activePatientId, setActivePatientId] = useState<string>("self");

  const tasks = patientData[activePatientId]?.tasks ?? [];
  const categories = patientData[activePatientId]?.categories ?? [];
  const setTasks = (updater: Task[] | ((prev: Task[]) => Task[])) =>
    setPatientData(prev => {
      const cur = prev[activePatientId] ?? { tasks: [], categories: [] };
      const next = typeof updater === "function" ? (updater as (p: Task[]) => Task[])(cur.tasks) : updater;
      return { ...prev, [activePatientId]: { ...cur, tasks: next } };
    });
  const setCategories = (updater: Category[] | ((prev: Category[]) => Category[])) =>
    setPatientData(prev => {
      const cur = prev[activePatientId] ?? { tasks: [], categories: [] };
      const next = typeof updater === "function" ? (updater as (p: Category[]) => Category[])(cur.categories) : updater;
      return { ...prev, [activePatientId]: { ...cur, categories: next } };
    });

  const [screen, setScreen] = useState<Screen>("welcome");
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [activeStepId, setActiveStepId] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [taskDetailSource, setTaskDetailSource] = useState<Screen>("all-tasks");
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [createSource, setCreateSource] = useState<Screen>("all-tasks");
  const [createDefaultCategory, setCreateDefaultCategory] = useState<string | undefined>(undefined);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const activeTask = tasks.find(t => t.id === activeTaskId) ?? null;
  const activeStep = activeTask?.steps.find(s => s.id === activeStepId) ?? null;
  const editingTask = editingTaskId != null ? (tasks.find(t => t.id === editingTaskId) ?? null) : null;

  const handleLogin = () => {
    setRole("patient");
    setActivePatientId("self");
    if (appSettings.simpleMode) setScreen(appSettings.startingPage as Screen);
    else setScreen("home");
  };

  const handleCaregiverLogin = () => {
    setRole("caregiver");
    setActivePatientId("self");
    if (!caregiver) setCaregiver({ id: "cg-1", firstName: "Sam", relationship: "Support worker", patientIds: patients.map(p => p.id) });
    setScreen("caregiver-home");
  };

  const signOut = () => { setRole(null); setActivePatientId("self"); setScreen("welcome"); };

  const openPatient = (id: string) => { setActivePatientId(id); setScreen("caregiver-overview"); };
  const exitToCaregiverHome = () => { setActivePatientId("self"); setScreen("caregiver-home"); };

  const addPatient = (firstName: string, lastName?: string) => {
    const id = "p-" + Date.now().toString(36);
    const color = CATEGORY_COLORS[patients.length % CATEGORY_COLORS.length];
    setPatients(prev => [...prev, { id, firstName, lastName, avatarColor: color }]);
    setPatientData(prev => ({ ...prev, [id]: { tasks: [], categories: [] } }));
    setCaregiver(prev => prev ? { ...prev, patientIds: [...prev.patientIds, id] } : prev);
  };

  // Back target for top-level screens. A caregiver managing a patient returns
  // to that patient's overview; otherwise to their dashboard.
  const goHomeBack = () => {
    if (role === "caregiver") setScreen(activePatientId !== "self" ? "caregiver-overview" : "caregiver-home");
    else setScreen(appSettings.simpleMode ? (appSettings.startingPage as Screen) : "home");
  };

  const toggleStep = (taskId: number, stepId: number) =>
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, steps: t.steps.map(s => s.id === stepId ? { ...s, completed: !s.completed } : s) } : t
    ));

  const toggleSkip = (taskId: number) =>
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, skipped: !t.skipped } : t));

  const openTask = (id: number, source: Screen = "all-tasks") => { setActiveTaskId(id); setTaskDetailSource(source); setScreen("task-detail"); };
  const openStep = (taskId: number, stepId: number) => { setActiveTaskId(taskId); setActiveStepId(stepId); setScreen("step-view"); };

  const saveTask = (task: Task) => {
    // Tasks created or edited by a caregiver are flagged so they can be marked.
    const tagged = role === "caregiver" ? { ...task, caregiverEdited: true } : task;
    if (editingTaskId != null) setTasks(prev => prev.map(t => t.id === tagged.id ? tagged : t));
    else setTasks(prev => [...prev, tagged]);
    setEditingTaskId(null); setCreateDefaultCategory(undefined); setScreen(createSource);
  };

  const deleteTask = (id: number) => setTasks(prev => prev.filter(t => t.id !== id));

  const addCategory = (label: string, color: string) =>
    setCategories(prev => [...prev, { id: Date.now().toString(), label, color }]);
  const updateCategory = (id: string, label: string, color: string) =>
    setCategories(prev => prev.map(c => c.id === id ? { ...c, label, color } : c));
  const deleteCategory = (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
    setTasks(prev => prev.map(t => t.category === id ? { ...t, category: undefined } : t));
    setScreen("categories");
  };

  const goToCreate = (source: Screen, defaultCat?: string, editId?: number) => {
    setCreateSource(source); setCreateDefaultCategory(defaultCat); setEditingTaskId(editId ?? null); setScreen("create");
  };


  // Caregivers always get the full management surface, regardless of the
  // patient's own simpleMode, and always see a Back button (never "home" mode).
  const isCaregiver = role === "caregiver";
  const effectiveSimpleMode = isCaregiver ? false : appSettings.simpleMode;
  const activePatient = patients.find(p => p.id === activePatientId) ?? null;
  const managing = isCaregiver && activePatientId !== "self" && !!activePatient;
  const bannerScreens: Screen[] = ["all-tasks","categories","category-detail","calendar","task-detail","create","settings"];
  const showBanner = managing && bannerScreens.includes(screen);

  return (
    <div className="size-full flex items-center justify-center bg-[#D6CBBF]">
      <div className="relative flex flex-col overflow-hidden"
        style={{ width:390, height:844, borderRadius:"3rem", background:"#FEF7EE", boxShadow:"0 40px 80px rgba(0,0,0,0.25)" }}>
        <div className="flex-shrink-0 h-12 flex items-center justify-between px-8 bg-[#FEF7EE]">
          <span className="text-sm font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>9:41</span>
          <div className="absolute left-1/2 -translate-x-1/2 w-28 h-6 rounded-full bg-[#1C1A2E]" style={{ top:8 }} />
          <div className="w-4 h-2.5 border-2 border-[#1C1A2E]/40 rounded-sm overflow-hidden"><div className="h-full bg-[#1C1A2E]/60 w-3/4" /></div>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col relative">
          {showBanner && activePatient && <ManagingBanner patient={activePatient} onExit={()=>setScreen("caregiver-overview")}/>}
          {screen==="welcome" && <WelcomeScreen onPatient={()=>setScreen("login")} onCaregiver={()=>setScreen("caregiver-login")}/>}
          {screen==="login" && <LoginScreen onLogin={handleLogin} onSignUp={()=>setScreen("signup")} onForgot={()=>setScreen("forgot-password")} onBack={()=>setScreen("welcome")}/>}
          {screen==="signup" && <SignUpScreen onBack={()=>setScreen("login")} onNext={()=>setScreen("verify-email")}/>}
          {screen==="verify-email" && <VerifyEmailScreen onVerified={()=>setScreen("signup-info")}/>}
          {screen==="signup-info" && <SignUpInfoScreen onDone={handleLogin}/>}
          {screen==="forgot-password" && <ForgotPasswordScreen onBack={()=>setScreen("login")}/>}
          {screen==="caregiver-login" && <CaregiverLoginScreen onLogin={handleCaregiverLogin} onForgot={()=>setScreen("caregiver-forgot")} onBack={()=>setScreen("welcome")}/>}
          {screen==="caregiver-forgot" && <CaregiverForgotScreen onBack={()=>setScreen("caregiver-login")}/>}
          {screen==="caregiver-home" && <CaregiverHomeScreen caregiver={caregiver} patients={patients} patientData={patientData} onOpenPatient={openPatient} onAddPatient={()=>setScreen("caregiver-add-patient")} onReportAll={()=>openAllPatientsReport(patients,patientData)} onSettings={()=>setScreen("settings")} onSignOut={signOut}/>}
          {screen==="caregiver-overview" && activePatient && <CaregiverOverviewScreen patient={activePatient} tasks={tasks} categories={categories} showCaregiverTags={appSettings.showCaregiverTags} onBack={exitToCaregiverHome} onManage={()=>setScreen("all-tasks")} onOpenTask={id=>openTask(id,"all-tasks")} onReport={()=>openPatientReport(activePatient,tasks,categories)}/>}
          {screen==="caregiver-add-patient" && <CaregiverAddPatientScreen onBack={()=>setScreen("caregiver-home")} onLink={(first,last)=>{addPatient(first,last);setScreen("caregiver-home");}}/>}
          {screen==="home" && <HomeScreen onAllTasks={()=>setScreen("all-tasks")} onCategories={()=>setScreen("categories")} onCalendar={()=>setScreen("calendar")} onSignOut={signOut} onSettings={()=>setScreen("settings")}/>}
          {screen==="all-tasks" && <AllTasksScreen tasks={tasks} categories={categories} showCaregiverTags={appSettings.showCaregiverTags} onBack={goHomeBack} onOpen={id=>openTask(id,"all-tasks")} onAdd={()=>goToCreate("all-tasks")} onEdit={id=>goToCreate("all-tasks",undefined,id)} onDelete={deleteTask} onReorder={setTasks} onSettings={()=>setScreen("settings")} simpleMode={effectiveSimpleMode} isHome={!isCaregiver&&appSettings.simpleMode&&appSettings.startingPage==="all-tasks"}/>}
          {screen==="categories" && <CategoriesScreen tasks={tasks} categories={categories} onBack={goHomeBack} onSelect={id=>{setActiveCategory(id);setScreen("category-detail");}} onAdd={addCategory} onEdit={updateCategory} onDelete={deleteCategory} simpleMode={effectiveSimpleMode} isHome={!isCaregiver&&appSettings.simpleMode&&appSettings.startingPage==="categories"} onSettings={()=>setScreen("settings")}/>}
          {screen==="category-detail" && activeCategory && <CategoryDetailScreen tasks={tasks} categories={categories} showCaregiverTags={appSettings.showCaregiverTags} categoryId={activeCategory} onBack={()=>setScreen("categories")} onOpen={id=>openTask(id,"category-detail")} onAddTask={()=>goToCreate("category-detail",activeCategory)} onEditTask={id=>goToCreate("category-detail",activeCategory,id)} onDeleteTask={deleteTask} simpleMode={effectiveSimpleMode} onReorderTasks={orderedIds=>{setTasks(prev=>{const positions=prev.reduce<number[]>((acc,t,i)=>{if(orderedIds.includes(t.id))acc.push(i);return acc;},[]);const ordered=orderedIds.map(id=>prev.find(t=>t.id===id)!);const result=[...prev];positions.forEach((pos,i)=>{result[pos]=ordered[i];});return result;});}}/>}
          {screen==="calendar" && <CalendarScreen tasks={tasks} categories={categories} showCaregiverTags={appSettings.showCaregiverTags} onBack={goHomeBack} onOpen={id=>openTask(id,"calendar")} onAddTask={()=>goToCreate("calendar")} simpleMode={effectiveSimpleMode} isHome={!isCaregiver&&appSettings.simpleMode&&appSettings.startingPage==="calendar"} onSettings={()=>setScreen("settings")}/>}
          {screen==="settings" && <SettingsScreen settings={appSettings} onUpdate={s=>setAppSettings(s)} onBack={goHomeBack} caregiverMode={isCaregiver} caregiverInfo={caregiver}/>}
          {screen==="create" && <CreateScreen categories={categories} defaultCategory={createDefaultCategory} initialTask={editingTask??undefined} onBack={()=>{setEditingTaskId(null);setScreen(createSource);}} onSave={saveTask}/>}
          {screen==="task-detail" && activeTask && <TaskDetail task={activeTask} categories={categories} hideAudio={isCaregiver} showCaregiverTags={appSettings.showCaregiverTags} onBack={()=>setScreen(taskDetailSource)} onStepTap={stepId=>openStep(activeTask.id,stepId)} onToggle={stepId=>toggleStep(activeTask.id,stepId)} onSkip={()=>toggleSkip(activeTask.id)}/>}
          {screen==="step-view" && activeTask && activeStep && (
            <StepView task={activeTask} step={activeStep} stepIndex={activeTask.steps.findIndex(s=>s.id===activeStep.id)} totalSteps={activeTask.steps.length}
              autoPlaySounds={appSettings.autoPlaySounds} hideAudio={isCaregiver}
              onBack={()=>{const idx=activeTask.steps.findIndex(s=>s.id===activeStep.id);const prev=activeTask.steps[idx-1];if(prev)setActiveStepId(prev.id);else setScreen("task-detail");}}
              onToggle={()=>{toggleStep(activeTask.id,activeStep.id);setScreen("task-detail");}}
              onNext={()=>{const idx=activeTask.steps.findIndex(s=>s.id===activeStep.id);const next=activeTask.steps[idx+1];if(!activeStep.completed)toggleStep(activeTask.id,activeStep.id);if(next)setActiveStepId(next.id);else setScreen("task-detail");}}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Home ──────────────────────────────────────────────────────────────

function HomeScreen({ onAllTasks, onCategories, onCalendar, onSignOut, onSettings }: {
  onAllTasks:()=>void; onCategories:()=>void; onCalendar:()=>void; onSignOut:()=>void; onSettings:()=>void;
}) {
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const today = new Date().toLocaleDateString("en-CA",{weekday:"long",month:"long",day:"numeric"});
  const sections = [
    { label:"All Tasks",  sub:"View and manage all your tasks",  onPress:onAllTasks },
    { label:"Categories", sub:"Browse tasks by category",        onPress:onCategories },
    { label:"Calendar",   sub:"See your scheduled tasks",        onPress:onCalendar },
  ];
  return (
    <div className="flex-1 overflow-y-auto px-6 pt-5 pb-8">
      <div className="flex items-center justify-between mb-1">
        <p className="text-base text-[#7A6F6A] font-semibold" style={{ fontFamily:"DM Sans, sans-serif" }}>{today}</p>
        <div className="flex items-center gap-2">
          <button onClick={onSettings} className="w-9 h-9 rounded-xl bg-[#F5EDE0] flex items-center justify-center active:scale-90 transition-all">
            <Settings size={17} className="text-[#7A6F6A]"/>
          </button>
          <button onClick={()=>setConfirmSignOut(true)} className="px-3 py-1.5 rounded-xl bg-[#F5EDE0] text-[#7A6F6A] hover:bg-[#FEE8E8] hover:text-[#D4183D] transition-all text-xs font-bold" style={{ fontFamily:"Nunito, sans-serif" }}>Sign out</button>
        </div>
      </div>
      <h1 className="text-4xl font-black text-[#1C1A2E] leading-tight mt-3 mb-1" style={{ fontFamily:"Nunito, sans-serif" }}>Hi Alex!</h1>
      <p className="text-base text-[#7A6F6A] font-semibold mb-8" style={{ fontFamily:"DM Sans, sans-serif" }}>{"What would you like to do today?"}</p>
      <div className="space-y-4">
        {sections.map(({label,sub,onPress})=>(
          <button key={label} onClick={onPress} className="w-full rounded-[1.75rem] p-6 flex items-center gap-5 text-left active:scale-[0.98] transition-transform shadow-sm" style={{ background:"linear-gradient(135deg,#E8623A,#F07B3A)" }}>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-black text-white" style={{ fontFamily:"Nunito, sans-serif" }}>{label}</p>
              <p className="text-white/75 text-sm font-semibold mt-0.5" style={{ fontFamily:"DM Sans, sans-serif" }}>{sub}</p>
            </div>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M9 5l6 6-6 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        ))}
      </div>
      {confirmSignOut && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background:"rgba(0,0,0,0.4)" }}>
          <div className="w-full bg-white rounded-t-[2rem] p-6 space-y-4" style={{ maxWidth:390 }}>
            <p className="text-2xl font-black text-[#1C1A2E] text-center" style={{ fontFamily:"Nunito, sans-serif" }}>Sign out?</p>
            <p className="text-base text-[#7A6F6A] text-center" style={{ fontFamily:"DM Sans, sans-serif" }}>You will need to sign in again next time.</p>
            <button onClick={()=>{setConfirmSignOut(false);onSignOut();}} className="w-full py-4 rounded-2xl font-black text-lg text-white active:scale-[0.98]" style={{ background:"#D4183D", fontFamily:"Nunito, sans-serif" }}>Yes, sign out</button>
            <button onClick={()=>setConfirmSignOut(false)} className="w-full py-4 rounded-2xl font-black text-lg text-[#1C1A2E] bg-[#F5EDE0] active:scale-[0.98]" style={{ fontFamily:"Nunito, sans-serif" }}>Stay signed in</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── All Tasks ─────────────────────────────────────────────────────────

function AllTasksScreen({ tasks, categories, showCaregiverTags=true, onBack, onOpen, onAdd, onEdit, onDelete, onReorder, onSettings, simpleMode, isHome }: {
  tasks:Task[]; categories:Category[]; showCaregiverTags?:boolean; onBack:()=>void; onOpen:(id:number)=>void; onAdd:()=>void; onEdit:(id:number)=>void; onDelete:(id:number)=>void; onReorder:(t:Task[])=>void; onSettings:()=>void; simpleMode:boolean; isHome:boolean;
}) {
  const [reordering, setReordering] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number|null>(null);
  const moveUp=(idx:number)=>{if(idx===0)return;const a=[...tasks];[a[idx-1],a[idx]]=[a[idx],a[idx-1]];onReorder(a);};
  const moveDown=(idx:number)=>{if(idx===tasks.length-1)return;const a=[...tasks];[a[idx],a[idx+1]]=[a[idx+1],a[idx]];onReorder(a);};
  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="flex-shrink-0 flex items-center gap-2 px-5 pt-4 pb-3 bg-[#FEF7EE]">
        {!isHome&&<button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center shadow-sm flex-shrink-0"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>}
        <h1 className="text-2xl font-black text-[#1C1A2E] flex-1 min-w-0" style={{ fontFamily:"Nunito, sans-serif" }}>All Tasks</h1>
        {!simpleMode&&tasks.length>1&&(
          <button onClick={()=>{setReordering(r=>!r);setConfirmDeleteId(null);}} className="px-3 h-10 rounded-2xl font-bold text-sm transition-all flex-shrink-0"
            style={{ background:reordering?"#E8623A":"#F5EDE0", color:reordering?"white":"#7A6F6A", fontFamily:"Nunito, sans-serif" }}>
            {reordering?"Done":"Reorder"}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-6 space-y-3">
        {tasks.map((task,idx)=>{
          const cat=categories.find(c=>c.id===task.category);
          const done=task.steps.filter(s=>s.completed).length;
          const total=task.steps.length;
          const allDone=total>0&&done===total;
          const isConfirming=confirmDeleteId===task.id;

          if(reordering) return (
            <div key={task.id} className="bg-white rounded-[1.5rem] overflow-hidden flex items-center border border-black/[0.06] shadow-sm">
              {cat&&<div className="w-1.5 self-stretch flex-shrink-0" style={{ background:cat.color }}/>}
              <div className="flex-1 min-w-0 px-4 py-3">
                <p className="text-lg font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>{task.title}</p>
                {cat&&<p className="text-xs font-semibold mt-0.5" style={{ color:cat.color, fontFamily:"DM Sans, sans-serif" }}>{cat.label}</p>}
                <p className="text-sm text-[#7A6F6A]" style={{ fontFamily:"DM Sans, sans-serif" }}>{done}/{total} steps</p>
              </div>
              <div className="flex flex-col gap-1.5 pr-3">
                <button onClick={()=>moveUp(idx)} disabled={idx===0} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:"#FEF0EB", opacity:idx===0?0.35:1 }}><ChevronUp size={18} style={{ color:"#E8623A" }}/></button>
                <button onClick={()=>moveDown(idx)} disabled={idx===tasks.length-1} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:"#FEF0EB", opacity:idx===tasks.length-1?0.35:1 }}><ChevronDown size={18} style={{ color:"#E8623A" }}/></button>
              </div>
            </div>
          );

          return (
            <div key={task.id} className="bg-white rounded-[1.75rem] border border-black/[0.06] shadow-sm overflow-hidden">
              {isConfirming?(
                <div className="p-5 space-y-3">
                  <p className="text-base font-black text-[#1C1A2E] text-center" style={{ fontFamily:"Nunito, sans-serif" }}>Delete "{task.title}"?</p>
                  <p className="text-sm text-[#7A6F6A] text-center" style={{ fontFamily:"DM Sans, sans-serif" }}>This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button onClick={()=>setConfirmDeleteId(null)} className="flex-1 py-3 rounded-2xl font-black text-base bg-[#F5EDE0] text-[#1C1A2E] active:scale-95" style={{ fontFamily:"Nunito, sans-serif" }}>Cancel</button>
                    <button onClick={()=>{onDelete(task.id);setConfirmDeleteId(null);}} className="flex-1 py-3 rounded-2xl font-black text-base text-white active:scale-95" style={{ background:"#D4183D", fontFamily:"Nunito, sans-serif" }}>Delete</button>
                  </div>
                </div>
              ):(
                <>
                  <button onClick={()=>onOpen(task.id)} className="w-full text-left">
                    {task.photoUrl&&(
                      <div className="relative w-full" style={{ height:110 }}>
                        <img src={task.photoUrl} alt={task.title} className="w-full h-full object-cover"/>
                        {cat&&<div className="absolute top-0 left-0 bottom-0 w-1.5" style={{ background:cat.color }}/>}
                      </div>
                    )}
                    <div className="flex items-center">
                      {!task.photoUrl&&cat&&<div className="w-1.5 self-stretch flex-shrink-0" style={{ background:cat.color }}/>}
                      <div className="flex-1 p-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xl font-black text-[#1C1A2E] leading-snug" style={{ fontFamily:"Nunito, sans-serif" }}>{task.title}</p>
                          {task.caregiverEdited&&showCaregiverTags&&<CaregiverTag/>}{task.skipped&&<SkippedTag/>}
                        </div>
                        {cat&&<p className="text-xs font-semibold mt-0.5" style={{ color:cat.color, fontFamily:"DM Sans, sans-serif" }}>{cat.label}</p>}
                        <p className="text-sm text-[#7A6F6A] mt-1 font-semibold" style={{ fontFamily:"DM Sans, sans-serif" }}>
                          {total===0?"No steps":allDone?"✓ Done!":`${done} of ${total} steps done`}
                        </p>
                        {total>0&&<div className="mt-2 h-2 bg-[#F5EDE0] rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width:`${(done/total)*100}%`, background:allDone?"#3DB8AD":"#E8623A" }}/></div>}
                      </div>
                      <div className="flex items-center pr-4">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background:allDone?"#EBF9F8":"#FEF0EB" }}>
                          {allDone?<Check size={18} style={{ color:"#3DB8AD" }} strokeWidth={3}/>:<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 5l4 4-4 4" stroke="#E8623A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                      </div>
                    </div>
                  </button>
                  {!simpleMode&&(
                    <div className="flex border-t border-[#F5EDE0]">
                      <button onClick={()=>onEdit(task.id)} className="flex-1 py-3 text-sm font-black text-[#E8623A] active:bg-[#FEF0EB] transition-colors border-r border-[#F5EDE0]" style={{ fontFamily:"Nunito, sans-serif" }}>Edit Task</button>
                      <button onClick={()=>setConfirmDeleteId(task.id)} className="flex-1 py-3 text-sm font-black text-[#D4183D] active:bg-[#FEE8E8] transition-colors" style={{ fontFamily:"Nunito, sans-serif" }}>Delete Task</button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
        {!reordering&&!simpleMode&&(
          <button onClick={onAdd} className="w-full py-5 rounded-[1.75rem] border-2 border-dashed border-[#E8623A]/40 flex items-center justify-center gap-3 text-[#E8623A] font-black text-lg hover:border-[#E8623A]/70 hover:bg-[#E8623A]/5 transition-all active:scale-[0.98]" style={{ fontFamily:"Nunito, sans-serif" }}>
            <Plus size={22} strokeWidth={3}/> Add a task
          </button>
        )}
        {/* bottom-right: gear always + Home pill in simple mode */}
        <div style={{ height: 56 }}/>
      </div>
      <button onClick={onSettings} className="absolute w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-all"
        style={{ bottom:20, right:20, background:"#1C1A2E" }}>
        <Settings size={20} className="text-white"/>
      </button>
    </div>
  );
}

// ── Categories ────────────────────────────────────────────────────────

function CategoriesScreen({ tasks, categories, onBack, onSelect, onAdd, onEdit, onDelete, onSettings, simpleMode, isHome }: {
  tasks:Task[]; categories:Category[]; onBack:()=>void; onSelect:(id:string)=>void;
  onAdd:(label:string,color:string)=>void; onEdit:(id:string,label:string,color:string)=>void; onDelete:(id:string)=>void;
  onSettings:()=>void; simpleMode:boolean; isHome:boolean;
}) {
  const [addOpen,setAddOpen]=useState(false);
  const [editCat,setEditCat]=useState<Category|null>(null);
  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-4 pb-3">
        {!isHome&&<button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center shadow-sm"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>}
        <h1 className="text-2xl font-black text-[#1C1A2E] flex-1" style={{ fontFamily:"Nunito, sans-serif" }}>Categories</h1>
      </div>
      <div className="flex-1 overflow-y-auto pb-6">
        <div className="mx-5 bg-white rounded-[1.75rem] border border-black/[0.06] shadow-sm overflow-hidden">
          {categories.map((cat,idx)=>{
            const count=tasks.filter(t=>t.category===cat.id).length;
            return (
              <div key={cat.id}>
                {idx>0&&<div className="h-px bg-[#F5EDE0] mx-4"/>}
                <div className="flex items-center">
                  <button onClick={()=>onSelect(cat.id)} className="flex-1 flex items-center gap-4 px-5 py-4 text-left active:bg-[#FEF7EE] transition-colors">
                    <div className="w-3 h-10 rounded-full flex-shrink-0" style={{ background:cat.color }}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>{cat.label}</p>
                      <p className="text-sm text-[#7A6F6A] font-semibold" style={{ fontFamily:"DM Sans, sans-serif" }}>{count} task{count!==1?"s":""}</p>
                    </div>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 5l4 4-4 4" stroke="#C9BDB5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  {!simpleMode&&<button onClick={()=>setEditCat(cat)} className="flex-shrink-0 px-4 py-4 text-sm font-black text-[#E8623A] border-l border-[#F5EDE0] active:bg-[#FEF0EB] transition-colors" style={{ fontFamily:"Nunito, sans-serif" }}>Edit</button>}
                </div>
              </div>
            );
          })}
        </div>
        {(()=>{const n=tasks.filter(t=>!t.category).length;return n>0?(
          <div className="mx-5 mt-3 bg-white rounded-[1.75rem] border border-black/[0.06] shadow-sm overflow-hidden">
            <button onClick={()=>onSelect("__none__")} className="w-full flex items-center gap-4 px-5 py-4 text-left active:bg-[#FEF7EE] transition-colors">
              <div className="w-3 h-10 rounded-full flex-shrink-0 bg-[#C9BDB5]"/>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>No Category</p>
                <p className="text-sm text-[#7A6F6A] font-semibold" style={{ fontFamily:"DM Sans, sans-serif" }}>{n} task{n!==1?"s":""}</p>
              </div>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 5l4 4-4 4" stroke="#C9BDB5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        ):null;})()}
        {!simpleMode&&(
          <div className="px-5 mt-4">
            <button onClick={()=>setAddOpen(true)} className="w-full py-5 rounded-[1.75rem] border-2 border-dashed border-[#E8623A]/40 flex items-center justify-center gap-3 text-[#E8623A] font-black text-lg hover:border-[#E8623A]/70 hover:bg-[#E8623A]/5 transition-all active:scale-[0.98]" style={{ fontFamily:"Nunito, sans-serif" }}>
              <Plus size={22} strokeWidth={3}/> Add Category
            </button>
          </div>
        )}
      </div>
      {addOpen&&<CategoryFormSheet title="Add Category" onClose={()=>setAddOpen(false)} onSave={(l,c)=>{onAdd(l,c);setAddOpen(false);}}/>}
      {!simpleMode&&editCat&&<CategoryFormSheet title="Edit Category" initial={editCat} onClose={()=>setEditCat(null)} onSave={(l,c)=>{onEdit(editCat.id,l,c);setEditCat(null);}} onDelete={()=>{onDelete(editCat.id);setEditCat(null);}}/>}
      {isHome&&(
        <button onClick={onSettings} className="absolute w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-all"
          style={{ bottom:20, right:20, background:"#1C1A2E" }}>
          <Settings size={20} className="text-white"/>
        </button>
      )}
    </div>
  );
}

// ── Category Form Sheet ───────────────────────────────────────────────

function CategoryFormSheet({ title, initial, onClose, onSave, onDelete }: {
  title:string; initial?:Category; onClose:()=>void; onSave:(label:string,color:string)=>void; onDelete?:()=>void;
}) {
  const [label,setLabel]=useState(initial?.label??"");
  const [color,setColor]=useState(initial?.color??CATEGORY_COLORS[0]);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const canSave=label.trim();
  return (
    <div className="absolute inset-0 z-50 flex items-end" style={{ background:"rgba(0,0,0,0.5)" }}>
      <div className="w-full bg-[#FEF7EE] rounded-t-[2rem]">
        <div className="flex justify-center pt-3 pb-2"><div className="w-12 h-1.5 rounded-full bg-[#C9BDB5]"/></div>
        <div className="flex items-center justify-between px-5 pb-4">
          <button onClick={onClose} className="text-base font-bold text-[#D4183D]" style={{ fontFamily:"Nunito, sans-serif" }}>Cancel</button>
          <p className="text-lg font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>{title}</p>
          <button onClick={()=>canSave&&onSave(label.trim(),color)} disabled={!canSave} className="text-base font-black" style={{ color:canSave?"#E8623A":"#C9BDB5", fontFamily:"Nunito, sans-serif" }}>{initial?"Update":"Add"}</button>
        </div>
        <div className="px-5 pb-8 space-y-4">
          <div className="bg-white rounded-[1.5rem] p-4 border border-black/[0.06]">
            <p className="text-xs font-bold text-[#7A6F6A] uppercase tracking-widest mb-2" style={{ fontFamily:"DM Sans, sans-serif" }}>Category name</p>
            <input type="text" value={label} onChange={e=>setLabel(e.target.value)} placeholder="e.g. Morning Routine" autoFocus
              className="w-full text-xl font-black text-[#1C1A2E] bg-transparent outline-none placeholder:text-[#C9BDB5]" style={{ fontFamily:"Nunito, sans-serif" }}/>
          </div>
          <div className="bg-white rounded-[1.5rem] p-4 border border-black/[0.06]">
            <div className="flex items-center gap-3 mb-3">
              <p className="text-xs font-bold text-[#7A6F6A] uppercase tracking-widest flex-1" style={{ fontFamily:"DM Sans, sans-serif" }}>Colour</p>
              <div className="w-8 h-8 rounded-xl" style={{ background:color }}/>
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map(c=>(
                <button key={c} onClick={()=>setColor(c)} className="w-10 h-10 rounded-2xl transition-all active:scale-90"
                  style={{ background:c, outline:color===c?`3px solid ${c}`:"none", outlineOffset:3, transform:color===c?"scale(1.1)":undefined }}/>
              ))}
            </div>
          </div>
          {onDelete&&!confirmDelete&&<button onClick={()=>setConfirmDelete(true)} className="w-full py-4 rounded-[1.75rem] font-black text-lg text-[#D4183D] bg-[#FEE8E8] active:scale-[0.98]" style={{ fontFamily:"Nunito, sans-serif" }}>Delete Category</button>}
          {confirmDelete&&(
            <div className="space-y-2">
              <p className="text-center text-sm text-[#7A6F6A] font-semibold" style={{ fontFamily:"DM Sans, sans-serif" }}>Tasks in this category will become uncategorised.</p>
              <button onClick={onDelete} className="w-full py-4 rounded-[1.75rem] font-black text-lg text-white active:scale-[0.98]" style={{ background:"#D4183D", fontFamily:"Nunito, sans-serif" }}>Yes, delete category</button>
              <button onClick={()=>setConfirmDelete(false)} className="w-full py-4 rounded-[1.75rem] font-black text-lg text-[#1C1A2E] bg-[#F5EDE0] active:scale-[0.98]" style={{ fontFamily:"Nunito, sans-serif" }}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Category Detail ───────────────────────────────────────────────────

function CategoryDetailScreen({ tasks, categories, showCaregiverTags=true, categoryId, onBack, onOpen, onAddTask, onEditTask, onDeleteTask, onReorderTasks, simpleMode }: {
  tasks:Task[]; categories:Category[]; showCaregiverTags?:boolean; categoryId:string; onBack:()=>void; onOpen:(id:number)=>void;
  onAddTask:()=>void; onEditTask:(id:number)=>void; onDeleteTask:(id:number)=>void; onReorderTasks:(orderedIds:number[])=>void; simpleMode:boolean;
}) {
  const cat=categories.find(c=>c.id===categoryId);
  const filtered=categoryId==="__none__"?tasks.filter(t=>!t.category):tasks.filter(t=>t.category===categoryId);
  const [confirmDeleteId,setConfirmDeleteId]=useState<number|null>(null);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-2 px-5 pt-4 pb-5" style={{ background:cat?cat.color+"22":"#F5EDE0" }}>
        <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white/80 border border-black/[0.08] flex items-center justify-center shadow-sm flex-shrink-0"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>
        {cat&&<div className="w-3 h-10 rounded-full flex-shrink-0" style={{ background:cat.color }}/>}
        <h1 className="text-2xl font-black text-[#1C1A2E] flex-1 min-w-0 truncate" style={{ fontFamily:"Nunito, sans-serif" }}>{cat?cat.label:"No Category"}</h1>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6 space-y-3">
        {filtered.length===0?(
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>No tasks here yet</p>
            <p className="text-sm text-[#7A6F6A] mt-1" style={{ fontFamily:"DM Sans, sans-serif" }}>Tap "Add Task" to create one</p>
          </div>
        ):filtered.map((task,idx)=>{
          const done=task.steps.filter(s=>s.completed).length;
          const total=task.steps.length;
          const allDone=total>0&&done===total;
          const isConfirming=confirmDeleteId===task.id;

          return (
            <div key={task.id} className="bg-white rounded-[1.75rem] border border-black/[0.06] shadow-sm overflow-hidden">
              {isConfirming?(
                <div className="p-5 space-y-3">
                  <p className="text-base font-black text-[#1C1A2E] text-center" style={{ fontFamily:"Nunito, sans-serif" }}>Delete "{task.title}"?</p>
                  <p className="text-sm text-[#7A6F6A] text-center" style={{ fontFamily:"DM Sans, sans-serif" }}>This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button onClick={()=>setConfirmDeleteId(null)} className="flex-1 py-3 rounded-2xl font-black text-base bg-[#F5EDE0] text-[#1C1A2E] active:scale-95" style={{ fontFamily:"Nunito, sans-serif" }}>Cancel</button>
                    <button onClick={()=>{onDeleteTask(task.id);setConfirmDeleteId(null);}} className="flex-1 py-3 rounded-2xl font-black text-base text-white active:scale-95" style={{ background:"#D4183D", fontFamily:"Nunito, sans-serif" }}>Delete</button>
                  </div>
                </div>
              ):(
                <>
                  <button onClick={()=>onOpen(task.id)} className="w-full flex items-center text-left">
                    {cat&&<div className="w-1.5 self-stretch flex-shrink-0" style={{ background:cat.color }}/>}
                    <div className="flex-1 p-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-lg font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>{task.title}</p>
                        {task.caregiverEdited&&showCaregiverTags&&<CaregiverTag/>}{task.skipped&&<SkippedTag/>}
                      </div>
                      <p className="text-sm text-[#7A6F6A] font-semibold mt-0.5" style={{ fontFamily:"DM Sans, sans-serif" }}>{total===0?"No steps":allDone?"✓ Done!":`${done} of ${total} steps done`}</p>
                      {total>0&&<div className="mt-2 h-2 bg-[#F5EDE0] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width:`${(done/total)*100}%`, background:allDone?"#3DB8AD":"#E8623A" }}/></div>}
                    </div>
                  </button>
                  {!simpleMode&&(
                    <div className="flex border-t border-[#F5EDE0]">
                      <button onClick={()=>onEditTask(task.id)} className="flex-1 py-3 text-sm font-black text-[#E8623A] active:bg-[#FEF0EB] transition-colors border-r border-[#F5EDE0]" style={{ fontFamily:"Nunito, sans-serif" }}>Edit Task</button>
                      <button onClick={()=>setConfirmDeleteId(task.id)} className="flex-1 py-3 text-sm font-black text-[#D4183D] active:bg-[#FEE8E8] transition-colors" style={{ fontFamily:"Nunito, sans-serif" }}>Delete Task</button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
        {!simpleMode&&(
          <button onClick={onAddTask} className="w-full py-5 rounded-[1.75rem] border-2 border-dashed border-[#E8623A]/40 flex items-center justify-center gap-3 text-[#E8623A] font-black text-lg hover:border-[#E8623A]/70 hover:bg-[#E8623A]/5 transition-all active:scale-[0.98]" style={{ fontFamily:"Nunito, sans-serif" }}>
            <Plus size={22} strokeWidth={3}/> Add Task
          </button>
        )}
      </div>
    </div>
  );
}

// ── Calendar ──────────────────────────────────────────────────────────

type CalTab = "todo"|"overdue"|"done"|"skipped";

function CalendarScreen({ tasks, categories, showCaregiverTags=true, onBack, onOpen, onAddTask, onSettings, simpleMode, isHome }: {
  tasks:Task[]; categories:Category[]; showCaregiverTags?:boolean; onBack:()=>void; onOpen:(id:number)=>void; onAddTask:()=>void; onSettings:()=>void; simpleMode:boolean; isHome:boolean;
}) {
  const today=new Date();
  const [viewYear,setViewYear]=useState(today.getFullYear());
  const [viewMonth,setViewMonth]=useState(today.getMonth());
  const [selectedDay,setSelectedDay]=useState(today.getDate());
  const [calTab,setCalTab]=useState<CalTab>("todo");
  const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAYS=["Su","Mo","Tu","We","Th","Fr","Sa"];
  const firstDay=new Date(viewYear,viewMonth,1).getDay();
  const daysInMonth=new Date(viewYear,viewMonth+1,0).getDate();
  const prevMonth=()=>{if(viewMonth===0){setViewYear(y=>y-1);setViewMonth(11);}else setViewMonth(m=>m-1);setSelectedDay(1);};
  const nextMonth=()=>{if(viewMonth===11){setViewYear(y=>y+1);setViewMonth(0);}else setViewMonth(m=>m+1);setSelectedDay(1);};
  const daysWithTasks=new Set<number>();
  tasks.forEach(t=>{
    if(!t.schedule)return;
    const start=new Date(t.schedule.startDate+"T00:00:00");
    const r=t.schedule.repeat;
    if(r==="daily"||r==="weekdays"||r==="weekends"){for(let i=1;i<=daysInMonth;i++)daysWithTasks.add(i);}
    else if(start.getFullYear()===viewYear&&start.getMonth()===viewMonth)daysWithTasks.add(start.getDate());
  });
  const selStr=`${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(selectedDay).padStart(2,"0")}`;
  const selDate=new Date(selStr+"T00:00:00");
  const todayMidnight=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const isSelectedPast=selDate<todayMidnight;
  const dayTasks=tasks.filter(t=>{
    if(!t.schedule)return false;
    const start=new Date(t.schedule.startDate+"T00:00:00");
    const sel=selDate;
    const r=t.schedule.repeat;
    if(r==="none")return t.schedule.startDate===selStr;
    if(r==="daily")return sel>=start;
    if(r==="weekly")return sel>=start&&sel.getDay()===start.getDay();
    if(r==="monthly")return sel>=start&&sel.getDate()===start.getDate();
    if(r==="weekdays")return sel>=start&&sel.getDay()>=1&&sel.getDay()<=5;
    if(r==="weekends")return sel>=start&&(sel.getDay()===0||sel.getDay()===6);
    if(r==="yearly")return sel>=start&&sel.getDate()===start.getDate()&&sel.getMonth()===start.getMonth();
    return false;
  });
  const isToday=(d:number)=>viewYear===today.getFullYear()&&viewMonth===today.getMonth()&&d===today.getDate();

  const allDone=(t:Task)=>t.steps.length>0&&t.steps.every(s=>s.completed);
  const tabTasks: Record<CalTab,Task[]>={
    overdue: dayTasks.filter(t=>!t.skipped&&isSelectedPast&&!allDone(t)),
    todo:    dayTasks.filter(t=>!t.skipped&&!isSelectedPast&&!allDone(t)),
    done:    dayTasks.filter(t=>!t.skipped&&allDone(t)),
    skipped: dayTasks.filter(t=>t.skipped),
  };
  // auto-switch tab based on selected day
  const displayTab: CalTab = calTab==="overdue"&&!isSelectedPast ? "todo"
    : calTab==="todo"&&isSelectedPast ? "overdue"
    : calTab;
  const visibleTasks=tabTasks[displayTab];

  const TAB_CONFIG: {key:CalTab; label:string; color:string}[]=[
    {key:"overdue", label:"Overdue", color:"#D4183D"},
    {key:"todo",    label:"To Do",   color:"#E8623A"},
    {key:"done",    label:"Done",    color:"#3DB8AD"},
    {key:"skipped", label:"Skipped", color:"#7A6F6A"},
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-4 pb-3">
        {!isHome&&<button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center shadow-sm flex-shrink-0"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>}
        <h1 className="text-2xl font-black text-[#1C1A2E] flex-1" style={{ fontFamily:"Nunito, sans-serif" }}>Calendar</h1>
        {!simpleMode&&(
          <button onClick={onAddTask} className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0 active:scale-90 transition-all" style={{ background:"linear-gradient(135deg,#E8623A,#F07B3A)" }}>
            <Plus size={22} className="text-white" strokeWidth={3}/>
          </button>
        )}
      </div>
      <div className="flex-shrink-0 flex items-center justify-between px-5 pb-2">
        <button onClick={prevMonth} className="w-10 h-10 rounded-2xl bg-[#F5EDE0] flex items-center justify-center"><ChevronLeft size={20} style={{ color:"#E8623A" }}/></button>
        <p className="text-xl font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>{MONTHS[viewMonth]} {viewYear}</p>
        <button onClick={nextMonth} className="w-10 h-10 rounded-2xl bg-[#F5EDE0] flex items-center justify-center"><ChevronRight size={20} style={{ color:"#E8623A" }}/></button>
      </div>
      <div className="flex-shrink-0 grid grid-cols-7 px-4 mb-1">{DAYS.map(d=><div key={d} className="flex items-center justify-center py-1"><span className="text-xs font-bold text-[#7A6F6A]" style={{ fontFamily:"DM Sans, sans-serif" }}>{d}</span></div>)}</div>
      <div className="flex-shrink-0 grid grid-cols-7 px-4 gap-y-1 mb-3">
        {Array.from({length:firstDay}).map((_,i)=><div key={`e-${i}`}/>)}
        {Array.from({length:daysInMonth}).map((_,i)=>{
          const day=i+1;const isSel=day===selectedDay;const hasTasks=daysWithTasks.has(day);const isTd=isToday(day);
          return(
            <button key={day} onClick={()=>setSelectedDay(day)} className="flex flex-col items-center justify-center py-1 rounded-xl transition-all" style={{ background:isSel?"#E8623A":isTd?"#FEF0EB":"transparent" }}>
              <span className="text-base font-black leading-none" style={{ fontFamily:"Nunito, sans-serif", color:isSel?"white":isTd?"#E8623A":"#1C1A2E" }}>{day}</span>
              {hasTasks&&<div className="w-1.5 h-1.5 rounded-full mt-0.5" style={{ background:isSel?"white":"#E8623A" }}/>}
            </button>
          );
        })}
      </div>
      {/* ── Tab bar ── */}
      <div className="flex-shrink-0 border-b border-[#E8D5C4]">
        <div className="flex px-2">
          {TAB_CONFIG.map(({key,label,color})=>{
            const isActive=displayTab===key;
            const count=tabTasks[key].length;
            return (
              <button key={key} onClick={()=>setCalTab(key)}
                className="flex-1 flex flex-col items-center pt-2 pb-0 gap-0.5 transition-all active:scale-95 relative">
                <span className="text-sm font-black transition-all" style={{ fontFamily:"Nunito, sans-serif", color:isActive?color:"#7A6F6A" }}>
                  {label}
                </span>
                <span className="text-xs font-semibold mb-1" style={{ color:isActive?color:"#C9BDB5", fontFamily:"DM Sans, sans-serif" }}>
                  {count}
                </span>
                {isActive&&<div className="absolute bottom-0 left-2 right-2 h-[3px] rounded-t-full" style={{ background:color }}/>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-6">
        {visibleTasks.length===0?(
          <div className="flex flex-col items-center py-10 text-center">
              <p className="text-base font-bold text-[#7A6F6A]" style={{ fontFamily:"DM Sans, sans-serif" }}>
              {displayTab==="done"?"No completed tasks":"No tasks here"}
            </p>
          </div>
        ):(
          <div className="space-y-3">
            {visibleTasks.map(task=>{
              const cat=categories.find(c=>c.id===task.category);
              const done=task.steps.filter(s=>s.completed).length;const total=task.steps.length;
              return(
                <button key={task.id} onClick={()=>onOpen(task.id)} className="w-full bg-white rounded-[1.5rem] overflow-hidden text-left shadow-sm border border-black/[0.06] active:scale-[0.98] transition-transform">
                  {task.photoUrl&&<img src={task.photoUrl} alt={task.title} className="w-full object-cover" style={{ height:80 }}/>}
                  <div className="flex items-center">
                    {cat&&<div className="w-1.5 self-stretch flex-shrink-0" style={{ background:cat.color }}/>}
                    <div className="flex-1 p-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-base font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>{task.title}</p>
                        {task.caregiverEdited&&showCaregiverTags&&<CaregiverTag/>}{task.skipped&&<SkippedTag/>}
                      </div>
                      {task.schedule?.startTime&&<p className="text-xs font-semibold text-[#7A6F6A] mt-0.5" style={{ fontFamily:"DM Sans, sans-serif" }}>{task.schedule.startTime} · {REPEAT_LABELS[task.schedule.repeat]}</p>}
                      <p className="text-xs text-[#7A6F6A] mt-0.5 font-semibold" style={{ fontFamily:"DM Sans, sans-serif" }}>{total===0?"No steps":done===total?"✓ Done!":`${done}/${total} steps`}</p>
                    </div>
                    <div className="pr-4"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 5l4 4-4 4" stroke="#E8623A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {isHome&&(
        <button onClick={onSettings} className="absolute w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-all"
          style={{ bottom:20, right:20, background:"#1C1A2E" }}>
          <Settings size={20} className="text-white"/>
        </button>
      )}
    </div>
  );
}

// ── Create Task ───────────────────────────────────────────────────────

function CreateScreen({ categories, defaultCategory, initialTask, onBack, onSave }: {
  categories:Category[]; defaultCategory?:string; initialTask?:Task; onBack:()=>void; onSave:(task:Task)=>void;
}) {
  const [title,setTitle]=useState(initialTask?.title??"");
  const [photoUrl,setPhotoUrl]=useState<string|undefined>(initialTask?.photoUrl);
  const photoInputId=`photo-input-${useRef(Math.random().toFixed(6)).current}`;
  const [steps,setSteps]=useState<DraftStep[]>(
    initialTask?.steps.map(s=>({id:s.id,title:s.title,description:s.description??"",mediaType:s.mediaType}))??[]
  );
  const [addStepOpen,setAddStepOpen]=useState(false);
  const [editStepId,setEditStepId]=useState<number|null>(null);
  const [reorderingSteps,setReorderingSteps]=useState(false);
  const moveStepUp=(idx:number)=>{if(idx===0)return;setSteps(prev=>{const a=[...prev];[a[idx-1],a[idx]]=[a[idx],a[idx-1]];return a;});};
  const moveStepDown=(idx:number)=>{setSteps(prev=>{if(idx===prev.length-1)return prev;const a=[...prev];[a[idx],a[idx+1]]=[a[idx+1],a[idx]];return a;});}
  const [scheduleOpen,setScheduleOpen]=useState(false);
  const [schedule,setSchedule]=useState<Schedule|null>(initialTask?.schedule??null);
  const [categoryOpen,setCategoryOpen]=useState(false);
  const [category,setCategory]=useState<string|undefined>(initialTask?.category??defaultCategory);
  const editStep=steps.find(s=>s.id===editStepId)??null;
  const cat=categories.find(c=>c.id===category);
  const canSave=title.trim();
  const handlePhotoChange=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>setPhotoUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };
  const handleStepSave=(draft:DraftStep)=>{
    if(editStepId)setSteps(prev=>prev.map(s=>s.id===editStepId?draft:s));
    else setSteps(prev=>[...prev,draft]);
    setAddStepOpen(false);setEditStepId(null);
  };
  const handleSave=()=>{
    if(!canSave)return;
    onSave({id:initialTask?.id??Date.now(),title:title.trim(),category,schedule:schedule??undefined,photoUrl,caregiverEdited:initialTask?.caregiverEdited,
      steps:steps.map((s,i)=>({id:i+1,title:s.title,description:s.description||undefined,mediaType:s.mediaType,completed:initialTask?.steps[i]?.completed??false,imageUrl:initialTask?.steps[i]?.imageUrl}))});
  };
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FEF7EE]">
      <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-4 pb-4">
        <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center shadow-sm"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>
        <h1 className="text-2xl font-black text-[#1C1A2E] flex-1" style={{ fontFamily:"Nunito, sans-serif" }}>{initialTask?"Edit Task":"New Task"}</h1>
        <button onClick={handleSave} disabled={!canSave} className="px-5 h-12 rounded-2xl font-black text-base text-white transition-all active:scale-[0.98]"
          style={{ background:canSave?"linear-gradient(135deg,#E8623A,#F07B3A)":"#C9BDB5", fontFamily:"Nunito, sans-serif", cursor:canSave?"pointer":"not-allowed" }}>Save ✓</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-4">
        <div className="bg-white rounded-[1.75rem] p-5 border border-black/[0.06]">
          <p className="text-xs font-bold text-[#7A6F6A] uppercase tracking-widest mb-2" style={{ fontFamily:"DM Sans, sans-serif" }}>Task name</p>
          <input type="text" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Make Breakfast"
            className="w-full text-2xl font-black text-[#1C1A2E] bg-transparent outline-none placeholder:text-[#C9BDB5]" style={{ fontFamily:"Nunito, sans-serif" }}/>
        </div>
        <div className="bg-white rounded-[1.75rem] border border-black/[0.06] overflow-hidden">
          <p className="text-xs font-bold text-[#7A6F6A] uppercase tracking-widest px-5 pt-5 pb-3" style={{ fontFamily:"DM Sans, sans-serif" }}>Task Photo</p>
          <input id={photoInputId} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange}/>
          {photoUrl?(
            <div className="relative mx-5 mb-5">
              <img src={photoUrl} alt="Task" className="w-full h-40 object-cover rounded-2xl"/>
              <button onClick={()=>setPhotoUrl(undefined)} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                <X size={14} className="text-white" strokeWidth={2.5}/>
              </button>
              <label htmlFor={photoInputId} className="absolute bottom-2 right-2 px-3 h-8 rounded-xl bg-black/50 flex items-center gap-1.5 cursor-pointer">
                <Camera size={13} className="text-white"/><span className="text-xs font-black text-white" style={{ fontFamily:"Nunito, sans-serif" }}>Change</span>
              </label>
            </div>
          ):(
            <label htmlFor={photoInputId} className="flex flex-col items-center justify-center gap-2 py-8 mb-5 rounded-2xl border-2 border-dashed border-[#E8623A]/30 hover:border-[#E8623A]/60 transition-all cursor-pointer active:scale-[0.98]" style={{ marginLeft:20, marginRight:20 }}>
              <Camera size={32} style={{ color:"#E8623A" }} strokeWidth={1.5}/>
              <span className="text-sm font-black text-[#E8623A]" style={{ fontFamily:"Nunito, sans-serif" }}>Add a photo</span>
            </label>
          )}
        </div>
        <div className="bg-white rounded-[1.75rem] p-5 border border-black/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[#7A6F6A] uppercase tracking-widest" style={{ fontFamily:"DM Sans, sans-serif" }}>Steps</p>
            {steps.length>1&&(
              <button onClick={()=>setReorderingSteps(r=>!r)} className="px-3 h-7 rounded-xl font-bold text-xs transition-all"
                style={{ background:reorderingSteps?"#E8623A":"#FEF0EB", color:reorderingSteps?"white":"#E8623A", fontFamily:"Nunito, sans-serif" }}>
                {reorderingSteps?"Done":"Reorder"}
              </button>
            )}
          </div>
          {steps.map((step,idx)=>(
            <div key={step.id} className="flex items-center gap-3 bg-[#FEF7EE] rounded-2xl p-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-black text-sm text-white" style={{ background:"#E8623A", fontFamily:"Nunito, sans-serif" }}>{idx+1}</div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-black text-[#1C1A2E] leading-snug" style={{ fontFamily:"Nunito, sans-serif" }}>{step.title}</p>
                {step.mediaType&&<p className="text-xs text-[#7A6F6A] mt-0.5" style={{ fontFamily:"DM Sans, sans-serif" }}>{step.mediaType==="audio"?"Audio":"Photo / Video"}</p>}
              </div>
              {reorderingSteps?(
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={()=>moveStepUp(idx)} disabled={idx===0} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:"#FEF0EB", opacity:idx===0?0.35:1 }}><ChevronUp size={16} style={{ color:"#E8623A" }}/></button>
                  <button onClick={()=>moveStepDown(idx)} disabled={idx===steps.length-1} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:"#FEF0EB", opacity:idx===steps.length-1?0.35:1 }}><ChevronDown size={16} style={{ color:"#E8623A" }}/></button>
                </div>
              ):(
                <>
                  <button onClick={()=>{setEditStepId(step.id);setAddStepOpen(true);}} className="px-3 h-8 rounded-xl bg-[#FEF0EB] text-xs font-black text-[#E8623A] flex-shrink-0" style={{ fontFamily:"Nunito, sans-serif" }}>Edit</button>
                  <button onClick={()=>setSteps(prev=>prev.filter(s=>s.id!==step.id))} className="w-8 h-8 rounded-xl bg-[#FEE8E8] flex items-center justify-center flex-shrink-0"><X size={14} strokeWidth={2.5} style={{ color:"#D4183D" }}/></button>
                </>
              )}
            </div>
          ))}
          {!reorderingSteps&&(
            <button onClick={()=>{setEditStepId(null);setAddStepOpen(true);}} className="w-full py-4 rounded-2xl border-2 border-dashed border-[#E8623A]/30 flex items-center justify-center gap-2 text-[#E8623A] font-black text-base hover:border-[#E8623A]/60 hover:bg-[#E8623A]/5 transition-all" style={{ fontFamily:"Nunito, sans-serif" }}>
              <Plus size={18} strokeWidth={3}/> Add a Step
            </button>
          )}
        </div>
        <div className="bg-white rounded-[1.75rem] p-5 border border-black/[0.06]">
          <p className="text-xs font-bold text-[#7A6F6A] uppercase tracking-widest mb-3" style={{ fontFamily:"DM Sans, sans-serif" }}>Schedule</p>
          <button onClick={()=>setScheduleOpen(true)} className="w-full py-4 px-4 rounded-2xl flex items-center gap-3 transition-all active:scale-[0.98]" style={{ background:schedule?"#FEF0EB":"#F5EDE0" }}>
            <div className="flex-1 text-left">
              {schedule?(
                <><p className="text-base font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>{REPEAT_LABELS[schedule.repeat]} · {schedule.startTime}</p><p className="text-xs text-[#7A6F6A] font-semibold mt-0.5" style={{ fontFamily:"DM Sans, sans-serif" }}>Starting {schedule.startDate}</p></>
              ):<p className="text-base font-black text-[#7A6F6A]" style={{ fontFamily:"Nunito, sans-serif" }}>Tap to schedule this task</p>}
            </div>
            {schedule?<button onClick={e=>{e.stopPropagation();setSchedule(null);}} className="w-8 h-8 rounded-xl bg-[#FEE8E8] flex items-center justify-center flex-shrink-0"><X size={14} style={{ color:"#D4183D" }} strokeWidth={2.5}/></button>
            :<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 5l4 4-4 4" stroke="#C9BDB5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </button>
        </div>
        <div className="bg-white rounded-[1.75rem] p-5 border border-black/[0.06]">
          <p className="text-xs font-bold text-[#7A6F6A] uppercase tracking-widest mb-3" style={{ fontFamily:"DM Sans, sans-serif" }}>Category</p>
          <button onClick={()=>setCategoryOpen(true)} className="w-full py-4 px-4 rounded-2xl flex items-center gap-3 transition-all active:scale-[0.98]" style={{ background:cat?cat.color+"22":"#F5EDE0" }}>
            {cat&&<div className="w-3 h-8 rounded-full flex-shrink-0" style={{ background:cat.color }}/>}
            <p className="flex-1 text-base font-black text-left" style={{ fontFamily:"Nunito, sans-serif", color:cat?"#1C1A2E":"#7A6F6A" }}>{cat?cat.label:"No Category"}</p>
            {cat?<button onClick={e=>{e.stopPropagation();setCategory(undefined);}} className="w-8 h-8 rounded-xl bg-[#FEE8E8] flex items-center justify-center flex-shrink-0"><X size={14} style={{ color:"#D4183D" }} strokeWidth={2.5}/></button>
            :<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 5l4 4-4 4" stroke="#C9BDB5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </button>
        </div>
      </div>
      {addStepOpen&&<AddStepSheet initial={editStep??undefined} onClose={()=>{setAddStepOpen(false);setEditStepId(null);}} onSave={handleStepSave}/>}
      {scheduleOpen&&<ScheduleSheet initial={schedule??undefined} onClose={()=>setScheduleOpen(false)} onSave={s=>{setSchedule(s);setScheduleOpen(false);}}/>}
      {categoryOpen&&<CategorySheet categories={categories} current={category} onClose={()=>setCategoryOpen(false)} onSelect={id=>{setCategory(id);setCategoryOpen(false);}}/>}
    </div>
  );
}

// ── Add Step Sheet ────────────────────────────────────────────────────

function AddStepSheet({ initial, onClose, onSave }: {
  initial?:DraftStep; onClose:()=>void; onSave:(step:DraftStep)=>void;
}) {
  const [title,setTitle]=useState(initial?.title??"");
  const [description,setDescription]=useState(initial?.description??"");
  const [mediaType,setMediaType]=useState<"photo"|"video"|"audio"|null>(initial?.mediaType??null);
  const canSave=title.trim();
  const handleSave=()=>{if(!canSave)return;onSave({id:initial?.id??Date.now(),title:title.trim(),description:description.trim(),mediaType});};
  return (
    <div className="absolute inset-0 z-50 flex items-end" style={{ background:"rgba(0,0,0,0.5)" }}>
      <div className="w-full bg-[#FEF7EE] rounded-t-[2rem] flex flex-col" style={{ maxHeight:"88%" }}>
        <div className="flex-shrink-0 flex justify-center pt-3 pb-2"><div className="w-12 h-1.5 rounded-full bg-[#C9BDB5]"/></div>
        <div className="flex-shrink-0 flex items-center justify-between px-5 pb-4">
          <button onClick={onClose} className="text-base font-bold text-[#D4183D]" style={{ fontFamily:"Nunito, sans-serif" }}>Cancel</button>
          <p className="text-lg font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>{initial?"Edit Step":"Add Step"}</p>
          <button onClick={handleSave} disabled={!canSave} className="text-base font-black" style={{ color:canSave?"#E8623A":"#C9BDB5", fontFamily:"Nunito, sans-serif" }}>{initial?"Update":"Add"}</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">
          <div className="bg-white rounded-[1.5rem] p-4 border border-black/[0.06]">
            <p className="text-xs font-bold text-[#7A6F6A] uppercase tracking-widest mb-2" style={{ fontFamily:"DM Sans, sans-serif" }}>Step title</p>
            <input type="text" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Get eggs from fridge" autoFocus
              className="w-full text-xl font-black text-[#1C1A2E] bg-transparent outline-none placeholder:text-[#C9BDB5]" style={{ fontFamily:"Nunito, sans-serif" }}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={()=>setMediaType(mediaType==="photo"?null:"photo")} className="rounded-[1.5rem] p-5 flex flex-col items-center gap-2 transition-all active:scale-[0.97]" style={{ background:mediaType==="photo"?"linear-gradient(135deg,#E8623A,#F07B3A)":"#FEF0EB" }}>
              <Camera size={34} strokeWidth={1.8} style={{ color:mediaType==="photo"?"white":"#E8623A" }}/>
              <span className="text-sm font-black text-center leading-tight" style={{ color:mediaType==="photo"?"white":"#E8623A", fontFamily:"Nunito, sans-serif" }}>{"Take Photo\n/ Video"}</span>
              {mediaType==="photo"&&<div className="flex items-center gap-1"><Check size={13} className="text-white" strokeWidth={3}/><span className="text-xs font-bold text-white" style={{ fontFamily:"DM Sans, sans-serif" }}>Selected</span></div>}
            </button>
            <button onClick={()=>setMediaType(mediaType==="audio"?null:"audio")} className="rounded-[1.5rem] p-5 flex flex-col items-center gap-2 transition-all active:scale-[0.97]" style={{ background:mediaType==="audio"?"#3DB8AD":"#EBF9F8" }}>
              <Mic size={34} strokeWidth={1.8} style={{ color:mediaType==="audio"?"white":"#3DB8AD" }}/>
              <span className="text-sm font-black text-center leading-tight" style={{ color:mediaType==="audio"?"white":"#3DB8AD", fontFamily:"Nunito, sans-serif" }}>{"Record\nAudio"}</span>
              {mediaType==="audio"&&<div className="flex items-center gap-1"><Check size={13} className="text-white" strokeWidth={3}/><span className="text-xs font-bold text-white" style={{ fontFamily:"DM Sans, sans-serif" }}>Selected</span></div>}
            </button>
          </div>
          <div className="bg-white rounded-[1.5rem] p-4 border border-black/[0.06]">
            <p className="text-xs font-bold text-[#7A6F6A] uppercase tracking-widest mb-2" style={{ fontFamily:"DM Sans, sans-serif" }}>Description (optional)</p>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Add more details about this step…" rows={3}
              className="w-full text-base text-[#1C1A2E] bg-transparent outline-none resize-none placeholder:text-[#C9BDB5] font-semibold" style={{ fontFamily:"DM Sans, sans-serif" }}/>
          </div>
          <button onClick={handleSave} disabled={!canSave} className="w-full py-4 rounded-[1.75rem] font-black text-lg text-white transition-all active:scale-[0.98]"
            style={{ background:canSave?"linear-gradient(135deg,#E8623A,#F07B3A)":"#C9BDB5", fontFamily:"Nunito, sans-serif", cursor:canSave?"pointer":"not-allowed" }}>
            {initial?"Update Step ✓":"Add Step ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Schedule Sheet ────────────────────────────────────────────────────

function ScheduleSheet({ initial, onClose, onSave }: {
  initial?:Schedule; onClose:()=>void; onSave:(s:Schedule)=>void;
}) {
  const todayStr=new Date().toISOString().slice(0,10);
  const [repeat,setRepeat]=useState<RepeatInterval>(initial?.repeat??"none");
  const [startDate,setStartDate]=useState(initial?.startDate??todayStr);
  const [startTime,setStartTime]=useState(initial?.startTime??"09:00");
  return (
    <div className="absolute inset-0 z-50 flex items-end" style={{ background:"rgba(0,0,0,0.5)" }}>
      <div className="w-full bg-[#FEF7EE] rounded-t-[2rem] flex flex-col" style={{ maxHeight:"88%" }}>
        <div className="flex-shrink-0 flex justify-center pt-3 pb-2"><div className="w-12 h-1.5 rounded-full bg-[#C9BDB5]"/></div>
        <div className="flex-shrink-0 flex items-center justify-between px-5 pb-2">
          <button onClick={onClose} className="text-base font-bold text-[#D4183D]" style={{ fontFamily:"Nunito, sans-serif" }}>Cancel</button>
          <p className="text-lg font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>Schedule Task</p>
          <button onClick={()=>onSave({repeat,startDate,startTime})} className="text-base font-black text-[#E8623A]" style={{ fontFamily:"Nunito, sans-serif" }}>Set</button>
        </div>
        <div className="flex-1 overflow-y-auto pb-8">
          <div className="px-5 pt-2 pb-1"><p className="text-xs font-bold text-[#7A6F6A] uppercase tracking-widest py-2" style={{ fontFamily:"DM Sans, sans-serif" }}>Repeat</p></div>
          <div className="mx-5 bg-white rounded-[1.5rem] border border-black/[0.06] overflow-hidden">
            {REPEAT_OPTIONS.map((opt,idx)=>(
              <div key={opt.key}>
                {idx>0&&<div className="h-px bg-[#F5EDE0] mx-4"/>}
                <button onClick={()=>setRepeat(opt.key)} className="w-full flex items-center justify-between px-5 py-4 transition-colors active:bg-[#FEF7EE]">
                  <span className="text-lg font-semibold text-[#1C1A2E]" style={{ fontFamily:"DM Sans, sans-serif" }}>{opt.label}</span>
                  {repeat===opt.key&&<Check size={20} strokeWidth={3} style={{ color:"#E8623A" }}/>}
                </button>
              </div>
            ))}
          </div>
          <div className="px-5 pt-4 pb-1"><p className="text-xs font-bold text-[#7A6F6A] uppercase tracking-widest py-2" style={{ fontFamily:"DM Sans, sans-serif" }}>First Occurrence</p></div>
          <div className="mx-5 bg-white rounded-[1.5rem] border border-black/[0.06] overflow-hidden">
            <div className="flex items-center px-5 py-4">
              <span className="text-base font-semibold text-[#7A6F6A] w-12 flex-shrink-0" style={{ fontFamily:"DM Sans, sans-serif" }}>Date</span>
              <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} min={todayStr}
                className="flex-1 bg-[#F5EDE0] rounded-xl px-3 py-2 text-base font-semibold text-[#1C1A2E] outline-none focus:ring-2 focus:ring-[#E8623A]/40" style={{ fontFamily:"DM Sans, sans-serif" }}/>
            </div>
            <div className="h-px bg-[#F5EDE0] mx-4"/>
            <div className="flex items-center px-5 py-4">
              <span className="text-base font-semibold text-[#7A6F6A] w-12 flex-shrink-0" style={{ fontFamily:"DM Sans, sans-serif" }}>Time</span>
              <input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)}
                className="flex-1 bg-[#F5EDE0] rounded-xl px-3 py-2 text-base font-semibold text-[#1C1A2E] outline-none focus:ring-2 focus:ring-[#E8623A]/40" style={{ fontFamily:"DM Sans, sans-serif" }}/>
            </div>
          </div>
          <div className="px-5 pt-4">
            <button onClick={()=>onSave({repeat,startDate,startTime})} className="w-full py-4 rounded-[1.75rem] font-black text-lg text-white active:scale-[0.98] transition-transform" style={{ background:"linear-gradient(135deg,#E8623A,#F07B3A)", fontFamily:"Nunito, sans-serif" }}>Set Schedule ✓</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Category Sheet ────────────────────────────────────────────────────

function CategorySheet({ categories, current, onClose, onSelect }: {
  categories:Category[]; current?:string; onClose:()=>void; onSelect:(id:string|undefined)=>void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-end" style={{ background:"rgba(0,0,0,0.5)" }}>
      <div className="w-full bg-[#FEF7EE] rounded-t-[2rem] flex flex-col" style={{ maxHeight:"75%" }}>
        <div className="flex-shrink-0 flex justify-center pt-3 pb-2"><div className="w-12 h-1.5 rounded-full bg-[#C9BDB5]"/></div>
        <div className="flex-shrink-0 flex items-center justify-between px-5 pb-4">
          <button onClick={onClose} className="text-base font-bold text-[#D4183D]" style={{ fontFamily:"Nunito, sans-serif" }}>Cancel</button>
          <p className="text-lg font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>Choose Category</p>
          <div className="w-14"/>
        </div>
        <div className="flex-1 overflow-y-auto pb-8">
          <div className="mx-5 bg-white rounded-[1.5rem] border border-black/[0.06] overflow-hidden">
            <button onClick={()=>onSelect(undefined)} className="w-full flex items-center gap-4 px-5 py-4 transition-colors active:bg-[#FEF7EE]">
              <div className="w-3 h-8 rounded-full bg-[#C9BDB5] flex-shrink-0"/>
              <p className="flex-1 text-lg font-semibold text-[#1C1A2E] text-left" style={{ fontFamily:"DM Sans, sans-serif" }}>No Category</p>
              {!current&&<Check size={20} strokeWidth={3} style={{ color:"#E8623A" }}/>}
            </button>
            {categories.map(cat=>(
              <div key={cat.id}>
                <div className="h-px bg-[#F5EDE0] mx-4"/>
                <button onClick={()=>onSelect(cat.id)} className="w-full flex items-center gap-4 px-5 py-4 transition-colors active:bg-[#FEF7EE]">
                  <div className="w-3 h-8 rounded-full flex-shrink-0" style={{ background:cat.color }}/>
                  <p className="flex-1 text-lg font-semibold text-[#1C1A2E] text-left" style={{ fontFamily:"DM Sans, sans-serif" }}>{cat.label}</p>
                  {current===cat.id&&<Check size={20} strokeWidth={3} style={{ color:"#E8623A" }}/>}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Task Detail ───────────────────────────────────────────────────────

function TaskDetail({ task, categories, hideAudio=false, showCaregiverTags=true, onBack, onStepTap, onToggle, onSkip }: {
  task:Task; categories:Category[]; hideAudio?:boolean; showCaregiverTags?:boolean; onBack:()=>void; onStepTap:(stepId:number)=>void; onToggle:(stepId:number)=>void; onSkip:()=>void;
}) {
  const {speak,stop,speaking}=useSpeech();
  const [speakingStepId,setSpeakingStepId]=useState<number|null>(null);
  const cat=categories.find(c=>c.id===task.category);
  const handleListen=(step:{id:number;title:string},idx:number)=>{
    if(speakingStepId===step.id){stop();setSpeakingStepId(null);}
    else{setSpeakingStepId(step.id);speak(`Step ${idx+1}. ${step.title}`);}
  };
  useEffect(()=>{if(!speaking)setSpeakingStepId(null);},[speaking]);
  const done=task.steps.filter(s=>s.completed).length;
  const total=task.steps.length;
  const allDone=total>0&&done===total;
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-4 px-5 pt-4 pb-4 bg-[#FEF7EE]">
        <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center shadow-sm"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-black text-[#1C1A2E] leading-tight" style={{ fontFamily:"Nunito, sans-serif" }}>{task.title}</h1>
            {task.caregiverEdited&&showCaregiverTags&&<CaregiverTag/>}{task.skipped&&<SkippedTag/>}
          </div>
          <p className="text-sm font-semibold mt-0.5" style={{ fontFamily:"DM Sans, sans-serif", color:cat?cat.color:"#7A6F6A" }}>
            {cat?cat.label+` · ${done} of ${total} steps done`:`${done} of ${total} steps done`}
          </p>
        </div>
      </div>
      <div className="flex-shrink-0 h-2 bg-[#F5EDE0] mx-5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width:`${total?((done/total)*100):0}%`, background:allDone?"#3DB8AD":"#E8623A" }}/>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6 space-y-3">
        {task.skipped&&(
          <div className="rounded-[1.5rem] p-4 flex items-center gap-3" style={{ background:"#ECE7E1" }}>
            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0"><SkipForward size={18} style={{ color:"#7A6F6A" }} strokeWidth={2.5}/></div>
            <p className="flex-1 text-sm font-semibold text-[#7A6F6A]" style={{ fontFamily:"DM Sans, sans-serif" }}>This task is skipped. It will show under <span className="font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>Skipped</span> in the calendar.</p>
          </div>
        )}
        {task.steps.map((step,idx)=>(
          <div key={step.id} onClick={()=>onStepTap(step.id)} role="button" tabIndex={0} onKeyDown={e=>e.key==="Enter"&&onStepTap(step.id)}
            className={`bg-white rounded-[1.75rem] overflow-hidden border shadow-sm transition-all active:scale-[0.98] cursor-pointer ${step.completed?"border-[#3DB8AD]/30 opacity-70":"border-black/[0.06]"}`}>
            {step.imageUrl&&(
              <button onClick={e=>{e.stopPropagation();onStepTap(step.id);}} className="w-full block relative" style={{ height:150 }}>
                <img src={step.imageUrl} alt={step.title} className="w-full h-full object-cover" style={{ filter:step.completed?"grayscale(40%) brightness(0.85)":"none" }}/>
                {step.mediaType==="video"&&!step.completed&&<div className="absolute inset-0 flex items-center justify-center"><div className="w-14 h-14 rounded-full bg-black/35 flex items-center justify-center"><Play size={22} className="text-white ml-1"/></div></div>}
                {step.completed&&<div className="absolute inset-0 flex items-center justify-center"><div className="w-14 h-14 rounded-full bg-[#3DB8AD] flex items-center justify-center"><Check size={24} className="text-white" strokeWidth={3}/></div></div>}
              </button>
            )}
            {!hideAudio&&!step.imageUrl&&step.mediaType==="audio"&&(
              <div className="flex items-center gap-4 px-5 py-4 bg-[#FEF0EB]">
                <div className="w-12 h-12 rounded-full bg-[#E8623A] flex items-center justify-center flex-shrink-0"><Play size={18} className="text-white ml-0.5"/></div>
                <div className="flex-1 h-2 bg-[#E8623A]/20 rounded-full"><div className="h-full bg-[#E8623A] rounded-full w-0"/></div>
                <Mic size={18} className="text-[#E8623A] flex-shrink-0"/>
              </div>
            )}
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="relative flex-shrink-0">
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-base" style={{ background:step.completed?"#3DB8AD":"#E8623A", color:"white", fontFamily:"Nunito, sans-serif" }}>{idx+1}</div>
                {step.completed&&<div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white flex items-center justify-center"><Check size={10} strokeWidth={3.5} style={{ color:"#3DB8AD" }}/></div>}
              </div>
              <p className={`flex-1 text-lg font-black leading-snug ${step.completed?"line-through text-[#7A6F6A]":"text-[#1C1A2E]"}`} style={{ fontFamily:"Nunito, sans-serif" }}>{step.title}</p>
              {!hideAudio&&(
                <button onClick={e=>{e.stopPropagation();handleListen(step,idx);}} className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90" style={{ background:speakingStepId===step.id?"#E8623A":"#FEF0EB" }}>
                  {speakingStepId===step.id?<Square size={14} strokeWidth={3} style={{ color:"white" }}/>:<Volume2 size={17} strokeWidth={2.5} style={{ color:"#E8623A" }}/>}
                </button>
              )}
              <button onClick={e=>{e.stopPropagation();onToggle(step.id);}} className="flex items-center gap-1.5 rounded-2xl px-3 h-10 flex-shrink-0 transition-all active:scale-90" style={{ background:step.completed?"#FEE8E8":"#F5EDE0" }}>
                {step.completed?(<><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7a5 5 0 1 0 1.5-3.5L2 5V2" stroke="#D4183D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 2v3h3" stroke="#D4183D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg><span className="text-xs font-black" style={{ color:"#D4183D", fontFamily:"Nunito, sans-serif" }}>Undo</span></>):<Check size={18} strokeWidth={3} style={{ color:"#C9BDB5" }}/>}
              </button>
            </div>
          </div>
        ))}
        {allDone&&!task.skipped&&<div className="rounded-[1.75rem] p-6 text-center" style={{ background:"#3DB8AD" }}><p className="text-white font-black text-2xl" style={{ fontFamily:"Nunito, sans-serif" }}>Great job!</p><p className="text-white/80 text-base mt-1" style={{ fontFamily:"DM Sans, sans-serif" }}>You finished all the steps.</p></div>}
        <button onClick={onSkip} className="w-full py-4 rounded-[1.75rem] font-black text-base flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]"
          style={{ background:task.skipped?"#F5EDE0":"transparent", border:task.skipped?"none":"2px solid #C9BDB5", color:"#7A6F6A", fontFamily:"Nunito, sans-serif" }}>
          {task.skipped?(<><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9a6 6 0 1 0 1.8-4.2L3 6.5V3" stroke="#7A6F6A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 3v3.5h3.5" stroke="#7A6F6A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>Un-skip this task</>):(<><SkipForward size={18} strokeWidth={2.5}/>Skip this task</>)}
        </button>
      </div>
    </div>
  );
}

// ── Step View ─────────────────────────────────────────────────────────

function StepView({ task, step, stepIndex, totalSteps, autoPlaySounds, hideAudio=false, onBack, onToggle, onNext }: {
  task:Task; step:Step; stepIndex:number; totalSteps:number; autoPlaySounds:boolean; hideAudio?:boolean; onBack:()=>void; onToggle:()=>void; onNext:()=>void;
}) {
  const {speak,stop,speaking}=useSpeech();
  const isLast=stepIndex===totalSteps-1;
  const isDone=step.completed;
  useEffect(()=>{
    if(!autoPlaySounds||hideAudio)return;
    const t=setTimeout(()=>speak(`Step ${stepIndex+1}. ${step.title}`),400);
    return()=>{clearTimeout(t);stop();};
  },[step.id,autoPlaySounds]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FEF7EE]">
      <div className="relative flex-shrink-0 bg-[#F5EDE0]" style={{ height:320 }}>
        {step.imageUrl?<img src={step.imageUrl} alt={step.title} className="w-full h-full object-cover"/>:<div className="w-full h-full flex items-center justify-center"><Mic size={64} className="text-[#C9BDB5]"/></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"/>
        {step.mediaType==="video"&&<div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-16 h-16 rounded-full bg-white/30 flex items-center justify-center"><Play size={28} className="text-white ml-1"/></div></div>}
        <button onClick={onBack} className="absolute top-5 left-5 z-10 flex items-center gap-2 bg-black/30 rounded-2xl pl-3 pr-4 h-11">
          <ArrowLeft size={18} className="text-white"/>
          <span className="text-white font-black text-sm" style={{ fontFamily:"Nunito, sans-serif" }}>{stepIndex>0?`Step ${stepIndex}`:"All steps"}</span>
        </button>
        <div className="absolute top-5 right-5 z-10 bg-black/30 px-3 py-1.5 rounded-full"><span className="text-white font-black text-sm" style={{ fontFamily:"Nunito, sans-serif" }}>{stepIndex+1} / {totalSteps}</span></div>
      </div>
      <div className="flex-1 flex flex-col px-6 pt-6 pb-6 overflow-y-auto">
        <p className="text-sm font-bold text-[#7A6F6A] uppercase tracking-widest mb-2" style={{ fontFamily:"DM Sans, sans-serif" }}>{task.title}</p>
        <h2 className="text-3xl font-black text-[#1C1A2E] leading-tight mb-4" style={{ fontFamily:"Nunito, sans-serif" }}>Step {stepIndex+1}</h2>
        <p className="text-2xl font-black text-[#1C1A2E] leading-snug" style={{ fontFamily:"Nunito, sans-serif" }}>{step.title}</p>
        {!hideAudio&&step.mediaType==="audio"&&<div className="mt-5 bg-[#FEF0EB] rounded-2xl p-4 flex items-center gap-4"><button className="w-12 h-12 rounded-full bg-[#E8623A] flex items-center justify-center flex-shrink-0"><Play size={18} className="text-white ml-0.5"/></button><div className="flex-1 h-2.5 bg-[#E8623A]/20 rounded-full"><div className="h-full bg-[#E8623A] rounded-full w-1/3"/></div></div>}
        {!hideAudio&&(
          <button onClick={()=>speaking?stop():speak(`Step ${stepIndex+1}. ${step.title}`)} className="mt-5 w-full py-4 rounded-[1.5rem] flex items-center justify-center gap-3 font-black text-lg transition-all active:scale-[0.98]" style={{ background:speaking?"#E8623A":"#FEF0EB", color:speaking?"white":"#E8623A", fontFamily:"Nunito, sans-serif" }}>
            {speaking?(<><span className="flex gap-0.5 items-end h-5">{[0,1,2,3].map(i=><span key={i} className="w-1 rounded-full bg-white" style={{ height:`${[12,18,14,20][i]}px`, animation:`bounce-bar 0.8s ease-in-out ${i*0.15}s infinite alternate` }}/>)}</span>Stop listening</>):<><Volume2 size={22} strokeWidth={2.5}/>Listen to this step</>}
          </button>
        )}
        <style>{`@keyframes bounce-bar{from{transform:scaleY(0.5);}to{transform:scaleY(1.2);}}`}</style>
        <div className="flex-1"/>
        {isDone?(
          <button onClick={onToggle} className="w-full py-5 rounded-[1.75rem] font-black text-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3" style={{ background:"#FEE8E8", color:"#D4183D", fontFamily:"Nunito, sans-serif" }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 11a8 8 0 1 0 2.4-5.6L3 8V3" stroke="#D4183D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 3v5h5" stroke="#D4183D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Undo — not done yet
          </button>
        ):(
          <button onClick={onNext} className="w-full py-5 rounded-[1.75rem] font-black text-xl text-white shadow-lg active:scale-[0.98] transition-transform" style={{ background:"linear-gradient(135deg,#E8623A,#F07B3A)", fontFamily:"Nunito, sans-serif" }}>
            {isLast?"✓  All done!":"✓  Done — Next step"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────

type SettingsPage = "main" | "notifications" | "interface" | "audio" | "icloud" | "statistics" | "privacy";

function Toggle({ on, onChange }: { on:boolean; onChange:(v:boolean)=>void }) {
  return (
    <button onClick={()=>onChange(!on)} className="relative flex-shrink-0 transition-all active:scale-95"
      style={{ width:51, height:31, borderRadius:16, background:on?"#E8623A":"#C9BDB5" }}>
      <div className="absolute top-[3px] transition-all duration-200 w-[25px] h-[25px] rounded-full bg-white shadow-sm"
        style={{ left:on?23:3 }}/>
    </button>
  );
}

function SettingRow({ label, right, onPress, border=true }: { label:string; right?:React.ReactNode; onPress?:()=>void; border?:boolean }) {
  const inner = (
    <div className={`flex items-center gap-4 px-5 py-4 ${border?"border-b border-[#F5EDE0]":""}`}>
      <p className="flex-1 text-base font-semibold text-[#1C1A2E]" style={{ fontFamily:"DM Sans, sans-serif" }}>{label}</p>
      {right}
    </div>
  );
  if (onPress) return <button onClick={onPress} className="w-full text-left active:bg-[#FEF7EE] transition-colors">{inner}</button>;
  return <div>{inner}</div>;
}

function SettingsScreen({ settings, onUpdate, onBack, caregiverMode=false, caregiverInfo }: {
  settings:AppSettings; onUpdate:(s:AppSettings)=>void; onBack:()=>void; caregiverMode?:boolean; caregiverInfo?:Caregiver|null;
}) {
  const [page, setPage] = useState<SettingsPage>("main");
  const set = <K extends keyof AppSettings>(key:K, val:AppSettings[K]) => onUpdate({ ...settings, [key]:val });
  const ChevronRight2 = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 5l4 4-4 4" stroke="#C9BDB5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;

  const SectionCard = ({ children }: { children:React.ReactNode }) => (
    <div className="mx-5 mb-4 bg-white rounded-[1.5rem] border border-black/[0.06] overflow-hidden">{children}</div>
  );
  const SectionLabel = ({ label }: { label:string }) => (
    <p className="mx-5 mt-5 mb-1 text-xs font-bold text-[#7A6F6A] uppercase tracking-widest" style={{ fontFamily:"DM Sans, sans-serif" }}>{label}</p>
  );

  if (page === "notifications") return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-4 pb-3">
        <button onClick={()=>setPage("main")} className="w-12 h-12 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center shadow-sm"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>
        <h1 className="text-2xl font-black text-[#1C1A2E] flex-1" style={{ fontFamily:"Nunito, sans-serif" }}>Notifications</h1>
      </div>
      <div className="flex-1 overflow-y-auto pb-8">
        <SectionLabel label="Notifications Alert"/>
        <SectionCard>
          {(["none","15min","attime"] as const).map((opt,i,arr)=>{
            const labels = { none:"None", "15min":"15 Minutes Before Event", attime:"At Time of Event" };
            return (
              <SettingRow key={opt} label={labels[opt]} border={i<arr.length-1}
                onPress={()=>set("notificationAlert",opt)}
                right={settings.notificationAlert===opt?<Check size={20} strokeWidth={3} style={{ color:"#E8623A" }}/>:undefined}/>
            );
          })}
        </SectionCard>
        <p className="mx-5 text-sm text-[#7A6F6A] text-center leading-relaxed" style={{ fontFamily:"DM Sans, sans-serif" }}>Currently, these settings will only apply to newly created repeat instances on tasks</p>
      </div>
    </div>
  );

  if (page === "interface") return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-4 pb-3">
        <button onClick={()=>setPage("main")} className="w-12 h-12 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center shadow-sm"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>
        <h1 className="text-2xl font-black text-[#1C1A2E] flex-1" style={{ fontFamily:"Nunito, sans-serif" }}>Interface</h1>
      </div>
      <div className="flex-1 overflow-y-auto pb-8">
        <SectionLabel label="Starting Page"/>
        <p className="mx-5 mb-2 text-xs text-[#7A6F6A]" style={{ fontFamily:"DM Sans, sans-serif" }}>Only visible when Simple Mode is enabled</p>
        <SectionCard>
          {(["calendar","all-tasks","categories"] as const).map((opt,i,arr)=>{
            const labels = { calendar:"Calendar", "all-tasks":"All Tasks", categories:"Categories" };
            return (
              <SettingRow key={opt} label={labels[opt]} border={i<arr.length-1}
                onPress={()=>set("startingPage",opt)}
                right={settings.startingPage===opt?<Check size={20} strokeWidth={3} style={{ color:"#E8623A" }}/>:undefined}/>
            );
          })}
        </SectionCard>
        <SectionLabel label="Options"/>
        <SectionCard>
          {([
            { key:"simpleMode" as const, label:"Enable 'Simple Mode'" },
            { key:"allowChangingDate" as const, label:"Allow Changing Date in Calendar" },
            { key:"useCategories" as const, label:"Use Categories to Manage Tasks" },
            { key:"showOverdue" as const, label:"Show Overdue Tasks on Launch" },
            { key:"onlyToday" as const, label:"Only Show Today's Tasks" },
            { key:"allowCompleting" as const, label:"Allow Completing Tasks on Start" },
            { key:"autoAddCompleted" as const, label:"Automatically Add Completed Tasks to Calendar" },
          ]).map(({key,label},i,arr)=>(
            <SettingRow key={key} label={label} border={i<arr.length-1}
              right={<Toggle on={settings[key] as boolean} onChange={v=>set(key,v)}/>}/>
          ))}
        </SectionCard>
        <SectionLabel label={`Task Icon Size — ${settings.taskIconSize}%`}/>
        <div className="mx-5 bg-white rounded-[1.5rem] border border-black/[0.06] px-5 py-5">
          <input type="range" min={0} max={100} value={settings.taskIconSize}
            onChange={e=>set("taskIconSize",Number(e.target.value))}
            className="w-full" style={{ accentColor:"#E8623A" }}/>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-[#7A6F6A]" style={{ fontFamily:"DM Sans, sans-serif" }}>Small</span>
            <span className="text-xs text-[#7A6F6A]" style={{ fontFamily:"DM Sans, sans-serif" }}>Large</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (page === "audio") return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-4 pb-3">
        <button onClick={()=>setPage("main")} className="w-12 h-12 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center shadow-sm"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>
        <h1 className="text-2xl font-black text-[#1C1A2E] flex-1" style={{ fontFamily:"Nunito, sans-serif" }}>Audio & Speech</h1>
      </div>
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="h-3"/>
        <SectionCard>
          <SettingRow label="Automatically Play Step Sounds" border={false}
            right={<Toggle on={settings.autoPlaySounds} onChange={v=>set("autoPlaySounds",v)}/>}/>
        </SectionCard>
        <SectionLabel label={`Speech Speed — ${settings.speechSpeed}%`}/>
        <div className="mx-5 bg-white rounded-[1.5rem] border border-black/[0.06] px-5 py-5">
          <input type="range" min={0} max={100} value={settings.speechSpeed} onChange={e=>set("speechSpeed",Number(e.target.value))}
            className="w-full accent-[#E8623A]" style={{ accentColor:"#E8623A" }}/>
        </div>
      </div>
    </div>
  );

  if (page === "icloud") return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-4 pb-3">
        <button onClick={()=>setPage("main")} className="w-12 h-12 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center shadow-sm"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>
        <h1 className="text-2xl font-black text-[#1C1A2E] flex-1" style={{ fontFamily:"Nunito, sans-serif" }}>iCloud Settings</h1>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-3 pt-4">
        <button className="w-full bg-white rounded-[1.5rem] border border-black/[0.06] px-5 py-4 flex items-center gap-3 active:bg-[#FEF7EE] transition-colors">
          <Cloud size={22} style={{ color:"#3B82F6" }}/><span className="text-base font-semibold text-[#3B82F6]" style={{ fontFamily:"DM Sans, sans-serif" }}>Backup to iCloud</span>
        </button>
        <button className="w-full bg-white rounded-[1.5rem] border border-black/[0.06] px-5 py-4 flex items-center gap-3 active:bg-[#FEF7EE] transition-colors">
          <CloudDownload size={22} style={{ color:"#3B82F6" }}/><span className="text-base font-semibold text-[#3B82F6]" style={{ fontFamily:"DM Sans, sans-serif" }}>Load from iCloud</span>
        </button>
        <p className="text-sm text-[#1C1A2E] mt-2 leading-relaxed" style={{ fontFamily:"DM Sans, sans-serif" }}>Note: There may be a delay in seeing newly uploaded tasks on other devices.</p>
        <p className="text-sm font-semibold leading-relaxed" style={{ color:"#D4183D", fontFamily:"DM Sans, sans-serif" }}>WARNING: If upgrading from the old version of CanPlan, some attributes related to scheduling will be lost</p>
      </div>
    </div>
  );

  if (page === "statistics") return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-4 pb-3">
        <button onClick={()=>setPage("main")} className="w-12 h-12 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center shadow-sm"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>
        <h1 className="text-2xl font-black text-[#1C1A2E] flex-1" style={{ fontFamily:"Nunito, sans-serif" }}>Statistics</h1>
      </div>
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="h-3"/>
        <SectionCard>
          {[
            { label:"Install Date", value:"2026-06-19" },
            { label:"Steps Completed", value:"30" },
            { label:"Tasks Completed", value:"3" },
            { label:"Days Active", value:"1" },
          ].map(({label,value},i,arr)=>(
            <SettingRow key={label} label={label} border={i<arr.length-1}
              right={<span className="text-base font-bold text-[#7A6F6A]" style={{ fontFamily:"DM Sans, sans-serif" }}>{value}</span>}/>
          ))}
        </SectionCard>
        <p className="text-center text-xs text-[#3B82F6] mt-6" style={{ fontFamily:"DM Sans, sans-serif" }}>Made at CanAssist by Caelum Dudek and Joe McDonald</p>
      </div>
    </div>
  );

  if (page === "privacy") return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-4 pb-3">
        <button onClick={()=>setPage("main")} className="w-12 h-12 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center shadow-sm"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>
        <h1 className="text-2xl font-black text-[#1C1A2E] flex-1" style={{ fontFamily:"Nunito, sans-serif" }}>Privacy Policy</h1>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-8 pt-4 space-y-4">
        <div className="bg-white rounded-[1.5rem] border border-black/[0.06] p-5">
          <p className="text-sm font-bold text-[#7A6F6A] mb-2" style={{ fontFamily:"DM Sans, sans-serif" }}>Privacy Policy</p>
          <p className="text-sm text-[#3B82F6] break-all" style={{ fontFamily:"DM Sans, sans-serif" }}>https://www.uvic.ca/general-counsel/privacy-access/policies-and-procedures/index.php</p>
        </div>
        <button className="w-full py-4 rounded-[1.75rem] font-black text-lg text-[#3B82F6] bg-white border border-black/[0.06] active:scale-[0.98]" style={{ fontFamily:"Nunito, sans-serif" }}>Copy link</button>
      </div>
    </div>
  );

  // Caregiver portal settings — no patient-experience pages (Interface / Simple
  // Mode / accessibility) and no Notifications or Statistics. Basic app settings
  // plus data & privacy.
  if (caregiverMode) {
    const cgName = caregiverInfo ? `${caregiverInfo.firstName}${caregiverInfo.lastName ? " " + caregiverInfo.lastName : ""}` : "Caregiver";
    const supported = caregiverInfo?.patientIds.length ?? 0;
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-4 pb-3">
          <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center shadow-sm"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>
          <h1 className="text-2xl font-black text-[#1C1A2E] flex-1" style={{ fontFamily:"Nunito, sans-serif" }}>Settings</h1>
        </div>
        <div className="flex-1 overflow-y-auto pb-8">
          <SectionLabel label="Account"/>
          <div className="mx-5 mb-4 bg-white rounded-[1.5rem] border border-black/[0.06] p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background:"#E8623A" }}>
              <span className="text-lg font-black text-white" style={{ fontFamily:"Nunito, sans-serif" }}>{cgName[0]?.toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-black text-[#1C1A2E] truncate" style={{ fontFamily:"Nunito, sans-serif" }}>{cgName}</p>
              <p className="text-sm text-[#7A6F6A] font-semibold" style={{ fontFamily:"DM Sans, sans-serif" }}>{caregiverInfo?.relationship ? caregiverInfo.relationship + " · " : ""}{supported} {supported===1?"person":"people"} supported</p>
            </div>
          </div>
          <SectionLabel label="Preferences"/>
          <SectionCard>
            <SettingRow label="Show caregiver tags on tasks" border={false}
              right={<Toggle on={settings.showCaregiverTags} onChange={v=>set("showCaregiverTags",v)}/>}/>
          </SectionCard>
          <SectionLabel label="Data & Privacy"/>
          <SectionCard>
            <SettingRow label="iCloud Settings" onPress={()=>setPage("icloud")} right={<ChevronRight2/>}/>
            <SettingRow label="Privacy Policy" border={false} onPress={()=>setPage("privacy")} right={<ChevronRight2/>}/>
          </SectionCard>
          <p className="text-center text-sm text-[#7A6F6A] mt-4" style={{ fontFamily:"DM Sans, sans-serif" }}>App Version: 2.0.0</p>
        </div>
      </div>
    );
  }

  // Patient main settings page.
  const menuItems: { label:string; page:SettingsPage }[] = [
    { label:"Notifications", page:"notifications" },
    { label:"Interface", page:"interface" },
    { label:"Audio & Speech", page:"audio" },
    { label:"iCloud Settings", page:"icloud" },
    { label:"Statistics", page:"statistics" },
    { label:"Privacy Policy", page:"privacy" },
  ];
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-4 pb-3">
        <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center shadow-sm"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>
        <h1 className="text-2xl font-black text-[#1C1A2E] flex-1" style={{ fontFamily:"Nunito, sans-serif" }}>Settings</h1>
      </div>
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="h-2"/>
        <SectionCard>
          {menuItems.map(({label,page:pg},i,arr)=>(
            <SettingRow key={pg} label={label} border={i<arr.length-1} onPress={()=>setPage(pg)} right={<ChevronRight2/>}/>
          ))}
        </SectionCard>
        <p className="text-center text-sm text-[#7A6F6A] mt-4" style={{ fontFamily:"DM Sans, sans-serif" }}>App Version: 2.0.0</p>
      </div>
    </div>
  );
}

// ── Auth ──────────────────────────────────────────────────────────────

function AuthField({ label,placeholder,type="text",value,onChange }: { label:string;placeholder:string;type?:string;value:string;onChange:(v:string)=>void; }) {
  const [show,setShow]=useState(false);
  const isPassword=type==="password";
  return (
    <div className="space-y-2">
      <label className="text-base font-bold text-[#1C1A2E] block" style={{ fontFamily:"Nunito, sans-serif" }}>{label}</label>
      <div className="relative">
        <input type={isPassword&&!show?"password":"text"} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          className="w-full bg-[#F5EDE0] rounded-2xl px-5 py-4 text-lg font-semibold text-[#1C1A2E] outline-none placeholder:text-[#C9BDB5] focus:ring-2 focus:ring-[#E8623A]/40" style={{ fontFamily:"DM Sans, sans-serif", paddingRight: isPassword?"3.5rem":undefined }}/>
        {isPassword&&(
          <button type="button" onClick={()=>setShow(s=>!s)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7A6F6A] hover:text-[#E8623A] transition-colors active:scale-90">
            {show ? <EyeOff size={20} strokeWidth={2}/> : <Eye size={20} strokeWidth={2}/>}
          </button>
        )}
      </div>
    </div>
  );
}

function LoginScreen({ onLogin,onSignUp,onForgot,onBack }: { onLogin:()=>void;onSignUp:()=>void;onForgot:()=>void;onBack?:()=>void; }) {
  const [email,setEmail]=useState("");const [password,setPassword]=useState("");const canLogin=email.trim()&&password.trim();
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="relative flex-shrink-0 flex flex-col items-center justify-center px-8 pt-6 pb-5" style={{ background:"linear-gradient(160deg,#E8623A,#F07B3A)" }}>
        {onBack&&<button onClick={onBack} className="absolute left-5 top-5 w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center active:scale-90 transition-all"><ArrowLeft size={18} className="text-white"/></button>}
        <h1 className="text-2xl font-black text-white leading-tight" style={{ fontFamily:"Nunito, sans-serif" }}>CanPlan 2.0</h1>
        <p className="text-white/80 text-sm font-semibold" style={{ fontFamily:"DM Sans, sans-serif" }}>Your daily task guide</p>
      </div>
      <div className="flex-1 flex flex-col px-6 pt-5 pb-4">
        <h2 className="text-2xl font-black text-[#1C1A2E] mb-4" style={{ fontFamily:"Nunito, sans-serif" }}>Sign In</h2>
        <div className="space-y-3"><AuthField label="Email address" placeholder="e.g. alex@email.com" value={email} onChange={setEmail}/><AuthField label="Password" placeholder="Enter your password" type="password" value={password} onChange={setPassword}/></div>
        <button onClick={onForgot} className="text-right text-sm font-semibold mt-2 mb-1 text-[#E8623A]" style={{ fontFamily:"DM Sans, sans-serif" }}>Forgot password?</button>
        <button onClick={onLogin} className="w-full py-4 rounded-[1.75rem] font-black text-xl text-white transition-all active:scale-[0.98] mt-2" style={{ background:canLogin?"linear-gradient(135deg,#E8623A,#F07B3A)":"#C9BDB5", fontFamily:"Nunito, sans-serif" }}>Sign In</button>
        <div className="flex items-center gap-3 my-3"><div className="flex-1 h-px bg-[#E8D5C4]"/><span className="text-sm text-[#7A6F6A] font-semibold" style={{ fontFamily:"DM Sans, sans-serif" }}>or</span><div className="flex-1 h-px bg-[#E8D5C4]"/></div>
        <button onClick={onSignUp} className="w-full py-4 rounded-[1.75rem] font-black text-xl border-2 border-[#E8623A] text-[#E8623A] transition-all active:scale-[0.98]" style={{ fontFamily:"Nunito, sans-serif" }}>Create Account</button>
        <div className="flex-1"/><p className="text-center text-sm text-[#7A6F6A] mt-3" style={{ fontFamily:"DM Sans, sans-serif" }}>Need help? Ask a support person to assist you.</p>
      </div>
    </div>
  );
}

function SignUpScreen({ onBack,onNext }: { onBack:()=>void;onNext:()=>void; }) {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const passwordsMatch=password===confirmPassword;
  const mismatch=confirmPassword.length>0&&!passwordsMatch;
  const canCreate=email.trim()&&password.trim()&&passwordsMatch&&confirmPassword.length>0;
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-5 pt-5 pb-6 flex flex-col" style={{ background:"linear-gradient(160deg,#E8623A,#F07B3A)" }}>
        <button onClick={onBack} className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center mb-4"><ArrowLeft size={20} className="text-white"/></button>
        <h1 className="text-3xl font-black text-white" style={{ fontFamily:"Nunito, sans-serif" }}>Create Account</h1>
        <p className="text-white/80 text-base font-semibold mt-1" style={{ fontFamily:"DM Sans, sans-serif" }}>Step 1 of 3 — your login details</p>
      </div>
      <div className="flex-1 flex flex-col px-6 pt-6 pb-4 overflow-y-auto">
        <div className="space-y-4 mb-2">
          <AuthField label="Email address" placeholder="e.g. alex@email.com" value={email} onChange={setEmail}/>
          <AuthField label="Password" placeholder="Choose a password" type="password" value={password} onChange={setPassword}/>
          <div className="space-y-1">
            <AuthField label="Confirm Password" placeholder="Re-enter your password" type="password" value={confirmPassword} onChange={setConfirmPassword}/>
            {mismatch&&(
              <p className="text-sm font-semibold text-[#D4183D] px-1" style={{ fontFamily:"DM Sans, sans-serif" }}>Passwords do not match</p>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-4"/>
        <button onClick={onNext} disabled={!canCreate} className="w-full py-5 rounded-[1.75rem] font-black text-xl text-white transition-all active:scale-[0.98] mb-3" style={{ background:canCreate?"linear-gradient(135deg,#E8623A,#F07B3A)":"#C9BDB5", fontFamily:"Nunito, sans-serif", cursor:canCreate?"pointer":"not-allowed" }}>Continue →</button>
        <p className="text-center text-sm text-[#7A6F6A]" style={{ fontFamily:"DM Sans, sans-serif" }}>Already have an account?{" "}<button onClick={onBack} className="text-[#E8623A] font-bold underline">Sign in</button></p>
      </div>
    </div>
  );
}

function VerifyEmailScreen({ onVerified }: { onVerified:()=>void; }) {
  const [code,setCode]=useState(["","","","","",""]);const inputRefs=useRef<(HTMLInputElement|null)[]>([]);
  const handleChange=(i:number,val:string)=>{const d=val.replace(/\D/g,"").slice(-1);const n=[...code];n[i]=d;setCode(n);if(d&&i<5)inputRefs.current[i+1]?.focus();};
  const handleKeyDown=(i:number,e:React.KeyboardEvent)=>{if(e.key==="Backspace"&&!code[i]&&i>0)inputRefs.current[i-1]?.focus();};
  const allFilled=code.every(d=>d!=="");
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-5 pt-5 pb-6 flex flex-col" style={{ background:"linear-gradient(160deg,#E8623A,#F07B3A)" }}>
        <h1 className="text-3xl font-black text-white" style={{ fontFamily:"Nunito, sans-serif" }}>Check your email</h1>
        <p className="text-white/80 text-base font-semibold mt-1" style={{ fontFamily:"DM Sans, sans-serif" }}>Step 2 of 3 — verify your address</p>
      </div>
      <div className="flex-1 flex flex-col px-6 pt-7 pb-4">
        <p className="text-base text-[#7A6F6A] mb-6 leading-relaxed" style={{ fontFamily:"DM Sans, sans-serif" }}>We sent a 6-digit code to your email. Enter it below to verify your account.</p>
        <div className="flex gap-2 justify-center mb-7">{code.map((digit,i)=><input key={i} ref={el=>{inputRefs.current[i]=el;}} type="text" inputMode="numeric" maxLength={1} value={digit} onChange={e=>handleChange(i,e.target.value)} onKeyDown={e=>handleKeyDown(i,e)} className="w-11 h-14 text-center text-2xl font-black rounded-2xl border-2 outline-none transition-all" style={{ fontFamily:"Nunito, sans-serif", background:digit?"#FEF0EB":"#F5EDE0", borderColor:digit?"#E8623A":"transparent", color:"#1C1A2E" }}/>)}</div>
        <button onClick={onVerified} disabled={!allFilled} className="w-full py-5 rounded-[1.75rem] font-black text-xl text-white transition-all active:scale-[0.98]" style={{ background:allFilled?"linear-gradient(135deg,#E8623A,#F07B3A)":"#C9BDB5", fontFamily:"Nunito, sans-serif", cursor:allFilled?"pointer":"not-allowed" }}>Verify Email ✓</button>
        <div className="flex-1"/>
        <p className="text-center text-sm text-[#7A6F6A] mt-4" style={{ fontFamily:"DM Sans, sans-serif" }}>{"Didn't"} get a code?{" "}<button className="text-[#E8623A] font-bold underline">Resend email</button></p>
      </div>
    </div>
  );
}

function SignUpInfoScreen({ onDone }: { onDone:()=>void; }) {
  const [firstName,setFirstName]=useState("");const [lastName,setLastName]=useState("");const canContinue=firstName.trim();
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-5 pt-5 pb-6 flex flex-col" style={{ background:"linear-gradient(160deg,#E8623A,#F07B3A)" }}>
        <h1 className="text-3xl font-black text-white" style={{ fontFamily:"Nunito, sans-serif" }}>{"What's your name?"}</h1>
        <p className="text-white/80 text-base font-semibold mt-1" style={{ fontFamily:"DM Sans, sans-serif" }}>Step 3 of 3 — almost done!</p>
      </div>
      <div className="flex-1 flex flex-col px-6 pt-7 pb-4">
        <p className="text-base text-[#7A6F6A] mb-6 leading-relaxed" style={{ fontFamily:"DM Sans, sans-serif" }}>Tell us your name so we can personalise your experience.</p>
        <div className="space-y-4 mb-6"><AuthField label="First name" placeholder="e.g. Alex" value={firstName} onChange={setFirstName}/><AuthField label="Last name (optional)" placeholder="e.g. Smith" value={lastName} onChange={setLastName}/></div>
        <button onClick={onDone} disabled={!canContinue} className="w-full py-5 rounded-[1.75rem] font-black text-xl text-white transition-all active:scale-[0.98]" style={{ background:canContinue?"linear-gradient(135deg,#E8623A,#F07B3A)":"#C9BDB5", fontFamily:"Nunito, sans-serif", cursor:canContinue?"pointer":"not-allowed" }}>Get Started</button>
        <div className="flex-1"/>
      </div>
    </div>
  );
}

// ── Caregiver Portal ──────────────────────────────────────────────────

function ManagingBanner({ patient, onExit }: { patient:Patient; onExit:()=>void; }) {
  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-5 py-2.5" style={{ background:"#FEF0EB", borderBottom:"1px solid rgba(232,98,58,0.18)" }}>
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background:patient.avatarColor }}>
        <span className="text-xs font-black text-white" style={{ fontFamily:"Nunito, sans-serif" }}>{patient.firstName[0].toUpperCase()}</span>
      </div>
      <p className="flex-1 min-w-0 text-sm text-[#7A6F6A] truncate font-semibold" style={{ fontFamily:"DM Sans, sans-serif" }}>
        Managing <span className="font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>{patient.firstName}{patient.lastName?` ${patient.lastName}`:""}</span>
      </p>
      <button onClick={onExit} className="px-3 h-8 rounded-xl flex items-center justify-center active:scale-95 transition-all" style={{ background:"#E8623A" }}>
        <span className="text-xs font-black text-white" style={{ fontFamily:"Nunito, sans-serif" }}>Done</span>
      </button>
    </div>
  );
}

function WelcomeScreen({ onPatient, onCaregiver }: { onPatient:()=>void; onCaregiver:()=>void; }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex flex-col items-center justify-center px-8 pt-10 pb-9" style={{ background:"linear-gradient(160deg,#E8623A,#F07B3A)" }}>
        <h1 className="text-3xl font-black text-white leading-tight" style={{ fontFamily:"Nunito, sans-serif" }}>CanPlan 2.0</h1>
        <p className="text-white/80 text-base font-semibold mt-1" style={{ fontFamily:"DM Sans, sans-serif" }}>Your daily task guide</p>
      </div>
      <div className="flex-1 flex flex-col px-6 pt-7 pb-6">
        <h2 className="text-2xl font-black text-[#1C1A2E] mb-1" style={{ fontFamily:"Nunito, sans-serif" }}>Welcome!</h2>
        <p className="text-base text-[#7A6F6A] font-semibold mb-6" style={{ fontFamily:"DM Sans, sans-serif" }}>How will you use CanPlan?</p>
        <div className="space-y-4">
          <button onClick={onPatient} className="w-full rounded-[1.75rem] p-6 flex items-center gap-5 text-left active:scale-[0.98] transition-transform shadow-sm" style={{ background:"linear-gradient(135deg,#E8623A,#F07B3A)" }}>
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0"><Check size={28} className="text-white" strokeWidth={2.5}/></div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-black text-white" style={{ fontFamily:"Nunito, sans-serif" }}>I use CanPlan</p>
              <p className="text-white/80 text-sm font-semibold mt-0.5" style={{ fontFamily:"DM Sans, sans-serif" }}>See and complete my own tasks</p>
            </div>
          </button>
          <button onClick={onCaregiver} className="w-full rounded-[1.75rem] p-6 flex items-center gap-5 text-left active:scale-[0.98] transition-transform shadow-sm bg-white border border-black/[0.06]">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background:"#EBF9F8" }}><Heart size={26} style={{ color:"#3DB8AD" }} strokeWidth={2.2}/></div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>{"I'm a caregiver"}</p>
              <p className="text-[#7A6F6A] text-sm font-semibold mt-0.5" style={{ fontFamily:"DM Sans, sans-serif" }}>Help manage tasks for someone I support</p>
            </div>
          </button>
        </div>
        <div className="flex-1"/>
        <p className="text-center text-sm text-[#7A6F6A]" style={{ fontFamily:"DM Sans, sans-serif" }}>You can switch any time by signing out.</p>
      </div>
    </div>
  );
}

function CaregiverLoginScreen({ onLogin, onForgot, onBack }: { onLogin:()=>void; onForgot:()=>void; onBack:()=>void; }) {
  const [email,setEmail]=useState("");const [password,setPassword]=useState("");const canLogin=email.trim()&&password.trim();
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="relative flex-shrink-0 flex flex-col items-center justify-center px-8 pt-6 pb-5" style={{ background:"linear-gradient(160deg,#E8623A,#F07B3A)" }}>
        <button onClick={onBack} className="absolute left-5 top-5 w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center active:scale-90 transition-all"><ArrowLeft size={18} className="text-white"/></button>
        <h1 className="text-2xl font-black text-white leading-tight" style={{ fontFamily:"Nunito, sans-serif" }}>CanPlan 2.0</h1>
        <p className="text-white/80 text-sm font-semibold" style={{ fontFamily:"DM Sans, sans-serif" }}>Caregiver sign in</p>
      </div>
      <div className="flex-1 flex flex-col px-6 pt-6 pb-4">
        <h2 className="text-2xl font-black text-[#1C1A2E] mb-1" style={{ fontFamily:"Nunito, sans-serif" }}>Sign In</h2>
        <p className="text-sm text-[#7A6F6A] font-semibold mb-5" style={{ fontFamily:"DM Sans, sans-serif" }}>Access the people you support</p>
        <div className="space-y-3"><AuthField label="Email address" placeholder="e.g. sam@email.com" value={email} onChange={setEmail}/><AuthField label="Password" placeholder="Enter your password" type="password" value={password} onChange={setPassword}/></div>
        <button onClick={onForgot} className="text-right text-sm font-semibold mt-2 mb-1 text-[#E8623A]" style={{ fontFamily:"DM Sans, sans-serif" }}>Forgot password?</button>
        <button onClick={onLogin} className="w-full py-4 rounded-[1.75rem] font-black text-xl text-white transition-all active:scale-[0.98] mt-2" style={{ background:canLogin?"linear-gradient(135deg,#E8623A,#F07B3A)":"#C9BDB5", fontFamily:"Nunito, sans-serif" }}>Sign In</button>
        <div className="flex-1"/>
        <p className="text-center text-sm text-[#7A6F6A]" style={{ fontFamily:"DM Sans, sans-serif" }}>Caregiver accounts are set up by your CanPlan administrator.</p>
      </div>
    </div>
  );
}

function CaregiverForgotScreen({ onBack }: { onBack:()=>void; }) {
  return <ForgotPasswordScreen onBack={onBack}/>;
}

function CaregiverHomeScreen({ caregiver, patients, patientData, onOpenPatient, onAddPatient, onReportAll, onSettings, onSignOut }: {
  caregiver:Caregiver|null; patients:Patient[]; patientData:Record<string,{tasks:Task[];categories:Category[]}>;
  onOpenPatient:(id:string)=>void; onAddPatient:()=>void; onReportAll:()=>void; onSettings:()=>void; onSignOut:()=>void;
}) {
  const [confirmSignOut,setConfirmSignOut]=useState(false);
  const [query,setQuery]=useState("");
  const today=new Date().toLocaleDateString("en-CA",{weekday:"long",month:"long",day:"numeric"});
  const name=caregiver?.firstName??"there";
  const q=query.trim().toLowerCase();
  const filtered=q?patients.filter(p=>`${p.firstName} ${p.lastName??""}`.toLowerCase().includes(q)):patients;
  return (
    <div className="flex-1 overflow-y-auto px-6 pt-5 pb-8">
      <div className="flex items-center justify-between mb-1">
        <p className="text-base text-[#7A6F6A] font-semibold" style={{ fontFamily:"DM Sans, sans-serif" }}>{today}</p>
        <div className="flex items-center gap-2">
          <button onClick={onSettings} className="w-9 h-9 rounded-xl bg-[#F5EDE0] flex items-center justify-center active:scale-90 transition-all"><Settings size={17} className="text-[#7A6F6A]"/></button>
          <button onClick={()=>setConfirmSignOut(true)} className="px-3 py-1.5 rounded-xl bg-[#F5EDE0] text-[#7A6F6A] hover:bg-[#FEE8E8] hover:text-[#D4183D] transition-all text-xs font-bold" style={{ fontFamily:"Nunito, sans-serif" }}>Sign out</button>
        </div>
      </div>
      <h1 className="text-4xl font-black text-[#1C1A2E] leading-tight mt-3 mb-1" style={{ fontFamily:"Nunito, sans-serif" }}>Hi {name}!</h1>
      <p className="text-base text-[#7A6F6A] font-semibold mb-5" style={{ fontFamily:"DM Sans, sans-serif" }}>{patients.length>0?"Who would you like to help today?":"Add someone to get started."}</p>
      {patients.length>0&&(
        <div className="relative mb-5">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#C9BDB5]"/>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search people"
            className="w-full bg-[#F5EDE0] rounded-2xl pl-11 pr-10 py-3.5 text-base font-semibold text-[#1C1A2E] outline-none placeholder:text-[#C9BDB5] focus:ring-2 focus:ring-[#E8623A]/40" style={{ fontFamily:"DM Sans, sans-serif" }}/>
          {query&&<button onClick={()=>setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#E8D5C4]/60 flex items-center justify-center active:scale-90"><X size={14} className="text-[#7A6F6A]" strokeWidth={2.5}/></button>}
        </div>
      )}
      <p className="text-xs font-bold text-[#7A6F6A] uppercase tracking-widest mb-3" style={{ fontFamily:"DM Sans, sans-serif" }}>People you support</p>
      <div className="space-y-3">
        {filtered.length===0&&(
          <div className="py-10 text-center">
            <p className="text-base font-bold text-[#7A6F6A]" style={{ fontFamily:"DM Sans, sans-serif" }}>No people match "{query}"</p>
          </div>
        )}
        {filtered.map(p=>{
          const ts=patientData[p.id]?.tasks??[];
          const total=ts.length;
          const todo=ts.filter(t=>!(t.steps.length>0&&t.steps.every(s=>s.completed))).length;
          const initials=(p.firstName[0]+(p.lastName?.[0]??"")).toUpperCase();
          return (
            <button key={p.id} onClick={()=>onOpenPatient(p.id)} className="w-full bg-white rounded-[1.75rem] p-4 flex items-center gap-4 text-left shadow-sm border border-black/[0.06] active:scale-[0.98] transition-transform">
              <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0" style={{ background:p.avatarColor }}>
                <span className="text-xl font-black text-white" style={{ fontFamily:"Nunito, sans-serif" }}>{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xl font-black text-[#1C1A2E] truncate" style={{ fontFamily:"Nunito, sans-serif" }}>{p.firstName}{p.lastName?` ${p.lastName}`:""}</p>
                <p className="text-sm text-[#7A6F6A] font-semibold mt-0.5" style={{ fontFamily:"DM Sans, sans-serif" }}>{total===0?"No tasks yet":`${total} task${total!==1?"s":""} · ${todo} to do`}</p>
              </div>
              <svg width="20" height="20" viewBox="0 0 18 18" fill="none"><path d="M7 5l4 4-4 4" stroke="#E8623A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          );
        })}
      </div>
      <button onClick={onAddPatient} className="w-full mt-4 py-5 rounded-[1.75rem] border-2 border-dashed border-[#E8623A]/40 flex items-center justify-center gap-3 text-[#E8623A] font-black text-lg hover:border-[#E8623A]/70 hover:bg-[#E8623A]/5 transition-all active:scale-[0.98]" style={{ fontFamily:"Nunito, sans-serif" }}>
        <UserPlus size={22} strokeWidth={2.5}/> Add a person
      </button>
      {patients.length>0&&(
        <button onClick={onReportAll} className="w-full mt-3 py-4 rounded-[1.75rem] bg-white border border-black/[0.06] shadow-sm flex items-center justify-center gap-2.5 text-[#1C1A2E] font-black text-base active:scale-[0.98] transition-transform" style={{ fontFamily:"Nunito, sans-serif" }}>
          <FileText size={19} strokeWidth={2.5} style={{ color:"#E8623A" }}/> Report for everyone
        </button>
      )}
      {confirmSignOut && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background:"rgba(0,0,0,0.4)" }}>
          <div className="w-full bg-white rounded-t-[2rem] p-6 space-y-4" style={{ maxWidth:390 }}>
            <p className="text-2xl font-black text-[#1C1A2E] text-center" style={{ fontFamily:"Nunito, sans-serif" }}>Sign out?</p>
            <p className="text-base text-[#7A6F6A] text-center" style={{ fontFamily:"DM Sans, sans-serif" }}>You will need to sign in again next time.</p>
            <button onClick={()=>{setConfirmSignOut(false);onSignOut();}} className="w-full py-4 rounded-2xl font-black text-lg text-white active:scale-[0.98]" style={{ background:"#D4183D", fontFamily:"Nunito, sans-serif" }}>Yes, sign out</button>
            <button onClick={()=>setConfirmSignOut(false)} className="w-full py-4 rounded-2xl font-black text-lg text-[#1C1A2E] bg-[#F5EDE0] active:scale-[0.98]" style={{ fontFamily:"Nunito, sans-serif" }}>Stay signed in</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CaregiverOverviewScreen({ patient, tasks, categories, showCaregiverTags=true, onBack, onManage, onOpenTask, onReport }: {
  patient:Patient; tasks:Task[]; categories:Category[]; showCaregiverTags?:boolean; onBack:()=>void; onManage:()=>void; onOpenTask:(id:number)=>void; onReport:()=>void;
}) {
  const today=new Date();
  const counts={ todo:0, overdue:0, done:0, skipped:0 };
  let totalSteps=0, doneSteps=0;
  const withStatus=tasks.map(t=>{
    const st=computeTaskStatus(t,today);
    counts[st]++;
    if(st!=="skipped"){ totalSteps+=t.steps.length; doneSteps+=t.steps.filter(s=>s.completed).length; }
    return { task:t, status:st };
  });
  const pct=totalSteps?Math.round((doneSteps/totalSteps)*100):0;
  const initials=(patient.firstName[0]+(patient.lastName?.[0]??"")).toUpperCase();
  const STAT_ORDER:TaskStatus[]=["todo","overdue","done","skipped"];
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-4 pb-4" style={{ background:patient.avatarColor+"22" }}>
        <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white/80 border border-black/[0.08] flex items-center justify-center shadow-sm flex-shrink-0"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>
        <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background:patient.avatarColor }}>
          <span className="text-lg font-black text-white" style={{ fontFamily:"Nunito, sans-serif" }}>{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black text-[#1C1A2E] truncate leading-tight" style={{ fontFamily:"Nunito, sans-serif" }}>{patient.firstName}{patient.lastName?` ${patient.lastName}`:""}</h1>
          <p className="text-sm text-[#7A6F6A] font-semibold" style={{ fontFamily:"DM Sans, sans-serif" }}>{tasks.length} task{tasks.length!==1?"s":""} · {pct}% complete</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6">
        <p className="text-xs font-bold text-[#7A6F6A] uppercase tracking-widest mb-2" style={{ fontFamily:"DM Sans, sans-serif" }}>At a glance</p>
        <div className="flex gap-2 mb-4">
          {STAT_ORDER.map(st=>(
            <div key={st} className="flex-1 bg-white rounded-[1.25rem] border border-black/[0.06] shadow-sm px-1.5 py-3.5 text-center">
              <p className="text-2xl font-black leading-none" style={{ color:STATUS_META[st].color, fontFamily:"Nunito, sans-serif" }}>{counts[st]}</p>
              <p className="text-[10px] font-bold text-[#7A6F6A] mt-1.5 uppercase tracking-wide" style={{ fontFamily:"DM Sans, sans-serif" }}>{STATUS_META[st].label}</p>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-[1.5rem] border border-black/[0.06] shadow-sm p-5 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>Overall progress</p>
            <p className="text-sm font-black" style={{ color:pct===100?"#3DB8AD":"#E8623A", fontFamily:"Nunito, sans-serif" }}>{pct}%</p>
          </div>
          <div className="h-2.5 bg-[#F5EDE0] rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width:`${pct}%`, background:pct===100?"#3DB8AD":"#E8623A" }}/></div>
          <p className="text-xs text-[#7A6F6A] font-semibold mt-2" style={{ fontFamily:"DM Sans, sans-serif" }}>{doneSteps} of {totalSteps} steps completed</p>
        </div>
        <div className="flex gap-3 mb-5">
          <button onClick={onManage} className="flex-1 py-4 rounded-[1.5rem] font-black text-base text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-sm" style={{ background:"linear-gradient(135deg,#E8623A,#F07B3A)", fontFamily:"Nunito, sans-serif" }}>
            <ClipboardList size={19} strokeWidth={2.5}/> Manage tasks
          </button>
          <button onClick={onReport} className="flex-1 py-4 rounded-[1.5rem] font-black text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform bg-white border-2 border-[#E8623A] text-[#E8623A]" style={{ fontFamily:"Nunito, sans-serif" }}>
            <FileText size={19} strokeWidth={2.5}/> Report
          </button>
        </div>
        <p className="text-xs font-bold text-[#7A6F6A] uppercase tracking-widest mb-3" style={{ fontFamily:"DM Sans, sans-serif" }}>Tasks</p>
        {tasks.length===0?(
          <div className="py-10 text-center">
            <p className="text-base font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>No tasks yet</p>
            <p className="text-sm text-[#7A6F6A] mt-1" style={{ fontFamily:"DM Sans, sans-serif" }}>Tap "Manage tasks" to add one</p>
          </div>
        ):(
          <div className="space-y-3">
            {withStatus.map(({task,status})=>{
              const cat=categories.find(c=>c.id===task.category);
              const done=task.steps.filter(s=>s.completed).length;const total=task.steps.length;
              return (
                <button key={task.id} onClick={()=>onOpenTask(task.id)} className="w-full bg-white rounded-[1.5rem] border border-black/[0.06] shadow-sm overflow-hidden flex items-center text-left active:scale-[0.98] transition-transform">
                  {cat&&<div className="w-1.5 self-stretch flex-shrink-0" style={{ background:cat.color }}/>}
                  <div className="flex-1 min-w-0 p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-base font-black text-[#1C1A2E]" style={{ fontFamily:"Nunito, sans-serif" }}>{task.title}</p>
                      {task.caregiverEdited&&showCaregiverTags&&<CaregiverTag/>}{task.skipped&&<SkippedTag/>}
                    </div>
                    <p className="text-xs text-[#7A6F6A] font-semibold mt-0.5" style={{ fontFamily:"DM Sans, sans-serif" }}>{total===0?"No steps":`${done}/${total} steps`}</p>
                  </div>
                  <span className="px-2.5 h-6 rounded-full flex items-center mr-3 flex-shrink-0" style={{ background:STATUS_META[status].color }}>
                    <span className="text-[11px] font-black text-white" style={{ fontFamily:"Nunito, sans-serif" }}>{STATUS_META[status].label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CaregiverAddPatientScreen({ onBack, onLink }: { onBack:()=>void; onLink:(first:string,last?:string)=>void; }) {
  const [first,setFirst]=useState("");const [last,setLast]=useState("");const [code,setCode]=useState("");
  const codeOk=/\S+@\S+\.\S+/.test(code.trim())||code.trim().length>=6;
  const codeInvalid=code.trim().length>0&&!codeOk;
  const canLink=first.trim()&&codeOk;
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-4 pb-3">
        <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center shadow-sm"><ArrowLeft size={22} className="text-[#1C1A2E]"/></button>
        <h1 className="text-2xl font-black text-[#1C1A2E] flex-1" style={{ fontFamily:"Nunito, sans-serif" }}>Add a person</h1>
      </div>
      <div className="flex-1 flex flex-col px-6 pt-3 pb-4 overflow-y-auto">
        <div className="bg-white rounded-[1.75rem] p-5 border border-black/[0.06] flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background:"#EBF9F8" }}><Heart size={20} style={{ color:"#3DB8AD" }} strokeWidth={2.2}/></div>
          <p className="flex-1 text-sm text-[#7A6F6A] font-semibold leading-relaxed" style={{ fontFamily:"DM Sans, sans-serif" }}>Link someone you support using their email or the invite code from their CanPlan app.</p>
        </div>
        <div className="space-y-4">
          <AuthField label="Their first name" placeholder="e.g. Jordan" value={first} onChange={setFirst}/>
          <AuthField label="Their last name (optional)" placeholder="e.g. Lee" value={last} onChange={setLast}/>
          <div className="space-y-1">
            <AuthField label="Email or invite code" placeholder="e.g. jordan@email.com" value={code} onChange={setCode}/>
            {codeInvalid&&<p className="text-sm font-semibold text-[#D4183D] px-1" style={{ fontFamily:"DM Sans, sans-serif" }}>Enter a valid email or a code of at least 6 characters</p>}
          </div>
        </div>
        <div className="flex-1 min-h-6"/>
        <button onClick={()=>canLink&&onLink(first.trim(),last.trim()||undefined)} disabled={!canLink} className="w-full py-5 rounded-[1.75rem] font-black text-xl text-white transition-all active:scale-[0.98]" style={{ background:canLink?"linear-gradient(135deg,#E8623A,#F07B3A)":"#C9BDB5", fontFamily:"Nunito, sans-serif", cursor:canLink?"pointer":"not-allowed" }}>Link this person</button>
      </div>
    </div>
  );
}

function ForgotPasswordScreen({ onBack }: { onBack:()=>void; }) {
  const [email,setEmail]=useState("");const [sent,setSent]=useState(false);const canSend=email.trim();
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-5 pt-5 pb-6 flex flex-col" style={{ background:"linear-gradient(160deg,#E8623A,#F07B3A)" }}>
        <button onClick={onBack} className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center mb-4"><ArrowLeft size={20} className="text-white"/></button>
        <h1 className="text-3xl font-black text-white" style={{ fontFamily:"Nunito, sans-serif" }}>Forgot Password</h1>
        <p className="text-white/80 text-base font-semibold mt-1" style={{ fontFamily:"DM Sans, sans-serif" }}>{"We'll"} send you a reset link</p>
      </div>
      <div className="flex-1 flex flex-col px-6 pt-7 pb-4">
        {!sent?(<>
          <p className="text-base text-[#7A6F6A] mb-6 leading-relaxed" style={{ fontFamily:"DM Sans, sans-serif" }}>Enter the email address linked to your account and we will send you a password reset link.</p>
          <AuthField label="Email address" placeholder="e.g. alex@email.com" value={email} onChange={setEmail}/>
          <button onClick={()=>setSent(true)} disabled={!canSend} className="w-full py-5 rounded-[1.75rem] font-black text-xl text-white transition-all active:scale-[0.98] mt-6" style={{ background:canSend?"linear-gradient(135deg,#E8623A,#F07B3A)":"#C9BDB5", fontFamily:"Nunito, sans-serif", cursor:canSend?"pointer":"not-allowed" }}>Send Reset Link</button>
        </>):(
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <h2 className="text-2xl font-black text-[#1C1A2E] mb-3" style={{ fontFamily:"Nunito, sans-serif" }}>Email sent!</h2>
            <p className="text-base text-[#7A6F6A] leading-relaxed mb-8" style={{ fontFamily:"DM Sans, sans-serif" }}>Check your inbox for the password reset link. It may take a few minutes to arrive.</p>
            <button onClick={onBack} className="w-full py-5 rounded-[1.75rem] font-black text-xl border-2 border-[#E8623A] text-[#E8623A] transition-all active:scale-[0.98]" style={{ fontFamily:"Nunito, sans-serif" }}>Back to Sign In</button>
          </div>
        )}
        <div className="flex-1"/>
      </div>
    </div>
  );
}
