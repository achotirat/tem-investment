import { getUser } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

import { createDecisionLog } from "../../src/server/discipline-service";
import { NetlifyDecisionRepository } from "../../src/server/decisions-repository";
import { NetlifyHouseholdRepository } from "../../src/server/households-repository";
import type { DecisionLogInput } from "../../src/shared/discipline";

export default async function decisions(request: Request, _context: Context) {
  const identityUser = await getUser();

  if (!identityUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = normalizeIdentityUser(identityUser);
  if (!profile.identityUserId) {
    return Response.json({ error: "Identity profile is missing an id." }, { status: 400 });
  }

  try {
    const householdRepository = new NetlifyHouseholdRepository();
    const bootstrap = await householdRepository.findByIdentityUserId(profile.identityUserId);
    if (!bootstrap) {
      return Response.json({ error: "Household not found." }, { status: 404 });
    }

    const decisionRepository = new NetlifyDecisionRepository();

    if (request.method === "GET") {
      const logs = await decisionRepository.listByHousehold(bootstrap.household.id);
      return Response.json({ decisions: logs });
    }

    if (request.method === "POST") {
      const payload = (await request.json()) as DecisionLogInput;
      const created = await createDecisionLog(decisionRepository, {
        ...payload,
        householdId: bootstrap.household.id,
        actorIdentityUserId: profile.identityUserId,
      });
      return Response.json(created, { status: 201 });
    }

    return Response.json({ error: "Method not allowed." }, { status: 405 });
  } catch (error) {
    console.error("Unable to handle decisions request", error);
    const message = error instanceof Error ? error.message : "Unable to handle decisions request.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export const config: Config = {
  path: "/api/decisions",
};

function normalizeIdentityUser(identityUser: unknown) {
  const user = identityUser as {
    id?: string;
    sub?: string;
  };

  return {
    identityUserId: user.id ?? user.sub ?? "",
  };
}
