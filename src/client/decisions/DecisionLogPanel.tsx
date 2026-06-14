"use client";

import { ClipboardList } from "lucide-react";

import type { DecisionLogSummary } from "../../shared/discipline";

type DecisionLogPanelProps = {
  decisions: DecisionLogSummary[];
};

export function DecisionLogPanel({ decisions }: DecisionLogPanelProps) {
  return (
    <section className="panel span-7">
      <div className="panel-header">
        <div className="panel-title">
          <ClipboardList aria-hidden="true" size={18} />
          Decision log
        </div>
        <span className="pill">{decisions.length} logged</span>
      </div>
      <div className="panel-body">
        {decisions.length === 0 ? (
          <div className="empty-state">No decisions logged yet</div>
        ) : (
          <div className="decision-list">
            {decisions.map((decision) => (
              <div className="decision-row" key={decision.id}>
                <span>
                  <strong>{formatAction(decision.action)}</strong>
                  <small>{String(decision.metadata.assetLabel ?? decision.scope)}</small>
                </span>
                <span className="bucket-badge">{String(decision.metadata.portfolioBucket ?? "All")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function formatAction(action: DecisionLogSummary["action"]): string {
  return action
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
