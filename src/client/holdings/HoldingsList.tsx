"use client";

import { WalletCards } from "lucide-react";

import type { OwnerEntity } from "../../server/household-service";
import type { HoldingSummary } from "../../shared/holdings";

type HoldingsListProps = {
  holdings: HoldingSummary[];
  ownerEntities: OwnerEntity[];
};

export function HoldingsList({ holdings, ownerEntities }: HoldingsListProps) {
  const ownerNames = new Map(ownerEntities.map((owner) => [owner.id, owner.displayName]));

  return (
    <section className="panel span-7">
      <div className="panel-header">
        <div className="panel-title">
          <WalletCards aria-hidden="true" size={18} />
          Holdings
        </div>
        <span className="pill">{holdings.length} active</span>
      </div>
      <div className="panel-body">
        {holdings.length === 0 ? (
          <div className="empty-state">No holdings recorded yet</div>
        ) : (
          <div className="holdings-table" role="table" aria-label="Holdings">
            <div className="holdings-row holdings-head" role="row">
              <span role="columnheader">Asset</span>
              <span role="columnheader">Account</span>
              <span role="columnheader">Bucket</span>
              <span role="columnheader">Ownership</span>
            </div>
            {holdings.map((holding) => (
              <div className="holdings-row" key={holding.id} role="row">
                <span role="cell">
                  <strong>{holding.assetLabel}</strong>
                  <small>{holding.assetClass.replace("_", " ")}</small>
                </span>
                <span role="cell">{holding.accountLabel}</span>
                <span role="cell">
                  <span className={`bucket-badge ${holding.portfolioBucket.toLowerCase()}`}>
                    {holding.portfolioBucket}
                  </span>
                </span>
                <span role="cell">
                  {holding.ownershipSplits
                    .map((split) => {
                      const ownerName = ownerNames.get(split.ownerEntityId) ?? "Unknown";
                      return `${ownerName} ${split.percentage}%`;
                    })
                    .join(", ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
