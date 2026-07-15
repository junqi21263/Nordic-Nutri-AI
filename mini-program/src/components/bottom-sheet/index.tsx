import { View } from "@tarojs/components";
import { useEffect, useState, type PropsWithChildren } from "react";

export const bottomSheetExitDuration = 220;

export interface BottomSheetProps extends PropsWithChildren {
  open: boolean;
  className?: string;
  onDismiss?: () => void;
}

export function BottomSheet({ open, className = "", onDismiss, children }: BottomSheetProps) {
  const [isRendered, setIsRendered] = useState(open);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setIsRendered(true);
      setIsClosing(false);
      return undefined;
    }
    if (!isRendered) return undefined;

    setIsClosing(true);
    const timer = setTimeout(() => {
      setIsRendered(false);
      setIsClosing(false);
    }, bottomSheetExitDuration);
    return () => clearTimeout(timer);
  }, [isRendered, open]);

  return isRendered ? (
    <View className={`bottom-sheet-backdrop ${isClosing ? "bottom-sheet-backdrop--closing" : ""}`} onClick={onDismiss}>
      <View
        className={`bottom-sheet ${className} ${isClosing ? "bottom-sheet--closing" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <View className="bottom-sheet__handle" />
        {children}
      </View>
    </View>
  ) : null;
}
