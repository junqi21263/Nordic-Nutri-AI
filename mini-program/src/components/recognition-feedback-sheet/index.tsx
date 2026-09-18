import { Input, Text, View } from "@tarojs/components";
import { useEffect, useRef, useState } from "react";
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
  const heading =
    mode === "reasons"
      ? "识别不准确？"
      : mode === "items"
        ? itemAction === "remove"
          ? "选择要移除的食物"
          : "选择要替换的食物"
        : mode === "nutrition"
          ? "怎么修正营养数据？"
          : mode === "missing"
            ? "补充遗漏的食物"
          : mode === "replace"
            ? "替换识别错误的食物"
          : "告诉我们哪里不准确";

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
            ? "请选择原因，我们会帮你直接修正这次识别。"
            : mode === "missing" || mode === "replace"
              ? "输入食物和大致份量，我们会更新本次识别。"
            : "这次修改会同步到当前识别结果。"}
        </Text>
      </View>

      {mode === "reasons" ? (
        <View className="recognition-feedback-sheet__reason-list">
          {recognitionFeedbackReasons.map((reason) => (
            <View
              className={`recognition-feedback-sheet__reason ${reason.type === "extra_food" && !canRemoveItems ? "recognition-feedback-sheet__reason--disabled" : ""}`}
              key={reason.type}
              ariaLabel={reason.label}
              onClick={() => selectReason(reason)}
            >
              <View className="recognition-feedback-sheet__reason-icon">
                <NordicIcon name="chevron-right" size={18} ariaLabel="选择" />
              </View>
              <View className="recognition-feedback-sheet__reason-copy">
                <Text className="recognition-feedback-sheet__reason-label">{reason.label}</Text>
                <Text className="recognition-feedback-sheet__reason-description">
                  {reason.type === "extra_food" && !canRemoveItems
                    ? "至少需要保留一种食物"
                    : reason.description}
                </Text>
              </View>
              <NordicIcon name="chevron-right" size={18} ariaLabel="进入" />
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
                ariaLabel={itemAction === "remove" ? `移除${item.name}` : `替换${item.name}`}
                onClick={() => onSelectItem(item)}
              >
                <View className="recognition-feedback-sheet__item-copy">
                  <Text className="recognition-feedback-sheet__item-name">{item.name}</Text>
                  <Text className="recognition-feedback-sheet__item-meta">
                    {item.amount} · {item.calories} kcal
                  </Text>
                </View>
                <NordicIcon name="chevron-right" size={18} ariaLabel="选择" />
              </View>
            ))
          ) : (
            <Text className="recognition-feedback-sheet__empty">当前没有可调整的食物。</Text>
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
              <NordicIcon name="weight" size={20} ariaLabel="份量" />
            </View>
            <View>
              <Text className="recognition-feedback-sheet__action-title">调整份量</Text>
              <Text className="recognition-feedback-sheet__action-copy">
                修改这餐的整体份量比例
              </Text>
            </View>
            <NordicIcon name="chevron-right" size={18} ariaLabel="进入" />
          </View>
          <View
            className="recognition-feedback-sheet__action"
            onClick={() => onSelectNutrition("food")}
          >
            <View className="recognition-feedback-sheet__action-icon">
              <NordicIcon name="food-bowl" size={20} ariaLabel="食物" />
            </View>
            <View>
              <Text className="recognition-feedback-sheet__action-title">修改食物</Text>
              <Text className="recognition-feedback-sheet__action-copy">
                重新选择对应的食物数据
              </Text>
            </View>
            <NordicIcon name="chevron-right" size={18} ariaLabel="进入" />
          </View>
        </View>
      ) : null}

      {mode === "missing" || mode === "replace" ? (
        <View className="recognition-feedback-sheet__missing">
          <View className="recognition-feedback-sheet__field">
            <Text className="recognition-feedback-sheet__field-label">食物名称</Text>
            <View className={`recognition-feedback-sheet__field-shell ${missingError ? "recognition-feedback-sheet__field-shell--error" : ""}`}>
              <Input
                className="recognition-feedback-sheet__field-input"
                disabled={missingLoading || missingSuccess}
                value={missingName}
                maxlength={60}
                placeholder="例如：西兰花、鸡蛋、米饭"
                onInput={(event) => {
                  setMissingName(event.detail.value);
                  setMissingError(false);
                }}
              />
              {missingName ? (
                <View className="recognition-feedback-sheet__clear" onClick={() => { if (!missingLoading && !missingSuccess) setMissingName(""); }}>
                  <NordicIcon name="x" size={12} ariaLabel="清空食物名称" />
                </View>
              ) : null}
            </View>
            {missingError ? (
              <Text className="recognition-feedback-sheet__field-error">暂时无法匹配，请尝试更具体的名称</Text>
            ) : null}
          </View>
          <View className="recognition-feedback-sheet__field">
            <Text className="recognition-feedback-sheet__field-label">大约吃了多少？</Text>
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
            <NordicIcon name="check" size={14} ariaLabel="自动估算" />
            <Text>营养数据将根据食物名称和克重自动估算。</Text>
          </View>
          <AppButton
            size="large"
            loading={missingLoading}
            disabled={!canSubmitMissing && !missingSuccess}
            onClick={() => void submitMissing()}
          >
            {missingSuccess ? (
              <View className="recognition-feedback-sheet__submit-success">
                <NordicIcon name="check-inverse" size={20} ariaLabel="已添加" />
                <Text>{mode === "replace" ? "已替换本次识别" : "已加入本次识别"}</Text>
              </View>
            ) : missingLoading ? (
              <View className="recognition-feedback-sheet__analyzing">
                <View className="recognition-feedback-sheet__spinner" />
                <Text>正在分析食物…</Text>
              </View>
            ) : mode === "replace" ? "替换当前食物" : "添加到本次识别"}
          </AppButton>
        </View>
      ) : null}

      {mode === "other" ? (
        <View className="recognition-feedback-sheet__other">
          <Input
            className="recognition-feedback-sheet__input"
            value={note}
            maxlength={300}
            placeholder="请简单描述一下问题"
            onInput={(event) => {
              setNote(event.detail.value);
              setOtherError(false);
            }}
          />
          {otherError ? <Text className="recognition-feedback-sheet__field-error">提交失败，请重试</Text> : null}
          <AppButton size="large" disabled={!note.trim()} loading={otherLoading} onClick={() => void submitOther()}>
            {otherLoading ? "正在提交…" : "提交反馈"}
          </AppButton>
        </View>
      ) : null}
    </BottomSheet>
  );
}

export type { RecognitionFeedbackType };
