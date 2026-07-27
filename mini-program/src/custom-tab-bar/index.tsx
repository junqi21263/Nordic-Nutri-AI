// WeChat renders this component automatically on tab pages, but we render the
// BottomTabBar directly in PageLayout so that ALL pages (including non-tab pages
// opened via reLaunch) show the tab bar. Returning null here avoids double rendering.
function CustomTabBar() {
  return null;
}

CustomTabBar.options = {
  addGlobalClass: true,
};

export default CustomTabBar;
