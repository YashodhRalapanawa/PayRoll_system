/** Report catalogue shared by the reports screen and the /api/reports route. */
export const REPORT_TYPES = ["employee", "attendance", "leave", "payroll", "register", "epf", "department", "custom", "activity"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Reports that are filtered by a pay period. */
export const PERIOD_REPORTS: readonly ReportType[] = ["attendance", "leave", "payroll", "register", "epf", "department"];

/** Fields the custom report may include (whitelist; nothing else can be requested). */
export const CUSTOM_FIELDS = ["Emp ID", "Name", "NIC", "Department", "Designation", "Phone", "Email", "Join Date", "Type", "Status", "EPF No", "Bank"] as const;
