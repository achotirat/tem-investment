CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  base_currency CHAR(3) NOT NULL DEFAULT 'THB',
  secondary_currency CHAR(3) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT households_base_currency_check CHECK (base_currency = 'THB'),
  CONSTRAINT households_secondary_currency_check CHECK (secondary_currency = 'USD')
);

CREATE TABLE owner_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  identity_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT owner_entities_kind_check CHECK (kind IN ('person', 'company', 'external')),
  CONSTRAINT owner_entities_household_name_unique UNIQUE (household_id, display_name)
);

CREATE TABLE household_members (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  identity_user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  owner_entity_id UUID REFERENCES owner_entities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (household_id, identity_user_id),
  CONSTRAINT household_members_role_check CHECK (role IN ('owner', 'member'))
);

CREATE UNIQUE INDEX household_members_identity_user_id_unique
  ON household_members(identity_user_id);

CREATE INDEX owner_entities_household_id_idx
  ON owner_entities(household_id);
