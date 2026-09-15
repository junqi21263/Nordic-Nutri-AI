import { Image, Input, Text, View } from "@tarojs/components";
import { useState } from "react";
import { AppButton, type AppButtonProps } from "../../components/app-button";
import { NordicIcon } from "../../components/nordic-icon";
import heroImage from "../../assets/images/welcome-hero.jpg";

// Keep Stencil's button slot stable while React changes the busy label.
export function AuthButton({ loading = false, disabled, children, ...props }: AppButtonProps) {
  return <AppButton {...props} disabled={disabled || loading}>
    <View className={`auth-button-content ${loading ? "auth-button-content--busy" : ""}`}>
      {children}
    </View>
  </AppButton>;
}

export function AuthHero({ compact = false, muted = false }: { compact?: boolean; muted?: boolean }) {
  return (
    <View className={`auth-hero ${compact ? "auth-hero--compact" : ""} ${muted ? "auth-hero--muted" : ""}`}>
      <Image className="auth-hero__image" src={heroImage} mode="aspectFill" />
      <View className="auth-hero__fade" />
    </View>
  );
}

export function AuthNav({ onBack }: { onBack: () => void }) {
  return (
    <View className="auth-nav">
      <View className="auth-nav__back" onClick={onBack} ariaLabel="返回">
        <NordicIcon name="back" size={18} ariaLabel="返回" />
        <Text>返回</Text>
      </View>
      <Text className="auth-nav__title">NORDIC-NUTRI</Text>
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

export function PhoneInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <View className="auth-field">
      <Text className="auth-field__label">手机号</Text>
      <View className="auth-phone-input">
        <View className="auth-phone-input__country">
          <NordicIcon name="china" size={18} ariaLabel="中国" />
          <Text>+86</Text>
        </View>
        <Input
          className="auth-phone-input__control"
          value={value}
          placeholder="请输入手机号"
          type="number"
          maxlength={11}
          onInput={(event) => onChange(event.detail?.value ?? "")}
        />
      </View>
    </View>
  );
}

export function PasswordInput({
  value,
  onChange,
  label = "密码",
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
          placeholder="请输入密码"
          maxlength={128}
          onInput={(event) => onChange(event.detail?.value ?? "")}
        />
        <Text className="auth-password__toggle" onClick={() => setVisible((current) => !current)}>
          {visible ? "隐藏" : "显示"}
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
        <Text className="auth-field__label">图形验证码</Text>
        <Text className="auth-field__label">输入图形验证码</Text>
      </View>
      <View className="auth-captcha__row">
        <View className="auth-captcha__image-wrap">
          {captcha ? <Image className="auth-captcha__image" src={captchaImage(captcha)} mode="aspectFit" /> : <Text className="auth-captcha__placeholder" onClick={onRefresh}>点击加载验证码</Text>}
          <View className="auth-captcha__refresh" onClick={onRefresh} ariaLabel="刷新图形验证码">
            <NordicIcon name="refresh-cw" size={18} ariaLabel="刷新" />
          </View>
        </View>
        <Input
          className="auth-field__input auth-captcha__input"
          value={value}
          placeholder="输入图形验证码"
          maxlength={8}
          onInput={(event) => onChange(event.detail?.value ?? "")}
        />
      </View>
      {error ? <Text className="auth-inline-error">图形验证码不正确，请重新输入</Text> : null}
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
    <View className="auth-otp" ariaLabel="6 位验证码">
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
      {onRetry ? <Text className="auth-message__retry" onClick={onRetry}>重试</Text> : null}
    </View>
  );
}
