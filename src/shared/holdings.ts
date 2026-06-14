import type { EncryptedField } from "./encryption";

export type PortfolioBucket = "P1" | "P2" | "P3";
export type AssetClass = "real_estate" | "stock" | "derivative" | "crypto" | "gold" | "cash" | "other";
export type HoldingStatus = "active" | "exited" | "archived";
export type LiquidityCategory = "liquid" | "semi_liquid" | "illiquid";
export type ValuationSource = "manual" | "auto_price" | "third_party_appraisal";

export type OwnershipSplitInput = {
  ownerEntityId: string;
  percentage: number;
};

export type EncryptedHoldingValues = {
  quantity: EncryptedField;
  costBasis: EncryptedField;
  currentValue: EncryptedField;
  notes?: EncryptedField;
};

export type AddHoldingInput = {
  householdId: string;
  portfolioBucket: PortfolioBucket;
  assetClass: AssetClass;
  assetLabel: string;
  accountLabel: string;
  currency: string;
  liquidityCategory: LiquidityCategory;
  valuationSource: ValuationSource;
  valuationDate: string;
  status: HoldingStatus;
  ownershipSplits: OwnershipSplitInput[];
  encryptedValues: EncryptedHoldingValues;
};

export type PlaintextHoldingInput = Omit<AddHoldingInput, "encryptedValues"> & {
  quantity: string;
  costBasis: string;
  currentValue: string;
  notes?: string;
};

export type HoldingSummary = {
  id: string;
  householdId: string;
  portfolioBucket: PortfolioBucket;
  assetClass: AssetClass;
  assetLabel: string;
  accountLabel: string;
  currency: string;
  liquidityCategory: LiquidityCategory;
  valuationSource: ValuationSource;
  valuationDate: string;
  status: HoldingStatus;
  ownershipSplits: OwnershipSplitInput[];
};
