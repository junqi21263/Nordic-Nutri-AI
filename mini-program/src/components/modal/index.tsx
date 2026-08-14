import { View } from "@tarojs/components";
import type { PropsWithChildren } from "react";
export function Modal({
  open,
  children,
  className = "",
  backdropClassName = "",
  lockScroll = false,
  onBackdropClick,
}: PropsWithChildren<{
  open: boolean;
  className?: string;
  backdropClassName?: string;
  lockScroll?: boolean;
  onBackdropClick?: () => void;
}>) {
  return open ? (
    <View
      className={`modal-backdrop ${backdropClassName}`}
      catchMove={lockScroll || undefined}
      onTouchMove={lockScroll ? (event) => { event.preventDefault(); event.stopPropagation(); } : undefined}
      onClick={onBackdropClick}
    >
      <View
        className={`modal ${className}`}
        catchMove={lockScroll || undefined}
        onTouchMove={lockScroll ? (event) => { event.preventDefault(); event.stopPropagation(); } : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </View>
    </View>
  ) : null;
}
