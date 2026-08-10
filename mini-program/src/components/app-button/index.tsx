import { Button } from "@tarojs/components";
import type { PropsWithChildren } from "react";

export interface AppButtonProps extends PropsWithChildren {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "small" | "medium" | "large";
  loading?: boolean;
  disabled?: boolean;
  /** Applies the disabled visual treatment while preserving a parent-managed click affordance. */
  visualDisabled?: boolean;
  active?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
}

export function AppButton({
  children,
  variant = "primary",
  size = "medium",
  loading = false,
  disabled = false,
  visualDisabled = false,
  active = false,
  ariaLabel,
  onClick,
}: AppButtonProps) {
  return (
    <Button
      className={`app-button app-button--${variant} app-button--${size} ${disabled || visualDisabled ? "app-button--disabled" : ""} ${loading ? "app-button--loading" : ""} ${active ? "app-button--active" : ""}`}
      disabled={disabled || loading}
      loading={loading}
      ariaLabel={ariaLabel}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
