import type { CanvasState } from "../src/schema/canvas";

export type Category = "weekly-plan" | "project" | "meeting" | "habits" | "research" | "general";

export const CATEGORY_LABELS: Record<Category, string> = {
  "weekly-plan": "weekly plan",
  project: "project tracker",
  meeting: "meeting notes",
  habits: "habit tracker",
  research: "research brief",
  general: "workspace",
};

export function detectCategory(prompt: string): Category {
  const p = prompt.toLowerCase();
  if (/\b(meeting|agenda|minutes|stand-?up|retro)/.test(p)) return "meeting";
  if (/\b(habit|routine|streak|daily check)/.test(p)) return "habits";
  if (/\b(research|study|learn|literature|investigate|brief)/.test(p)) return "research";
  if (/\b(project|launch|milestone|roadmap|sprint|tracker)/.test(p)) return "project";
  if (/\b(week|weekly|schedule|calendar|planner|time[- ]?block|priorit)/.test(p)) return "weekly-plan";
  return "general";
}

const titleFrom = (prompt: string) => {
  const first = prompt.trim().split(/[.!?\n]/)[0]?.trim() ?? "";
  return first.length > 70 ? `${first.slice(0, 67)}…` : first || "Your workspace";
};

type Row = Record<string, string>;

/**
 * Offline planner used when no AI provider is configured. It returns the same JSON envelope
 * a model would, so the response goes through the exact same validation as AI output.
 */
export function planWorkspace(prompt: string, canvas: CanvasState) {
  const category = detectCategory(prompt);
  const used = new Set(Object.keys(canvas.blocks));
  const uid = (base: string) => {
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
  const text = (base: string, content: string) => ({
    op: "add_block",
    block: { id: uid(base), type: "text", format: "markdown", content },
  });
  const table = (base: string, title: string, columns: string[], rows: Row[]) => ({
    op: "add_block",
    block: {
      id: uid(base),
      type: "dashboard",
      columns: 12,
      widgets: [
        {
          id: `${base}-table`,
          kind: "table",
          title,
          span: 12,
          query: { connector: "static", statement: "static", params: { columns, rows } },
        },
      ],
    },
  });
  const label = CATEGORY_LABELS[category];
  const title = category === "general" ? titleFrom(prompt) : label.charAt(0).toUpperCase() + label.slice(1);

  const ops: unknown[] = [];
  switch (category) {
    case "weekly-plan":
      ops.push(
        text("plan-intro", `## ${title}\n\nPick up to three priorities, protect your focus time, and review on Friday.\n\n### Top priorities\n\n- [ ] Priority 1\n- [ ] Priority 2\n- [ ] Priority 3`),
        table("week", "Week at a glance", ["Day", "Focus block", "Main task", "Notes"], [
          { Day: "Monday", "Focus block": "9:00–11:00", "Main task": "Priority 1", Notes: "Plan the week" },
          { Day: "Tuesday", "Focus block": "9:00–11:00", "Main task": "Priority 1", Notes: "" },
          { Day: "Wednesday", "Focus block": "9:00–11:00", "Main task": "Priority 2", Notes: "" },
          { Day: "Thursday", "Focus block": "9:00–11:00", "Main task": "Priority 2", Notes: "" },
          { Day: "Friday", "Focus block": "9:00–10:00", "Main task": "Priority 3", Notes: "Weekly review" },
        ]),
        text("plan-review", "### Friday review\n\n- What moved forward?\n- What got in the way?\n- What carries over to next week?"),
      );
      break;
    case "project":
      ops.push(
        text("project-intro", `## ${title}\n\n**Goal:** describe the outcome this project should deliver.\n\nKeep milestones few and outcome-focused; update status as work moves.`),
        table("milestones", "Milestones", ["Milestone", "Owner", "Status", "Due"], [
          { Milestone: "Scope agreed", Owner: "Unassigned", Status: "Not started", Due: "TBD" },
          { Milestone: "Plan approved", Owner: "Unassigned", Status: "Not started", Due: "TBD" },
          { Milestone: "Delivery complete", Owner: "Unassigned", Status: "Not started", Due: "TBD" },
          { Milestone: "Launch / handoff", Owner: "Unassigned", Status: "Not started", Due: "TBD" },
        ]),
        table("next-actions", "Next actions", ["Action", "Owner", "Due"], [
          { Action: "Confirm scope and success criteria", Owner: "Unassigned", Due: "TBD" },
          { Action: "Identify risks and dependencies", Owner: "Unassigned", Due: "TBD" },
        ]),
        text("project-risks", "### Risks and blockers\n\n- Add the biggest risk here"),
      );
      break;
    case "meeting":
      ops.push(
        text("meeting-agenda", `## ${title}\n\n### Agenda\n\n1. Context and goals\n2. Updates\n3. Discussion\n4. Decisions and next steps`),
        table("actions", "Action items", ["Action", "Owner", "Due", "Status"], [
          { Action: "Capture the first action item", Owner: "Unassigned", Due: "TBD", Status: "Open" },
        ]),
        text("meeting-notes", "### Decisions\n\n- Record decisions here\n\n### Notes\n\n- Key points discussed"),
      );
      break;
    case "habits":
      ops.push(
        text("habits-intro", `## ${title}\n\nTrack a few habits you can realistically repeat. Tick them off daily and reflect weekly.`),
        table("habit-grid", "This week", ["Habit", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
          ["Habit 1", "Habit 2", "Habit 3"].map((Habit) => ({ Habit, Mon: "☐", Tue: "☐", Wed: "☐", Thu: "☐", Fri: "☐", Sat: "☐", Sun: "☐" })),
        ),
        text("habits-reflection", "### Weekly reflection\n\n- What went well?\n- What made it hard?\n- What will I adjust?"),
      );
      break;
    case "research":
      ops.push(
        text("research-question", `## ${title}\n\n**Key question:** what do you want to understand or decide?\n\n### Sub-questions\n\n- [ ] Question 1\n- [ ] Question 2`),
        table("sources", "Sources", ["Source", "Type", "Key takeaway", "Status"], [
          { Source: "Add a source", Type: "Article", "Key takeaway": "", Status: "To read" },
        ]),
        text("research-findings", "### Findings\n\n- Summarize what you learn\n\n### Open items\n\n- What is still unclear?"),
      );
      break;
    default:
      ops.push(
        text("workspace-intro", `## ${title}\n\nThis workspace was started from your request. Describe the outcome you want and refine it with follow-up prompts.`),
        text("workspace-next", "### Suggested next steps\n\n- [ ] Define the outcome you want\n- [ ] List the main steps\n- [ ] Pick the first action and a date"),
      );
  }
  ops.push({ op: "set_mode", mode: category === "weekly-plan" || category === "project" || category === "habits" ? "dashboard" : "document" });

  return {
    intent: `Create a ${CATEGORY_LABELS[category]}`,
    message: `Created a ${CATEGORY_LABELS[category]} from your prompt using the built-in templates. Connect an AI provider (see README) for tailored results.`,
    ops,
  };
}
