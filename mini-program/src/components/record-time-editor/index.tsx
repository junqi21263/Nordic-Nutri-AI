import { Input, Text, View } from "@tarojs/components";
import { useState } from "react";
import { shiftDate } from "../../features/meals/domain";
import { getLocalDateString } from "../../features/onboarding/domain";
import { Modal } from "../modal";

export interface RecordTimeEditorProps {
  date: string;
  time: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
}

const normalizeTimePart = (value: string, maximum: number) => {
  const number = Number(value.replace(/\D/g, ""));
  if (!Number.isFinite(number)) return "";
  return String(Math.min(maximum, Math.max(0, number))).padStart(2, "0");
};

export function RecordTimeEditor({ date, time, onDateChange, onTimeChange }: RecordTimeEditorProps) {
  const [open, setOpen] = useState(false);
  const [draftHour, setDraftHour] = useState(time.slice(0, 2));
  const [draftMinute, setDraftMinute] = useState(time.slice(3, 5));
  const today = getLocalDateString();
  const dateLabel = date === today ? "今天" : date;
  const commitTime = (hour = draftHour, minute = draftMinute) => {
    const nextHour = normalizeTimePart(hour, 23) || "00";
    const nextMinute = normalizeTimePart(minute, 59) || "00";
    setDraftHour(nextHour);
    setDraftMinute(nextMinute);
    onTimeChange(`${nextHour}:${nextMinute}`);
  };
  const openEditor = () => {
    setDraftHour(time.slice(0, 2));
    setDraftMinute(time.slice(3, 5));
    setOpen(true);
  };

  return (
    <>
      <View className="record-time-editor__summary" ariaLabel="修改记录时间" onClick={openEditor}>
        <View>
          <Text className="record-time-editor__value">{dateLabel} · {time}</Text>
          <Text className="record-time-editor__hint">可修改</Text>
        </View>
        <Text className="record-time-editor__action">设置</Text>
      </View>
      <Modal open={open}>
        <View className="record-time-editor__sheet">
          <View className="record-time-editor__sheet-head">
            <Text>设置记录时间</Text>
            <Text onClick={() => { commitTime(); setOpen(false); }}>完成</Text>
          </View>
          <View className="record-time-editor__control">
            <Text>调整日期</Text>
            <View>
              <View ariaLabel="前一天" onClick={() => onDateChange(shiftDate(date, -1))}>−</View>
              <Text>{dateLabel}</Text>
              <View
                ariaLabel="后一天"
                className={date >= today ? "record-time-editor__step--disabled" : ""}
                onClick={() => date < today && onDateChange(shiftDate(date, 1))}
              >
                +
              </View>
            </View>
          </View>
          <View className="record-time-editor__time-controls">
            <Text>直接设置时间</Text>
            <View className="record-time-editor__direct-time">
              <Input
                ariaLabel="小时"
                type="number"
                maxlength={2}
                value={draftHour}
                onInput={(event) => setDraftHour(event.detail.value)}
                onBlur={() => commitTime(draftHour, draftMinute)}
              />
              <Text>:</Text>
              <Input
                ariaLabel="分钟"
                type="number"
                maxlength={2}
                value={draftMinute}
                onInput={(event) => setDraftMinute(event.detail.value)}
                onBlur={() => commitTime(draftHour, draftMinute)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
