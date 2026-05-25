import workbookSeed from "./workbookSeed.js";

export const roleLabels = {
  sales: "Sales",
  delivery: "Delivery",
  finance: "Finance",
  admin: "Admin"
};

export const roleCredentials = {
  sales: { username: "sales", password: "sales@truefan" },
  delivery: { username: "delivery", password: "delivery@truefan" },
  finance: { username: "finance", password: "finance@truefan" },
  admin: { username: "admin", password: "admin@truefan" }
};

export const projectTypes = workbookSeed.settings.dropdowns.projectTypes;

export const languages = workbookSeed.settings.dropdowns.languages;

export const taskStatuses = [
  { id: "not-started", label: "Not started" },
  { id: "in-progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "delayed", label: "Delayed" },
  { id: "blocked", label: "Blocked" }
];

export const timelineItems = [
  "Brief",
  "Shoot",
  "AI model",
  "AI model training",
  "Creative sample",
  "Personalization setup",
  "QA",
  "Client review",
  "Final delivery"
];

export const escalationTypes = workbookSeed.settings.dropdowns.escalationTypes;

export const notificationRules = workbookSeed.settings.notificationRules.map((rule) => rule.name);

export function buildSeedData() {
  const seed = JSON.parse(JSON.stringify(workbookSeed));
  const hasHeadAudio = seed.users.some((user) => user.title === "Head Audio");

  if (!hasHeadAudio) {
    seed.users.push({
      id: "u-delivery-head-audio",
      name: "Head Audio",
      email: "head.audio@truefan.ai",
      role: "delivery",
      title: "Head Audio",
      team: "Audio",
      active: true
    });
  }

  return {
    ...seed,
    scrumNotes: seed.scrumNotes || [],
    scrumAssignments: seed.scrumAssignments || []
  };
}
