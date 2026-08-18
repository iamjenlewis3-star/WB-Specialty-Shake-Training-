/**
 * Central permission catalog. Every capability in Wahlburgers Academy is
 * expressed as a permission key; roles are bundles of these keys and the
 * server-side guards in `src/lib/auth/guard.ts` are the only enforcement point
 * that matters (navigation hiding is cosmetic only).
 */

export const PERMISSIONS = [
  // People
  { key: "users.view", label: "View users", category: "People" },
  { key: "users.edit", label: "Edit users", category: "People" },
  { key: "users.create", label: "Create users", category: "People" },
  { key: "users.import", label: "Import users", category: "People" },
  { key: "users.deactivate", label: "Deactivate users", category: "People" },
  { key: "users.reactivate", label: "Reactivate users", category: "People" },
  { key: "users.transfer", label: "Transfer employees", category: "People" },
  { key: "transcripts.view", label: "View transcripts", category: "People" },
  // Training operations
  { key: "training.assign", label: "Assign training", category: "Training" },
  { key: "training.schedule", label: "Schedule training", category: "Training" },
  { key: "training.validate", label: "Manager validation & sign-off", category: "Training" },
  { key: "live_training.manage", label: "Manage instructor-led training", category: "Training" },
  { key: "campaigns.manage", label: "Manage training campaigns", category: "Training" },
  { key: "rules.manage", label: "Manage automated assignment rules", category: "Training" },
  // Content
  { key: "courses.create", label: "Create courses", category: "Content" },
  { key: "courses.edit", label: "Edit courses", category: "Content" },
  { key: "courses.publish", label: "Publish courses", category: "Content" },
  { key: "courses.archive", label: "Archive courses", category: "Content" },
  { key: "assets.manage", label: "Manage asset library", category: "Content" },
  { key: "scorm.upload", label: "Upload SCORM packages", category: "Content" },
  { key: "assessments.manage", label: "Manage assessments", category: "Content" },
  { key: "certifications.manage", label: "Manage certifications", category: "Content" },
  { key: "badges.manage", label: "Manage badges", category: "Content" },
  { key: "learning_paths.manage", label: "Manage learning paths", category: "Content" },
  // Reporting
  { key: "reports.view", label: "View reports", category: "Reporting" },
  { key: "reports.export", label: "Export reports", category: "Reporting" },
  { key: "reports.schedule", label: "Schedule reports", category: "Reporting" },
  { key: "analytics.executive", label: "Access executive analytics", category: "Reporting" },
  // Organization
  { key: "locations.manage", label: "Manage locations", category: "Organization" },
  { key: "franchise.manage", label: "Manage franchise groups & regions", category: "Organization" },
  { key: "permissions.manage", label: "Manage roles & permissions", category: "Organization" },
  { key: "settings.manage", label: "Manage system settings", category: "Organization" },
  { key: "audit.view", label: "View audit logs", category: "Organization" },
  { key: "migration.run", label: "Run data migration", category: "Organization" },
  // Communication
  { key: "feed.manage", label: "Manage Academy Feed", category: "Communication" },
  { key: "feed.moderate", label: "Moderate comments", category: "Communication" },
  { key: "announcements.publish", label: "Publish announcements", category: "Communication" },
  { key: "notifications.send", label: "Send reminders & notifications", category: "Communication" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as PermissionKey[];

export type ScopeLevel =
  | "self"
  | "location"
  | "multi_location"
  | "franchise_group"
  | "region"
  | "organization";

export interface RoleDefinition {
  code: string;
  name: string;
  description: string;
  scopeLevel: ScopeLevel;
  isLearnerRole: boolean;
  sortOrder: number;
  permissions: PermissionKey[] | "*";
  readOnly?: boolean;
}

const MANAGER_BASE: PermissionKey[] = [
  "users.view",
  "transcripts.view",
  "training.assign",
  "training.schedule",
  "training.validate",
  "reports.view",
  "reports.export",
  "notifications.send",
];

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    code: "system_admin",
    name: "System Administrator",
    description: "Full platform control including permissions, migration and settings.",
    scopeLevel: "organization",
    isLearnerRole: false,
    sortOrder: 1,
    permissions: "*",
  },
  {
    code: "corp_training",
    name: "Corporate Training Administrator",
    description: "Owns content, assignments, certifications and systemwide reporting.",
    scopeLevel: "organization",
    isLearnerRole: false,
    sortOrder: 2,
    permissions: [
      "users.view", "users.edit", "users.create", "users.import", "users.deactivate", "users.reactivate",
      "users.transfer", "transcripts.view", "training.assign", "training.schedule", "training.validate",
      "live_training.manage", "campaigns.manage", "rules.manage", "courses.create", "courses.edit",
      "courses.publish", "courses.archive", "assets.manage", "scorm.upload", "assessments.manage",
      "certifications.manage", "badges.manage", "learning_paths.manage", "reports.view", "reports.export",
      "reports.schedule", "analytics.executive", "feed.manage", "feed.moderate", "announcements.publish",
      "notifications.send", "migration.run", "audit.view",
    ],
  },
  {
    code: "corp_ops",
    name: "Corporate Operations",
    description: "Systemwide operational visibility, scheduling and reporting.",
    scopeLevel: "organization",
    isLearnerRole: false,
    sortOrder: 3,
    permissions: [
      "users.view", "transcripts.view", "training.assign", "training.schedule", "live_training.manage",
      "reports.view", "reports.export", "reports.schedule", "analytics.executive", "announcements.publish",
      "notifications.send", "campaigns.manage",
    ],
  },
  {
    code: "executive",
    name: "Executive Leadership",
    description: "Read-only systemwide analytics and reporting.",
    scopeLevel: "organization",
    isLearnerRole: false,
    sortOrder: 4,
    readOnly: true,
    permissions: ["users.view", "transcripts.view", "reports.view", "reports.export", "analytics.executive"],
  },
  {
    code: "fbp",
    name: "Franchise Business Partner",
    description: "Portfolio of assigned restaurants with full reporting visibility.",
    scopeLevel: "multi_location",
    isLearnerRole: false,
    sortOrder: 5,
    permissions: [...MANAGER_BASE, "analytics.executive"],
  },
  {
    code: "franchise_owner",
    name: "Franchise Owner",
    description: "All locations owned by their franchise group.",
    scopeLevel: "franchise_group",
    isLearnerRole: false,
    sortOrder: 6,
    permissions: [...MANAGER_BASE, "users.edit", "users.create"],
  },
  {
    code: "multi_unit",
    name: "Multi-Unit Operator",
    description: "Several restaurants within a franchise group.",
    scopeLevel: "multi_location",
    isLearnerRole: false,
    sortOrder: 7,
    permissions: [...MANAGER_BASE, "users.edit"],
  },
  {
    code: "gm",
    name: "General Manager",
    description: "Single restaurant team management and training execution.",
    scopeLevel: "location",
    isLearnerRole: true,
    sortOrder: 8,
    permissions: [...MANAGER_BASE, "users.edit", "users.create", "users.deactivate", "users.reactivate"],
  },
  {
    code: "agm",
    name: "Assistant General Manager",
    description: "Supports the GM with team training oversight.",
    scopeLevel: "location",
    isLearnerRole: true,
    sortOrder: 9,
    permissions: [...MANAGER_BASE],
  },
  {
    code: "training_manager",
    name: "Training Manager",
    description: "Restaurant-level trainer with scheduling and validation rights.",
    scopeLevel: "location",
    isLearnerRole: true,
    sortOrder: 10,
    permissions: [...MANAGER_BASE],
  },
  {
    code: "dept_manager",
    name: "Department Manager",
    description: "Kitchen or dining room leader responsible for their department.",
    scopeLevel: "location",
    isLearnerRole: true,
    sortOrder: 11,
    permissions: ["users.view", "transcripts.view", "training.validate", "reports.view", "notifications.send"],
  },
  {
    code: "shift_leader",
    name: "Shift Leader",
    description: "Shift-level visibility into team training status.",
    scopeLevel: "location",
    isLearnerRole: true,
    sortOrder: 12,
    permissions: ["users.view", "reports.view"],
  },
  {
    code: "hourly",
    name: "Hourly Employee",
    description: "Learner access to their own training only.",
    scopeLevel: "self",
    isLearnerRole: true,
    sortOrder: 13,
    permissions: [],
  },
];

export function roleDefinition(code: string): RoleDefinition | undefined {
  return ROLE_DEFINITIONS.find((r) => r.code === code);
}

export function permissionsForRole(code: string): PermissionKey[] {
  const def = roleDefinition(code);
  if (!def) return [];
  return def.permissions === "*" ? [...ALL_PERMISSION_KEYS] : [...def.permissions];
}
