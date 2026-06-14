"use client";

import { BarChart3, PieChart, Users } from "lucide-react";

import type { DashboardExposureGroup, PortfolioReviewSnapshot } from "../../shared/dashboard";

type PortfolioReviewPanelProps = {
  review: PortfolioReviewSnapshot;
};

export function PortfolioReviewPanel({ review }: PortfolioReviewPanelProps) {
  return (
    <>
      <section className="panel span-8">
        <div className="panel-header">
          <div className="panel-title">
            <PieChart aria-hidden="true" size={18} />
            Allocation review
          </div>
          <span className="pill">60 / 30 / 10</span>
        </div>
        <div className="panel-body bucket-list">
          {review.bucketAllocations.map((bucket) => (
            <div className="bucket-row review-row" key={bucket.key}>
              <span className="bucket-name">{bucket.label}</span>
              <span className="bucket-target">
                {review.locked ? "Locked" : `${formatPercent(bucket.percent)}% actual`}
              </span>
              <div className="bucket-bar">
                <span
                  className={bucket.key.toLowerCase()}
                  style={{ width: `${review.locked ? bucket.targetPercent : bucket.percent}%` }}
                />
              </div>
              <small>
                {formatPercent(bucket.targetPercent)}% target
                {review.locked ? "" : ` · drift ${formatSignedPercent(bucket.driftPercent)} pts`}
              </small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel span-4">
        <div className="panel-header">
          <div className="panel-title">
            <Users aria-hidden="true" size={18} />
            Owner net worth
          </div>
          <span className="pill">{review.baseCurrency}</span>
        </div>
        <div className="panel-body review-list">
          {review.ownerNetWorth.length === 0 ? (
            <div className="empty-state compact">Unlock to calculate ownership</div>
          ) : (
            review.ownerNetWorth.map((owner) => (
              <MetricRow
                group={{
                  key: owner.ownerEntityId,
                  label: owner.displayName,
                  valueBase: owner.valueBase,
                  percent: owner.percent,
                }}
                key={owner.ownerEntityId}
              />
            ))
          )}
        </div>
      </section>

      <section className="panel span-12">
        <div className="panel-header">
          <div className="panel-title">
            <BarChart3 aria-hidden="true" size={18} />
            Concentration views
          </div>
          <span className="pill">Category risk</span>
        </div>
        <div className="panel-body exposure-grid">
          <ExposureColumn groups={review.exposures.assetClass} title="Asset class" />
          <ExposureColumn groups={review.exposures.platform} title="Platform" />
          <ExposureColumn groups={review.exposures.currency} title="Currency" />
          <ExposureColumn groups={review.exposures.owner} title="Owner/entity" />
          <ExposureColumn groups={review.exposures.liquidity} title="Liquidity" />
          <ExposureColumn groups={review.exposures.leverage} title="Leverage" />
        </div>
      </section>
    </>
  );
}

function ExposureColumn({ title, groups }: { title: string; groups: DashboardExposureGroup[] }) {
  return (
    <div className="exposure-column">
      <div className="metric-label">{title}</div>
      {groups.length === 0 ? (
        <div className="empty-state compact">Locked</div>
      ) : (
        groups.slice(0, 3).map((group) => <MetricRow group={group} key={group.key} />)
      )}
    </div>
  );
}

function MetricRow({ group }: { group: DashboardExposureGroup }) {
  return (
    <div className="metric-row">
      <strong>{group.label}</strong>
      <span>{formatPercent(group.percent)}%</span>
    </div>
  );
}

function formatPercent(value: number): string {
  return value.toFixed(value % 1 === 0 ? 0 : 1);
}

function formatSignedPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${formatPercent(value)}`;
}
