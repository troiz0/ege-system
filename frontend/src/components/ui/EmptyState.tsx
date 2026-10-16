import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode | { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const isButtonAction =
    !!action && typeof action === 'object' && 'label' in action && 'onClick' in action;
  return (
    <div className="card-shelf flex flex-col items-center justify-center px-4 py-12 text-center">
      {icon && <div className="mb-4 text-zinc-600">{icon}</div>}
      <h3 className="mb-2 font-display text-lg font-bold uppercase tracking-tight text-zinc-200">{title}</h3>
      {description && <p className="mb-4 max-w-md text-sm font-light text-zinc-500">{description}</p>}
      {action && (
        <div>
          {isButtonAction ? (
            <button
              onClick={(action as { label: string; onClick: () => void }).onClick}
              className="btn-lime text-sm"
            >
              {(action as { label: string; onClick: () => void }).label}
            </button>
          ) : (
            action
          )}
        </div>
      )}
    </div>
  );
}
