CREATE TABLE household_security (
  household_id UUID PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  kdf_method TEXT NOT NULL DEFAULT 'argon2id',
  kdf_salt TEXT NOT NULL,
  recovery_key_hash TEXT,
  recovery_key_salt TEXT,
  recovery_key_created_at TIMESTAMPTZ,
  recovery_key_acknowledged_at TIMESTAMPTZ,
  recovery_key_rotated_at TIMESTAMPTZ,
  unlock_idle_timeout_minutes INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT household_security_kdf_method_check CHECK (kdf_method IN ('argon2id', 'pbkdf2')),
  CONSTRAINT household_security_unlock_timeout_check CHECK (unlock_idle_timeout_minutes > 0)
);
