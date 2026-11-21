import { describe, expect, it } from "vitest";
import { ApiError, dbError } from "@/lib/api/errors";
import { isSameOriginRequest, sniffFileType } from "@/lib/api/security";
import { requireRole } from "@/lib/auth/guard";
import { routeRedirect, safeNextPath } from "@/lib/auth/routes";
import { isLate, resolveStatus } from "@/lib/attendance-rules";

describe("CSRF origin check", () => {
  it("allows safe methods without an Origin", () => {
    expect(isSameOriginRequest("GET", null, "app.example.com")).toBe(true);
  });
  it("requires a same-host Origin for writes", () => {
    expect(isSameOriginRequest("POST", "https://app.example.com", "app.example.com")).toBe(true);
    expect(isSameOriginRequest("DELETE", "https://evil.com", "app.example.com")).toBe(false);
    expect(isSameOriginRequest("PATCH", null, "app.example.com")).toBe(false);
    expect(isSameOriginRequest("PUT", "null", "app.example.com")).toBe(false);
    expect(isSameOriginRequest("POST", "https://app.example.com.evil.com", "app.example.com")).toBe(false);
  });
});

describe("open-redirect protection", () => {
  it.each([
    ["/setup", "/setup"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["https://evil.com", "/"],
    ["javascript:alert(1)", "/"],
    [null, "/"],
  ])("safeNextPath(%s) -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("route access", () => {
  it("sends signed-out users to /login and signed-in users away from auth pages", () => {
    expect(routeRedirect("/dashboard", false)).toBe("/login");
    expect(routeRedirect("/employees/123", false)).toBe("/login");
    expect(routeRedirect("/login", true)).toBe("/");
    expect(routeRedirect("/register", false)).toBeNull();
    expect(routeRedirect("/dashboard", true)).toBeNull();
  });
  it("never redirects API routes or the auth callback", () => {
    expect(routeRedirect("/api/employees", false)).toBeNull();
    expect(routeRedirect("/auth/callback", false)).toBeNull();
    expect(routeRedirect("/reset-password", true)).toBeNull();
  });
});

describe("file type sniffing", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  it("detects real file signatures", () => {
    expect(sniffFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffFileType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffFileType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("application/pdf");
  });
  it("rejects HTML or scripts renamed as images", () => {
    expect(sniffFileType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffFileType(new TextEncoder().encode("<html><script>"))).toBeNull();
  });
});

describe("database error mapping", () => {
  it("never returns raw database messages for unknown errors", () => {
    const e = dbError({ code: "XX000", message: "internal: relation secret_table", details: "" });
    expect(e.status).toBe(500);
    expect(e.message).not.toMatch(/secret_table/);
  });
  it("hides RLS details", () => {
    const e = dbError({ code: "42501", message: 'new row violates row-level security policy for table "employees"', details: "" });
    expect(e.status).toBe(403);
    expect(e.message).not.toMatch(/employees/);
  });
  it("maps unique and foreign-key violations to friendly 409s", () => {
    const dup = dbError({ code: "23505", message: 'duplicate key value violates unique constraint "employees_company_id_emp_no_key"', details: "" });
    expect(dup).toEqual(expect.objectContaining({ status: 409, message: "This Employee ID is already in use." }));
    expect(dbError({ code: "23503", message: "fk", details: "" }).status).toBe(409);
  });
});

describe("requireRole", () => {
  const base = { userId: "u", email: "a@b.c", fullName: "A", companyId: "c" };
  it("blocks users without a company", () => {
    expect(() => requireRole({ ...base, companyId: null, role: "admin" }, ["admin"])).toThrow(ApiError);
  });
  it("enforces the role list", () => {
    expect(() => requireRole({ ...base, role: "viewer" }, ["admin", "hr_manager"])).toThrow(/permission/);
    expect(() => requireRole({ ...base, role: "hr_manager" }, ["admin"])).toThrow(/permission/);
    expect(() => requireRole({ ...base, role: "hr_manager" }, ["admin", "hr_manager"])).not.toThrow();
  });
});

describe("late rule", () => {
  it("allows the grace period and marks later arrivals late", () => {
    expect(isLate("08:30", "08:40", 10)).toBe(false);
    expect(isLate("08:30", "08:41", 10)).toBe(true);
    expect(isLate("22:00", "00:30", 10)).toBe(true); // night shift across midnight
    expect(isLate("22:00", "21:55", 10)).toBe(false);
  });
  it("only changes present/late", () => {
    expect(resolveStatus("present", "09:30", "08:30", 10)).toBe("late");
    expect(resolveStatus("late", "08:30", "08:30", 10)).toBe("present");
    expect(resolveStatus("half_day", "12:00", "08:30", 10)).toBe("half_day");
  });
});
