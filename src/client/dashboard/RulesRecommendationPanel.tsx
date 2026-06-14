"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

import type { RuleRecommendation } from "../../shared/dashboard";

type RulesRecommendationPanelProps = {
  recommendations: RuleRecommendation[];
};

export function RulesRecommendationPanel({ recommendations }: RulesRecommendationPanelProps) {
  return (
    <section className="panel span-12 recommendation-panel">
      <div className="panel-header">
        <div className="panel-title">
          <AlertTriangle aria-hidden="true" size={18} />
          Rules-based recommendations
        </div>
        <span className="pill">{recommendations.length} open</span>
      </div>
      <div className="panel-body recommendation-list">
        {recommendations.length === 0 ? (
          <div className="empty-state compact">
            <CheckCircle2 aria-hidden="true" size={18} />
            No rules-based recommendations
          </div>
        ) : (
          recommendations.map((recommendation) => (
            <article
              className={`recommendation-row ${recommendation.severity}`}
              key={recommendation.id}
            >
              <span className="severity-pill">{labelForSeverity(recommendation.severity)}</span>
              <div>
                <strong>{recommendation.title}</strong>
                <small>{recommendation.detail}</small>
              </div>
              <span className="action-label">{recommendation.actionLabel}</span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function labelForSeverity(severity: RuleRecommendation["severity"]): string {
  if (severity === "critical") return "Critical";
  if (severity === "warning") return "Warning";
  return "Info";
}
