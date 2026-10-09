module.exports = {
  presets: [
    [
      "taro",
      {
        framework: "react",
        ts: true,
        compiler: "webpack5",
        hot: process.env.TARO_APP_PLATFORM !== "android",
      },
    ],
  ],
};
