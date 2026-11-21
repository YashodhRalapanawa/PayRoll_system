/** Attendance rules shared by the API (authoritative) and the attendance screen. */

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Late rule: arriving more than `graceMins` after the shift start is "late".
 * Night shifts: an arrival in the early hours after a late-evening start is
 * treated as the same shift (difference wrapped into -12h..+12h).
 */
export function isLate(shiftStart: string, inTime: string, graceMins = 10): boolean {
  let diff = minutes(inTime) - minutes(shiftStart);
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return diff > graceMins;
}

/** Applies the late rule to Present/Late; other statuses are left as chosen. */
export function resolveStatus<S extends string>(status: S, inTime: string | null | undefined, shiftStart: string | null | undefined, graceMins = 10): S | "present" | "late" {
  if ((status !== "present" && status !== "late") || !inTime || !shiftStart) return status;
  return isLate(shiftStart, inTime, graceMins) ? "late" : "present";
}
