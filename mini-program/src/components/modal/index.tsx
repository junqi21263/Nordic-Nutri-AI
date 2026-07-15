import { View } from "@tarojs/components";
import type { PropsWithChildren } from "react";
export function Modal({ open, children }: PropsWithChildren<{ open: boolean }>) {
  return open ? (
    <View className="modal-backdrop">
      <View className="modal">{children}</View>
    </View>
  ) : null;
}
