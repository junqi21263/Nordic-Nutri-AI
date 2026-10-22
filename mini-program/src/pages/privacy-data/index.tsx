import { Switch, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../../layouts/page-layout';
import { navigateBackOrHome } from '../../utils/navigation';
import { getAnalyticsPreference, setAnalyticsPreference, subscribeAnalyticsPreference } from '../../features/analytics/runtime';
import './index.scss';

export default function PrivacyDataPage() {
  const { t } = useTranslation();
  const [preference, setPreference] = useState(getAnalyticsPreference);
  useEffect(() => subscribeAnalyticsPreference(() => setPreference(getAnalyticsPreference())), []);
  return (
    <PageLayout title={t('analyticsPrivacy.title')} subtitle={t('analyticsPrivacy.subtitle')} showTabs={false} showBack onTopBarBack={() => void navigateBackOrHome('/pages/profile/index')}>
      <View className="analytics-privacy">
        {(['analytics', 'diagnostics'] as const).map(key => (
          <View className="analytics-privacy__setting" key={key}>
            <View className="analytics-privacy__copy">
              <Text className="analytics-privacy__title">{t(`analyticsPrivacy.${key}`)}</Text>
              <Text className="analytics-privacy__description">{t(`analyticsPrivacy.${key}Description`)}</Text>
            </View>
            <Switch checked={preference[key]} color="#153f2b" ariaLabel={t(`analyticsPrivacy.${key}`)} onChange={event => setAnalyticsPreference({ ...preference, [key]: event.detail.value })} />
          </View>
        ))}
        <View className="analytics-privacy__notice">
          <Text>{t('analyticsPrivacy.collection')}</Text>
          <Text>{t('analyticsPrivacy.exclusions')}</Text>
          <Text>{t('analyticsPrivacy.retention')}</Text>
          <Text>{t('analyticsPrivacy.withdraw')}</Text>
        </View>
        <View className="analytics-privacy__link" onClick={() => void Taro.navigateTo({ url: '/pages/privacy-policy/index' })}><Text>{t('profile.privacy')} ›</Text></View>
        <View className="analytics-privacy__link" onClick={() => void Taro.navigateTo({ url: '/pages/account-cancellation/index' })}><Text>{t('analyticsPrivacy.rights')} ›</Text></View>
      </View>
    </PageLayout>
  );
}
