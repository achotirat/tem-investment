import { getUser } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

import { createExportBackup } from "../../src/server/export-backup-service";
import { NetlifyBlobExportBackupRepository } from "../../src/server/export-backup-repository";
import { NetlifyHouseholdRepository } from "../../src/server/households-repository";
import type { EncryptedExportBackupPayload } from "../../src/shared/export-backup";

export default async function exportBackup(request: Request, _context: Context) {
  const identityUser = await getUser();
  if (!identityUser) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const identityUserId = normalizeIdentityUser(identityUser).identityUserId;
  if (!identityUserId) {
    return Response.json({ error: "Identity profile is missing an id." }, { status: 400 });
  }

  try {
    const householdRepository = new NetlifyHouseholdRepository();
    const bootstrap = await householdRepository.findByIdentityUserId(identityUserId);
    if (!bootstrap) return Response.json({ error: "Household not found." }, { status: 404 });

    const backupRepository = new NetlifyBlobExportBackupRepository();

    if (request.method === "GET") {
      const backups = await backupRepository.listBackups(bootstrap.household.id);
      return Response.json({ backups });
    }

    if (request.method === "POST") {
      const payload = (await request.json()) as EncryptedExportBackupPayload;
      const backup = await createExportBackup({
        repository: backupRepository,
        householdId: bootstrap.household.id,
        payload,
      });
      return Response.json({ backup });
    }

    return Response.json({ error: "Method not allowed." }, { status: 405 });
  } catch (error) {
    console.error("Unable to handle export backup request", error);
    const message =
      error instanceof Error ? error.message : "Unable to handle export backup request.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export const config: Config = {
  path: "/api/export-backup",
};

function normalizeIdentityUser(identityUser: unknown) {
  const user = identityUser as { id?: string; sub?: string };
  return { identityUserId: user.id ?? user.sub ?? "" };
}
