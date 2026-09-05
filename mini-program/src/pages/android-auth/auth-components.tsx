import { Image, Input, Text, View } from "@tarojs/components";
import { useState } from "react";
import { BottomSheet } from "../../components/bottom-sheet";
import { NordicIcon } from "../../components/nordic-icon";
import heroImage from "../../assets/images/welcome-hero.jpg";
import logoImage from "../../assets/brand/nordic-nutri-logo.png";

export function AuthHero({ compact = false, muted = false }: { compact?: boolean; muted?: boolean }) {
  return (
    <View className={`auth-hero ${compact ? "auth-hero--compact" : ""} ${muted ? "auth-hero--muted" : ""}`}>
      <Image className="auth-hero__image" src={heroImage} mode="aspectFill" />
      <View className="auth-hero__fade" />
      <View className="auth-hero__brand" ariaLabel="Nordic">
        <Text className="auth-hero__wordmark">NORDIC</Text>
        <Image className="auth-hero__mark" src={logoImage} mode="aspectFit" />
      </View>
    </View>
  );
}

export function AuthNav({ onBack }: { onBack: () => void }) {
  return (
    <View className="auth-nav">
      <View className="auth-nav__back" onClick={onBack} ariaLabel="Back">
        <NordicIcon name="back" size={18} ariaLabel="Back" />
        <Text>Back</Text>
      </View>
      <Text className="auth-nav__title">NORDIC</Text>
      <View className="auth-nav__spacer" />
    </View>
  );
}

export function AuthInput({
  label,
  value,
  placeholder,
  onChange,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  maxLength?: number;
}) {
  return (
    <View className="auth-field">
      <Text className="auth-field__label">{label}</Text>
      <Input
        className="auth-field__input"
        value={value}
        placeholder={placeholder}
        type={type}
        maxlength={maxLength}
        onInput={(event) => onChange(event.detail?.value ?? "")}
      />
    </View>
  );
}

export function PasswordInput({
  value,
  onChange,
  label = "Password",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View className="auth-field">
      <Text className="auth-field__label">{label}</Text>
      <View className="auth-password">
        <Input
          className="auth-field__input auth-password__input"
          value={value}
          password={!visible}
          placeholder="Enter your password"
          maxlength={128}
          onInput={(event) => onChange(event.detail?.value ?? "")}
        />
        <Text className="auth-password__toggle" onClick={() => setVisible((current) => !current)}>
          {visible ? "Hide" : "Show"}
        </Text>
      </View>
    </View>
  );
}

function captchaImage(captcha: { image: string }) {
  return `data:image/svg+xml,${encodeURIComponent(captcha.image)}`;
}

export function CaptchaField({
  captcha,
  value,
  error,
  onChange,
  onRefresh,
}: {
  captcha: { image: string } | null;
  value: string;
  error?: boolean;
  onChange: (value: string) => void;
  onRefresh: () => void;
}) {
  return (
    <View className={`auth-captcha ${error ? "auth-captcha--error" : ""}`}>
      <View className="auth-captcha__heading">
        <Text className="auth-field__label">Security check</Text>
        <Text className="auth-captcha__hint">Enter the characters</Text>
      </View>
      <View className="auth-captcha__row">
        <View className="auth-captcha__image-wrap">
          {captcha ? <Image className="auth-captcha__image" src={captchaImage(captcha)} mode="aspectFit" /> : null}
          <View className="auth-captcha__refresh" onClick={onRefresh} ariaLabel="Refresh security code">
            <NordicIcon name="refresh-cw" size={18} ariaLabel="Refresh" />
          </View>
        </View>
        <Input
          className="auth-field__input auth-captcha__input"
          value={value}
          placeholder="Security code"
          maxlength={8}
          onInput={(event) => onChange(event.detail?.value ?? "")}
        />
      </View>
      {error ? <Text className="auth-inline-error">The security code is incorrect.</Text> : null}
    </View>
  );
}

export function OtpInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const digits = value.replace(/\D/g, "").slice(0, 6).split("");
  const [focusIndex, setFocusIndex] = useState(Math.min(digits.length, 5));

  const update = (index: number, raw: string) => {
    const incoming = raw.replace(/\D/g, "");
    if (incoming.length > 1) {
      onChange(incoming.slice(0, 6));
      setFocusIndex(Math.min(incoming.length, 5));
      return;
    }
    const next = Array.from({ length: 6 }, (_, current) => digits[current] ?? "");
    next[index] = incoming;
    onChange(next.join(""));
    setFocusIndex(incoming ? Math.min(index + 1, 5) : Math.max(index - 1, 0));
  };

  return (
    <View className="auth-otp" ariaLabel="6 digit verification code">
      {Array.from({ length: 6 }, (_, index) => (
        <Input
          key={index}
          className="auth-otp__cell"
          value={digits[index] ?? ""}
          type="number"
          maxlength={1}
          focus={focusIndex === index}
          onInput={(event) => update(index, event.detail?.value ?? "")}
        />
      ))}
    </View>
  );
}

export function InlineMessage({
  message,
  kind = "error",
  onRetry,
}: {
  message: string;
  kind?: "error" | "success" | "network";
  onRetry?: () => void;
}) {
  return (
    <View className={`auth-message auth-message--${kind}`}>
      <Text>{message}</Text>
      {onRetry ? <Text className="auth-message__retry" onClick={onRetry}>Try again</Text> : null}
    </View>
  );
}

export type Country = { name: string; code: string };

const countries: Country[] = [
  { name: "Japan", code: "+81" },
  { name: "United States", code: "+1" },
  { name: "Canada", code: "+1" },
  { name: "United Kingdom", code: "+44" },
  { name: "Australia", code: "+61" },
  { name: "Hong Kong", code: "+852" },
  { name: "Taiwan", code: "+886" },
];

export function CountryPicker({
  open,
  selected,
  onDismiss,
  onSelect,
}: {
  open: boolean;
  selected: Country;
  onDismiss: () => void;
  onSelect: (country: Country) => void;
}) {
  const [query, setQuery] = useState("");
  const visibleCountries = countries.filter((country) => `${country.name} ${country.code}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <BottomSheet open={open} onDismiss={onDismiss} lockScroll className="auth-country-picker">
      <Text className="auth-country-picker__title">Country or region</Text>
      <View className="auth-country-picker__search">
        <NordicIcon name="search" size={18} ariaLabel="Search" />
        <Input value={query} placeholder="Search" onInput={(event) => setQuery(event.detail?.value ?? "")} />
      </View>
      <View className="auth-country-picker__list">
        {visibleCountries.map((country) => (
          <View
            key={`${country.name}-${country.code}`}
            className={`auth-country-picker__item ${selected.name === country.name ? "auth-country-picker__item--selected" : ""}`}
            onClick={() => {
              onSelect(country);
              onDismiss();
            }}
          >
            <Text>{country.name}</Text>
            <Text>{country.code}</Text>
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

export { countries };
