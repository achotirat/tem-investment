import { getUser } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

import { ensureHouseholdForUser } from "../../src/server/household-service";
import { NetlifyHouseholdRepository } from "../../src/server/households-repository";

export default async function bootstrap(_request: Request, _context: Context) {
  const identityUser = await getUser();

  if (!identityUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = normalizeIdentityUser(identityUser);
  if (!profile.identityUserId || !profile.email) {
    return Response.json({ error: "Identity profile is missing an id or email." }, { status: 400 });
  }

  try {
    const repository = new NetlifyHouseholdRepository();
    const household = await ensureHouseholdForUser(repository, profile);
    return Response.json(household);
  } catch (error) {
    console.error("Unable to bootstrap household", error);
    return Response.json({ error: "Unable to prepare household." }, { status: 500 });
  }
}

export const config: Config = {
  path: "/api/bootstrap",
};

function normalizeIdentityUser(identityUser: unknown) {
  const user = identityUser as {
    id?: string;
    sub?: string;
    email?: string;
    name?: string;
    user_metadata?: {
      full_name?: string;
      name?: string;
    };
  };

  return {
    identityUserId: user.id ?? user.sub ?? "",
    email: user.email ?? "",
    name: user.name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
  };
}
