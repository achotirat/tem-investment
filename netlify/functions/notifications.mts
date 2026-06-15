import { getUser } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

import { NetlifyHouseholdRepository } from "../../src/server/households-repository";
import { NetlifyNotificationRepository } from "../../src/server/notifications-repository";

export default async function notifications(request: Request, _context: Context) {
  const identityUser = await getUser();
  if (!identityUser) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = normalizeIdentityUser(identityUser);
  if (!profile.identityUserId) {
    return Response.json({ error: "Identity profile is missing an id." }, { status: 400 });
  }

  try {
    const householdRepository = new NetlifyHouseholdRepository();
    const bootstrap = await householdRepository.findByIdentityUserId(profile.identityUserId);
    if (!bootstrap) return Response.json({ error: "Household not found." }, { status: 404 });

    const notificationRepository = new NetlifyNotificationRepository();

    if (request.method === "GET") {
      const items = await notificationRepository.listForHousehold(bootstrap.household.id);
      return Response.json({ notifications: items });
    }

    if (request.method === "PATCH") {
      const payload = (await request.json()) as { notificationId?: string };
      if (!payload.notificationId) {
        return Response.json({ error: "notificationId is required." }, { status: 400 });
      }
      const notification = await notificationRepository.markRead(
        payload.notificationId,
        new Date().toISOString(),
        bootstrap.household.id,
      );
      return Response.json({ notification });
    }

    return Response.json({ error: "Method not allowed." }, { status: 405 });
  } catch (error) {
    console.error("Unable to handle notifications request", error);
    const message = error instanceof Error ? error.message : "Unable to handle notifications request.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export const config: Config = {
  path: "/api/notifications",
};

function normalizeIdentityUser(identityUser: unknown) {
  const user = identityUser as { id?: string; sub?: string };
  return { identityUserId: user.id ?? user.sub ?? "" };
}
