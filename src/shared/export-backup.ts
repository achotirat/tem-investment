import type { HouseholdBootstrap } from "../server/household-service";
import type { AIAnalysisRunSummary } from "./ai-analysis";
import type { DecisionLogSummary } from "./discipline";
import type { HoldingSummary } from "./holdings";
import type { NotificationSummary } from "./notifications";
import type { PriceDashboardPayload } from "./pricing";

export type ExportBackupFormat = "tem-investment-backup";

export type ExportBackupPackage = {
  format: ExportBackupFormat;
  version: 1;
  createdAt: string;
  bootstrap: HouseholdBootstrap;
  holdings: HoldingSummary[];
  decisions: DecisionLogSummary[];
  priceDashboard: PriceDashboardPayload;
  notifications: NotificationSummary[];
  aiAnalysisRuns: AIAnalysisRunSummary[];
};

export type EncryptedExportBackupPayload = {
  format: ExportBackupFormat;
  version: 1;
  householdId: string;
  createdAt: string;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
  checksumSha256: string;
};

export type ExportBackupMetadata = {
  id: string;
  householdId: string;
  createdAt: string;
  format: ExportBackupFormat;
  version: 1;
  byteLength: number;
  checksumSha256: string;
};
