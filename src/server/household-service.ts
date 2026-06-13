export const HOUSEHOLD_DEFAULTS = {
  baseCurrency: "THB",
  secondaryCurrency: "USD",
} as const;

export type CurrencyCode = (typeof HOUSEHOLD_DEFAULTS)[keyof typeof HOUSEHOLD_DEFAULTS];

export type OwnerEntityKind = "person" | "company" | "external";

export type HouseholdSummary = {
  id: string;
  name: string;
  baseCurrency: CurrencyCode;
  secondaryCurrency: CurrencyCode;
};

export type HouseholdMember = {
  identityUserId: string;
  email: string;
  role: "owner" | "member";
};

export type OwnerEntity = {
  id: string;
  displayName: string;
  kind: OwnerEntityKind;
};

export type HouseholdBootstrap = {
  household: HouseholdSummary;
  member: HouseholdMember;
  ownerEntities: OwnerEntity[];
};

export type IdentityUserProfile = {
  identityUserId: string;
  email: string;
  name?: string | null;
};

export type CreateHouseholdForIdentityInput = IdentityUserProfile & {
  householdName: string;
  ownerName: string;
};

export type HouseholdRepository = {
  findByIdentityUserId(identityUserId: string): Promise<HouseholdBootstrap | null>;
  createForIdentityUser(input: CreateHouseholdForIdentityInput): Promise<HouseholdBootstrap>;
};

export async function ensureHouseholdForUser(
  repository: HouseholdRepository,
  user: IdentityUserProfile,
): Promise<HouseholdBootstrap> {
  const existing = await repository.findByIdentityUserId(user.identityUserId);
  if (existing) return existing;

  const ownerName = displayNameForUser(user);

  return repository.createForIdentityUser({
    ...user,
    householdName: `${ownerName} Household`,
    ownerName,
  });
}

function displayNameForUser(user: IdentityUserProfile): string {
  const fromName = user.name?.trim();
  if (fromName) return fromName;

  const [localPart] = user.email.split("@");
  return localPart ? titleCase(localPart.replace(/[._-]+/g, " ")) : "Household";
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
