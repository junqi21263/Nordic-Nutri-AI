import { Input, Text, View } from "@tarojs/components";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppButton } from "../app-button";
import { BottomSheet } from "../bottom-sheet";
import { NordicIcon } from "../nordic-icon";
import type { MealItem } from "../../features/meals/domain";
import {
  recognitionFeedbackReasons,
  type RecognitionFeedbackReason,
  type RecognitionFeedbackType,
} from "../../features/recognition-feedback/domain";

export type RecognitionFeedbackSheetMode = "reasons" | "items" | "nutrition" | "missing" | "replace" | "other";

export interface RecognitionFeedbackSheetProps {
  open: boolean;
  mode: RecognitionFeedbackSheetMode;
  items: MealItem[];
  itemAction: "replace" | "remove" | null;
  canRemoveItems: boolean;
  onDismiss: () => void;
  onSelectReason: (reason: RecognitionFeedbackReason) => void;
  onSelectItem: (item: MealItem) => void;
  onSelectNutrition: (action: "portion" | "food") => void;
  onSubmitMissing: (name: string, quantityG: number) => Promise<boolean>;
  onMissingSuccess: (name: string, quantityG: number) => void;
  onSubmitReplace: (name: string, quantityG: number) => Promise<boolean>;
  onReplacementSuccess: (name: string, quantityG: number) => void;
  onSubmitOther: (note: string) => Promise<boolean>;
}

export function RecognitionFeedbackSheet({
  open,
  mode,
  items,
  itemAction,
  canRemoveItems,
  onDismiss,
  onSelectReason,
  onSelectItem,
  onSelectNutrition,
  onSubmitMissing,
  onMissingSuccess,
  onSubmitReplace,
  onReplacementSuccess,
  onSubmitOther,
}: RecognitionFeedbackSheetProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [missingName, setMissingName] = useState("");
  const [missingQuantity, setMissingQuantity] = useState("100");
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingSuccess, setMissingSuccess] = useState(false);
  const [missingError, setMissingError] = useState(false);
  const [otherLoading, setOtherLoading] = useState(false);
  const [otherError, setOtherError] = useState(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parsedMissingQuantity = Number(missingQuantity);
  const canSubmitMissing = Boolean(missingName.trim())
    && Number.isFinite(parsedMissingQuantity)
    && parsedMissingQuantity >= 1
    && parsedMissingQuantity <= 2000;

  useEffect(() => {
    if (mode !== "missing" && mode !== "replace") return;
    setMissingError(false);
    setMissingSuccess(false);
    setMissingName("");
    setMissingQuantity("100");
  }, [mode]);
  useEffect(() => () => {
    if (successTimer.current) clearTimeout(successTimer.current);
  }, []);
  useEffect(() => {
    if (!open && successTimer.current) clearTimeout(successTimer.current);
  }, [open]);
  const heading = mode === "items"
    ? t(itemAction === "remove" ? "recognitionFeedback.title.removeItem" : "recognitionFeedback.title.replaceItem")
    : t(`recognitionFeedback.title.${mode}`);

  const selectReason = (reason: RecognitionFeedbackReason) => {
    if (reason.type === "extra_food" && !canRemoveItems) return;
    onSelectReason(reason);
  };

  const submitMissing = async () => {
    if (!canSubmitMissing || missingLoading || missingSuccess) return;
    const name = missingName.trim();
    const quantityG = parsedMissingQuantity;
    setMissingLoading(true);
    setMissingError(false);
    const added = await (mode === "replace" ? onSubmitReplace(name, quantityG) : onSubmitMissing(name, quantityG));
    setMissingLoading(false);
    setMissingError(!added);
    if (added) {
      setMissingSuccess(true);
      setMissingName("");
      setMissingQuantity("100");
      successTimer.current = setTimeout(() => {
        if (mode === "replace") onReplacementSuccess(name, quantityG);
        else onMissingSuccess(name, quantityG);
      }, 1100);
    }
  };

  const submitOther = async () => {
    if (otherLoading) return;
    if (!note.trim()) return;
    setOtherLoading(true);
    setOtherError(false);
    try {
      const submitted = await onSubmitOther(note.trim());
      if (submitted) setNote("");
      else setOtherError(true);
    } catch {
      setOtherError(true);
    } finally {
      setOtherLoading(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      className="recognition-feedback-sheet"
      nativeInput
      lockScroll
      onDismiss={() => { if (!missingLoading && !missingSuccess && !otherLoading) onDismiss(); }}
    >
      <View className="recognition-feedback-sheet__heading">
        <Text className="recognition-feedback-sheet__title">{heading}</Text>
        <Text className="recognition-feedback-sheet__subtitle">
          {mode === "reasons"
            ? t("recognitionFeedback.subtitle.reasons")
            : mode === "missing" || mode === "replace"
              ? t("recognitionFeedback.subtitle.food")
            : t("recognitionFeedback.subtitle.sync")}
        </Text>
      </View>

      {mode === "reasons" ? (
        <View className="recognition-feedback-sheet__reason-list">
          {recognitionFeedbackReasons.map((reason) => (
            <View
              className={`recognition-feedback-sheet__reason ${reason.type === "extra_food" && !canRemoveItems ? "recognition-feedback-sheet__reason--disabled" : ""}`}
              key={reason.type}
              ariaLabel={t(`recognitionFeedback.reasons.${reason.type}.label`)}
              onClick={() => selectReason(reason)}
            >
              <View className="recognition-feedback-sheet__reason-icon">
                <NordicIcon name="chevron-right" size={18} ariaLabel={t("recognitionFeedback.choose")} />
              </View>
              <View className="recognition-feedback-sheet__reason-copy">
                <Text className="recognition-feedback-sheet__reason-label">{t(`recognitionFeedback.reasons.${reason.type}.label`)}</Text>
                <Text className="recognition-feedback-sheet__reason-description">
                  {reason.type === "extra_food" && !canRemoveItems
                    ? t("recognitionFeedback.remainingRequired")
                    : t(`recognitionFeedback.reasons.${reason.type}.description`)}
                </Text>
              </View>
              <NordicIcon name="chevron-right" size={18} ariaLabel={t("recognitionFeedback.enter")} />
            </View>
          ))}
        </View>
      ) : null}

      {mode === "items" ? (
        <View className="recognition-feedback-sheet__item-list">
          {items.length > 0 ? (
            items.map((item) => (
              <View
                className="recognition-feedback-sheet__item"
                key={item.id}
                ariaLabel={t(itemAction === "remove" ? "recognitionFeedback.item.remove" : "recognitionFeedback.item.replace", { name: item.name })}
                onClick={() => onSelectItem(item)}
              >
                <View className="recognition-feedback-sheet__item-copy">
                  <Text className="recognition-feedback-sheet__item-name">{item.name}</Text>
                  <Text className="recognition-feedback-sheet__item-meta">
                    {item.amount} · {item.calories} kcal
                  </Text>
                </View>
                <NordicIcon name="chevron-right" size={18} ariaLabel={t("recognitionFeedback.choose")} />
              </View>
            ))
          ) : (
            <Text className="recognition-feedback-sheet__empty">{t("recognitionFeedback.noItems")}</Text>
          )}
        </View>
      ) : null}

      {mode === "nutrition" ? (
        <View className="recognition-feedback-sheet__action-list">
          <View
            className="recognition-feedback-sheet__action"
            onClick={() => onSelectNutrition("portion")}
          >
            <View className="recognition-feedback-sheet__action-icon">
              <NordicIcon name="weight" size={20} ariaLabel={t("recognitionFeedback.portion")} />
            </View>
            <View>
              <Text className="recognition-feedback-sheet__action-title">{t("recognitionFeedback.adjustPortion")}</Text>
              <Text className="recognition-feedback-sheet__action-copy">
                {t("recognitionFeedback.portionDescription")}
              </Text>
            </View>
            <NordicIcon name="chevron-right" size={18} ariaLabel={t("recognitionFeedback.enter")} />
          </View>
          <View
            className="recognition-feedback-sheet__action"
            onClick={() => onSelectNutrition("food")}
          >
            <View className="recognition-feedback-sheet__action-icon">
              <NordicIcon name="food-bowl" size={20} ariaLabel={t("recognitionFeedback.food")} />
            </View>
            <View>
              <Text className="recognition-feedback-sheet__action-title">{t("recognitionFeedback.editFood")}</Text>
              <Text className="recognition-feedback-sheet__action-copy">
                {t("recognitionFeedback.foodDescription")}
              </Text>
            </View>
            <NordicIcon name="chevron-right" size={18} ariaLabel={t("recognitionFeedback.enter")} />
          </View>
        </View>
      ) : null}

      {mode === "missing" || mode === "replace" ? (
        <View className="recognition-feedback-sheet__missing">
          <View className="recognition-feedback-sheet__field">
            <Text className="recognition-feedback-sheet__field-label">{t("recognitionFeedback.foodName")}</Text>
            <View className={`recognition-feedback-sheet__field-shell ${missingError ? "recognition-feedback-sheet__field-shell--error" : ""}`}>
              <Input
                className="recognition-feedback-sheet__field-input"
                disabled={missingLoading || missingSuccess}
                value={missingName}
                maxlength={60}
                placeholder={t("recognitionFeedback.missing.placeholder")}
                onInput={(event) => {
                  setMissingName(event.detail.value);
                  setMissingError(false);
                }}
              />
              {missingName ? (
                <View className="recognition-feedback-sheet__clear" onClick={() => { if (!missingLoading && !missingSuccess) setMissingName(""); }}>
                  <NordicIcon name="x" size={12} ariaLabel={t("recognitionFeedback.clearFoodName")} />
                </View>
              ) : null}
            </View>
            {missingError ? (
              <Text className="recognition-feedback-sheet__field-error">{t("recognitionFeedback.missing.unmatched")}</Text>
            ) : null}
          </View>
          <View className="recognition-feedback-sheet__field">
            <Text className="recognition-feedback-sheet__field-label">{t("recognitionFeedback.missing.quantity")}</Text>
            <View className="recognition-feedback-sheet__field-shell">
              <Input
                className="recognition-feedback-sheet__field-input"
                disabled={missingLoading || missingSuccess}
                type="number"
                value={missingQuantity}
                maxlength={4}
                onInput={(event) => setMissingQuantity(event.detail.value)}
              />
              <Text className="recognition-feedback-sheet__field-unit">g</Text>
            </View>
            <View className="recognition-feedback-sheet__quantity-options">
              {[50, 100, 150].map((quantity) => (
                <View
                  key={quantity}
                  className={`recognition-feedback-sheet__quantity-option ${parsedMissingQuantity === quantity ? "recognition-feedback-sheet__quantity-option--active" : ""}`}
                  onClick={() => { if (!missingLoading && !missingSuccess) setMissingQuantity(String(quantity)); }}
                >
                  <Text>{quantity}g</Text>
                </View>
              ))}
            </View>
          </View>
          <View className="recognition-feedback-sheet__estimate-note">
            <NordicIcon name="check" size={14} ariaLabel={t("recognitionFeedback.missing.estimateAria")} />
            <Text>{t("recognitionFeedback.missing.estimateNote")}</Text>
          </View>
          <AppButton
            size="large"
            loading={missingLoading}
            disabled={!canSubmitMissing && !missingSuccess}
            onClick={() => void submitMissing()}
          >
            {missingSuccess ? (
              <View className="recognition-feedback-sheet__submit-success">
                <NordicIcon name="check-inverse" size={20} ariaLabel={t("recognitionFeedback.missing.successAria")} />
                <Text>{t(mode === "replace" ? "recognitionFeedback.missing.replaced" : "recognitionFeedback.missing.added")}</Text>
              </View>
            ) : missingLoading ? (
              <View className="recognition-feedback-sheet__analyzing">
                <View className="recognition-feedback-sheet__spinner" />
                <Text>{t("recognitionFeedback.missing.analyzing")}</Text>
              </View>
            ) : t(mode === "replace" ? "recognitionFeedback.missing.replace" : "recognitionFeedback.missing.add")}
          </AppButton>
        </View>
      ) : null}

      {mode === "other" ? (
        <View className="recognition-feedback-sheet__other">
          <Input
            className="recognition-feedback-sheet__input"
            value={note}
            maxlength={300}
            placeholder={t("recognitionFeedback.other.placeholder")}
            onInput={(event) => {
              setNote(event.detail.value);
              setOtherError(false);
            }}
          />
          {otherError ? <Text className="recognition-feedback-sheet__field-error">{t("recognitionFeedback.other.failed")}</Text> : null}
          <AppButton size="large" disabled={!note.trim()} loading={otherLoading} onClick={() => void submitOther()}>
            {otherLoading ? t("recognitionFeedback.other.submitting") : t("recognitionFeedback.other.submit")}
          </AppButton>
        </View>
      ) : null}
    </BottomSheet>
  );
}

export type { RecognitionFeedbackType };
