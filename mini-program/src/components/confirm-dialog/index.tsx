import { Text, View } from "@tarojs/components";
import { AppButton } from "../app-button";
import { Modal } from "../modal";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} lockScroll>
      <View className="confirm-dialog">
        <Text className="confirm-dialog__title">{title}</Text>
        <Text className="confirm-dialog__description">{description}</Text>
        <View className="confirm-dialog__actions">
          <AppButton variant="secondary" size="medium" onClick={onCancel}>
            {cancelLabel}
          </AppButton>
          <AppButton variant="outline" size="medium" onClick={onConfirm}>
            {confirmLabel}
          </AppButton>
        </View>
      </View>
    </Modal>
  );
}
