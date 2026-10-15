function userLoginMethods(user) {
  if (user.created_platform === "wechat_mini_program" || user.registration_channel === "wechat") return ["wechat"];
  return [
    ...(user.email_normalized && user.password_hash && user.email_login_enabled !== false ? ["email"] : []),
    ...(user.phone_e164 && user.password_hash ? ["phone"] : []),
    ...(user.google_sub ? ["google"] : []),
  ];
}

module.exports = { userLoginMethods };
