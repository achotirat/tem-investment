import { describe, expect, it } from "vitest";

import {
  HOUSEHOLD_DEFAULTS,
  ensureHouseholdForUser,
  type HouseholdRepository,
} from "../src/server/household-service";

class InMemoryHouseholdRepository implements HouseholdRepository {
  created = 0;
  private household:
    | Awaited<ReturnType<HouseholdRepository["createForIdentityUser"]>>
    | null = null;

  async findByIdentityUserId() {
    return this.household;
  }

  async createForIdentityUser(input: {
    identityUserId: string;
    email: string;
    householdName: string;
    ownerName: string;
  }) {
    this.created += 1;
    this.household = {
      household: {
        id: "household_1",
        name: input.householdName,
        baseCurrency: HOUSEHOLD_DEFAULTS.baseCurrency,
        secondaryCurrency: HOUSEHOLD_DEFAULTS.secondaryCurrency,
      },
      member: {
        identityUserId: input.identityUserId,
        email: input.email,
        role: "owner",
      },
      ownerEntities: [
        {
          id: "owner_1",
          displayName: input.ownerName,
          kind: "person",
        },
      ],
    };
    return this.household;
  }
}

describe("ensureHouseholdForUser", () => {
  it("creates a THB household and owner entity for a first login", async () => {
    const repo = new InMemoryHouseholdRepository();

    const result = await ensureHouseholdForUser(repo, {
      identityUserId: "user_123",
      email: "tem@example.com",
      name: "Tem",
    });

    expect(result.household).toMatchObject({
      name: "Tem Household",
      baseCurrency: "THB",
      secondaryCurrency: "USD",
    });
    expect(result.member).toMatchObject({
      identityUserId: "user_123",
      role: "owner",
    });
    expect(result.ownerEntities).toEqual([
      {
        id: "owner_1",
        displayName: "Tem",
        kind: "person",
      },
    ]);
    expect(repo.created).toBe(1);
  });

  it("reuses the existing household on later logins", async () => {
    const repo = new InMemoryHouseholdRepository();

    await ensureHouseholdForUser(repo, {
      identityUserId: "user_123",
      email: "tem@example.com",
      name: "Tem",
    });
    const secondLogin = await ensureHouseholdForUser(repo, {
      identityUserId: "user_123",
      email: "tem@example.com",
      name: "Tem",
    });

    expect(secondLogin.household.id).toBe("household_1");
    expect(repo.created).toBe(1);
  });
});
