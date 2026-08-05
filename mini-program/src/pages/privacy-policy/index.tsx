import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { PageLayout } from "../../layouts/page-layout";
import { navigateBackOrHome } from "../../utils/navigation";

const sections = [
  {
    title: "收集的信息",
    content:
      "为提供服务，我们会处理微信登录身份标识、你主动设置的昵称和头像、身体与营养目标档案、饮食记录、你主动上传的识别图片，以及你提交的反馈内容。",
  },
  {
    title: "使用目的",
    content:
      "这些信息仅用于账号识别和数据隔离、展示记录与目标进度、进行餐食营养估算、提供 AI 识别和营养教练参考建议，以及处理你的问题与反馈。",
  },
  {
    title: "AI 处理与权限用途",
    content:
      "当你主动选择餐食图片时，图片将用于识别食材和生成营养估算；相机和相册仅用于选择餐食图片或保存你主动发起的分享海报。昵称和头像仅在你主动授权或编辑时使用。",
  },
  {
    title: "存储与保留",
    content:
      "数据通过 HTTPS 加密连接写入 CloudBase，并在你的 Nordic Nutri AI 产品账号存续期间保留。注销成功后，产品资料、身体与目标档案、饮食记录、识别图片及相关数据将被删除。",
  },
  {
    title: "你的权利",
    content:
      "你可以在资料页修改昵称、头像、身体档案和目标；可以退出当前设备登录；也可以申请注销 Nordic Nutri AI 产品账号。产品账号注销不会注销或影响你的微信账号。",
  },
  {
    title: "免责声明",
    content:
      "营养识别、营养估算与教练建议仅供日常饮食参考，不构成医疗诊断、治疗或处方，也不能替代医生、注册营养师或其他专业人士的意见。如有健康问题，请及时咨询专业人士。",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <PageLayout
      title="隐私政策与免责声明"
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => navigateBackOrHome("/pages/profile/index")}
      className="page-layout--privacy-policy"
    >
      <View className="privacy-policy-page">
        <Text className="privacy-policy-page__title">隐私政策与免责声明</Text>
        <Text className="privacy-policy-page__lead">你的记录与健康信息，应该由你清楚掌握。</Text>
        <Text className="privacy-policy-page__contact">
          如对本政策或个人信息处理有疑问，请通过「我的 → 反馈与帮助」联系我们。
        </Text>

        {sections.map((section) => (
          <View key={section.title} className="privacy-policy-page__section">
            <Text className="privacy-policy-page__section-title">{section.title}</Text>
            <Text className="privacy-policy-page__section-content">{section.content}</Text>
          </View>
        ))}

        <View
          className="privacy-policy-page__cancellation"
          ariaLabel="注销 Nordic Nutri AI 产品账号"
          onClick={() => void Taro.navigateTo({ url: "/pages/account-cancellation/index" })}
        >
          <View>
            <Text>注销 Nordic Nutri AI 产品账号</Text>
            <Text>删除产品数据，不影响你的微信账号</Text>
          </View>
          <Text>›</Text>
        </View>
      </View>
    </PageLayout>
  );
}
