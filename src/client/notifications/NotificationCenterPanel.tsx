"use client";

import { Bell, CheckCheck } from "lucide-react";

import type { NotificationSummary } from "../../shared/notifications";

type NotificationCenterPanelProps = {
  notifications: NotificationSummary[];
  onMarkRead?: (notificationId: string) => Promise<void> | void;
};

export function NotificationCenterPanel({
  notifications,
  onMarkRead,
}: NotificationCenterPanelProps) {
  const unreadCount = notifications.filter((notification) => notification.status === "unread").length;

  return (
    <section className="panel span-12 notification-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Bell aria-hidden="true" size={18} />
          Review loop
        </div>
        <span className="pill">{unreadCount} unread</span>
      </div>
      <div className="panel-body notification-list">
        {notifications.length === 0 ? (
          <div className="empty-state compact">
            <CheckCheck aria-hidden="true" size={18} />
            No review reminders
          </div>
        ) : (
          notifications.map((notification) => (
            <article
              className={`notification-row ${notification.status}`}
              key={notification.id}
            >
              <span className={`severity-pill ${notification.severity}`}>
                {labelForSeverity(notification.severity)}
              </span>
              <div>
                <strong>{notification.title}</strong>
                <small>{notification.body}</small>
                <div className="notification-meta">
                  {notification.channels.map((channel) => (
                    <span key={channel}>{channel === "in_app" ? "In-app" : "Email"}</span>
                  ))}
                  <span>{new Date(notification.dueAt).toLocaleDateString()}</span>
                </div>
              </div>
              {notification.status === "unread" && onMarkRead ? (
                <button
                  className="secondary-button"
                  onClick={() => onMarkRead(notification.id)}
                  type="button"
                >
                  Mark read
                </button>
              ) : (
                <span className="action-label">{notification.actionLabel}</span>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function labelForSeverity(severity: NotificationSummary["severity"]): string {
  if (severity === "critical") return "Critical";
  if (severity === "warning") return "Warning";
  return "Info";
}
