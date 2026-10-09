import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
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
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Modal open={open} lockScroll>
      <View className="confirm-dialog">
        <Text className="confirm-dialog__title">{title}</Text>
        <Text className="confirm-dialog__description">{description}</Text>
        <View className="confirm-dialog__actions">
          <AppButton size="medium" onClick={onCancel}>
            {cancelLabel ?? t("common.cancel")}
          </AppButton>
          <AppButton variant="outline" size="medium" onClick={onConfirm}>
            {confirmLabel ?? t("common.confirm")}
          </AppButton>
        </View>
      </View>
    </Modal>
  );
}
