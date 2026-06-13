import { getUser } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

import { createHoldingWithManualValuation } from "../../src/server/holdings-service";
import { NetlifyHoldingRepository } from "../../src/server/holdings-repository";
import { NetlifyHouseholdRepository } from "../../src/server/households-repository";
import type { AddHoldingInput } from "../../src/shared/holdings";

export default async function holdings(request: Request, _context: Context) {
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

    const holdingsRepository = new NetlifyHoldingRepository();

    if (request.method === "GET") {
      const list = await holdingsRepository.listByHousehold(bootstrap.household.id);
      return Response.json({ holdings: list });
    }

    if (request.method === "POST") {
      const payload = (await request.json()) as AddHoldingInput;
      const created = await createHoldingWithManualValuation(holdingsRepository, {
        ...payload,
        householdId: bootstrap.household.id,
      });
      return Response.json(created, { status: 201 });
    }

    return Response.json({ error: "Method not allowed." }, { status: 405 });
  } catch (error) {
    console.error("Unable to handle holdings request", error);
    const message = error instanceof Error ? error.message : "Unable to handle holdings request.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export const config: Config = {
  path: "/api/holdings",
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
