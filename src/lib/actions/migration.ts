"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth/guard";
import { logAudit } from "@/lib/services/audit";
import {
  dataTypeDefinition, executeMigration, parseUpload, readUpload,
  type DataType, type MatchOptions,
} from "@/lib/services/migration";

/** Migration wizard: upload → map → validate → import → report. */

export async function uploadMigrationFile(formData: FormData): Promise<void> {
  const actor = await assertPermission(["migration.run", "users.import"]);
  const file = formData.get("file");
  const dataType = String(formData.get("data_type") ?? "employees") as DataType;
  const returnTo = String(formData.get("return_to") ?? "/admin/migration");
  if (!dataTypeDefinition(dataType)) redirect(`${returnTo}?toast=${encodeURIComponent("Choose what kind of data you're importing.")}&tone=error`);
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${returnTo}?toast=${encodeURIComponent("Choose a CSV or XLSX file.")}&tone=error`);
  }
  if (file.size > 60 * 1024 * 1024) {
    redirect(`${returnTo}?toast=${encodeURIComponent("Files must be 60 MB or smaller.")}&tone=error`);
  }
  const name = file.name.toLowerCase();
  if (!/\.(csv|xlsx|xls|tsv)$/.test(name)) {
    redirect(`${returnTo}?toast=${encodeURIComponent("Only CSV and XLSX files are supported.")}&tone=error`);
  }

  let parsed;
  try {
    parsed = parseUpload(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (error) {
    redirect(`${returnTo}?toast=${encodeURIComponent((error as Error).message)}&tone=error`);
  }

  await logAudit(actor, {
    action: "migration.file_uploaded", entityType: "migration",
    entityLabel: `${file.name} (${parsed.totalRows} rows, ${dataType})`,
  });
  redirect(`/admin/migration/${parsed.uploadId}?type=${dataType}&return=${encodeURIComponent(returnTo)}`);
}

function optionsFrom(formData: FormData): MatchOptions {
  return {
    matchBy: (String(formData.get("match_by") ?? "employee_id") as MatchOptions["matchBy"]),
    createMissingEmployees: formData.get("create_missing_employees") === "on",
    createMissingCourses: formData.get("create_missing_courses") === "on",
    skipDuplicates: formData.get("skip_duplicates") !== "off",
  };
}

function mappingFrom(formData: FormData, dataType: DataType): Record<string, string> {
  const definition = dataTypeDefinition(dataType)!;
  const mapping: Record<string, string> = {};
  for (const field of definition.fields) {
    const value = String(formData.get(`map_${field.key}`) ?? "");
    if (value) mapping[field.key] = value;
  }
  return mapping;
}

/** Runs validation only, so the administrator can resolve conflicts before importing. */
export async function validateMigration(formData: FormData): Promise<void> {
  await assertPermission(["migration.run", "users.import"]);
  const uploadId = String(formData.get("upload_id") ?? "");
  const dataType = String(formData.get("data_type") ?? "employees") as DataType;
  const upload = readUpload(uploadId);
  if (!upload) redirect(`/admin/migration?toast=${encodeURIComponent("That upload has expired. Please upload the file again.")}&tone=error`);

  const mapping = mappingFrom(formData, dataType);
  const options = optionsFrom(formData);
  const params = new URLSearchParams({
    type: dataType, step: "validate", match_by: options.matchBy,
    create_employees: String(options.createMissingEmployees),
    create_courses: String(options.createMissingCourses),
    skip_duplicates: String(options.skipDuplicates),
    mapping: JSON.stringify(mapping),
  });
  redirect(`/admin/migration/${uploadId}?${params.toString()}`);
}

export async function runMigration(formData: FormData): Promise<void> {
  const actor = await assertPermission(["migration.run", "users.import"]);
  const uploadId = String(formData.get("upload_id") ?? "");
  const dataType = String(formData.get("data_type") ?? "employees") as DataType;
  const sourceSystem = String(formData.get("source_system") ?? "Legacy LMS");
  const upload = readUpload(uploadId);
  if (!upload) redirect(`/admin/migration?toast=${encodeURIComponent("That upload has expired. Please upload the file again.")}&tone=error`);

  const mapping = JSON.parse(String(formData.get("mapping") ?? "{}")) as Record<string, string>;
  const options = optionsFrom(formData);

  const result = await executeMigration({
    dataType,
    rows: upload.rows,
    mapping,
    options,
    sourceSystem,
    fileName: upload.fileName,
    actorId: actor.id,
    organizationId: actor.organizationId,
  });

  await logAudit(actor, {
    action: "migration.run", entityType: "migration", entityId: result.migrationId,
    entityLabel: `${dataTypeDefinition(dataType)?.label} — ${result.imported} imported, ${result.failed} failed`,
    newValue: { ...result, sourceSystem },
  });

  revalidatePath("/admin/migration");
  redirect(`/admin/migration/report/${result.migrationId}`);
}


