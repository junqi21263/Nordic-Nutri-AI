import { View } from "@tarojs/components";
import { useEffect, useState, type PropsWithChildren } from "react";

export const bottomSheetExitDuration = 220;

export interface BottomSheetProps extends PropsWithChildren {
  open: boolean;
  className?: string;
  onDismiss?: () => void;
  /** Keeps native inputs out of a transformed animation layer in WeChat. */
  nativeInput?: boolean;
}

export function BottomSheet({ open, className = "", onDismiss, children, nativeInput = false }: BottomSheetProps) {
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
    <View
      className={`bottom-sheet-backdrop ${isClosing ? "bottom-sheet-backdrop--closing" : ""}`}
      onClick={(event) => {
        // Native inputs do not reliably participate in Taro's inner View
        // propagation. Only a tap directly on the backdrop may dismiss.
        if (event.target === event.currentTarget) onDismiss?.();
      }}
    >
      <View
        className={`bottom-sheet ${className} ${nativeInput ? "bottom-sheet--native-input" : ""} ${isClosing ? "bottom-sheet--closing" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <View className="bottom-sheet__handle" />
        {children}
      </View>
    </View>
  ) : null;
}
