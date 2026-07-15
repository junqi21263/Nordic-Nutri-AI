import { Picker, Text, View } from "@tarojs/components";
import { shiftDate } from "../../features/meals/domain";

export interface DateSelectorProps {
  date: string;
  onChange: (date: string) => void;
  maxDate: string;
}
export function DateSelector({ date, onChange, maxDate }: DateSelectorProps) {
  return (
    <View className="date-selector">
      <Text className="date-selector__button" onClick={() => onChange(shiftDate(date, -1))}>
        ‹
      </Text>
      <Picker
        mode="date"
        value={date}
        end={maxDate}
        onChange={(event) => onChange(event.detail.value)}
      >
        <View className="date-selector__value">
          <Text>{date}</Text>
          <Text>⌄</Text>
        </View>
      </Picker>
      <Text
        className={`date-selector__button ${date >= maxDate ? "date-selector__button--disabled" : ""}`}
        onClick={() => date < maxDate && onChange(shiftDate(date, 1))}
      >
        ›
      </Text>
    </View>
  );
}
