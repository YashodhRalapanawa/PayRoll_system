"use client";
import { use } from "react";
import { EmployeeForm } from "@/components/EmployeeForm";
import { EmptyState } from "@/components/ui";
import { UserX } from "lucide-react";
import { useStore } from "@/lib/store";

export default function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const emp = useStore((s) => s.employees.find((e) => e.id === id));
  if (!emp) return <EmptyState icon={UserX} title="Employee not found" />;
  return <EmployeeForm existing={emp} />;
}
