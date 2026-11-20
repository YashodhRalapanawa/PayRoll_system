import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbError } from "@/lib/api/errors";
import type { z } from "zod";
import type { salaryStructureSchema } from "@/lib/validation";

type Input = z.output<typeof salaryStructureSchema>;

const itemRows = (structureId: string, input: Pick<Input, "allowances" | "deductions">) => [
  ...input.allowances.map((a, i) => ({ structure_id: structureId, kind: "allowance", name: a.name, amount_type: a.type, amount: a.amount, sort_order: i })),
  ...input.deductions.map((d, i) => ({ structure_id: structureId, kind: "deduction", name: d.name, amount_type: d.type, amount: d.amount, sort_order: i })),
];

/**
 * Replaces a structure's allowances and deductions. If inserting the new items
 * fails, the previous items are restored so a structure is never left half-saved.
 * Past payroll runs are unaffected: their lines store the calculated amounts.
 */
export async function replaceSalaryItems(supabase: SupabaseClient, structureId: string, input: Pick<Input, "allowances" | "deductions">) {
  const { data: previous, error: pErr } = await supabase
    .from("salary_items")
    .select("structure_id, kind, name, amount_type, amount, sort_order")
    .eq("structure_id", structureId);
  if (pErr) throw dbError(pErr);

  const { error: dErr } = await supabase.from("salary_items").delete().eq("structure_id", structureId);
  if (dErr) throw dbError(dErr);

  const rows = itemRows(structureId, input);
  if (!rows.length) return;
  const { error } = await supabase.from("salary_items").insert(rows);
  if (error) {
    if (previous?.length) await supabase.from("salary_items").insert(previous);
    throw dbError(error);
  }
}
