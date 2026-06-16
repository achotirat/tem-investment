"use client";

import { Archive, Download } from "lucide-react";

import type { ExportBackupMetadata } from "../../shared/export-backup";

type ExportBackupPanelProps = {
  backups: ExportBackupMetadata[];
  disabled: boolean;
  onCreateBackup: () => Promise<void> | void;
};

export function ExportBackupPanel({
  backups,
  disabled,
  onCreateBackup,
}: ExportBackupPanelProps) {
  return (
    <section className="panel span-12 backup-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Archive aria-hidden="true" size={18} />
          Export and backup
        </div>
        <span className="pill">{backups.length} backups</span>
      </div>
      <div className="panel-body backup-list">
        <button className="primary-button" disabled={disabled} onClick={onCreateBackup} type="button">
          <Download aria-hidden="true" size={16} />
          Create encrypted backup
        </button>
        {disabled ? (
          <div className="error-strip">Unlock sensitive data before creating an encrypted backup</div>
        ) : null}
        {backups.length === 0 ? (
          <div className="empty-state compact">No encrypted backups yet</div>
        ) : (
          backups.map((backup) => (
            <article className="backup-row" key={backup.id}>
              <strong>{backup.id}</strong>
              <small>{new Date(backup.createdAt).toLocaleString()}</small>
              <span className="action-label">{formatBytes(backup.byteLength)}</span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
