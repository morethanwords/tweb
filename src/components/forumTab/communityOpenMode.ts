export const USE_COMMUNITY_NAVIGATION_TAB = true;

export default function shouldOpenForumAsNavigationTab(options: {
  hasNavigationHistory: boolean,
  isCommunity: boolean,
  isNarrowScreen: boolean,
  useCommunityNavigationTab?: boolean
}) {
  return options.hasNavigationHistory || (
    options.isCommunity &&
    (
      (options.useCommunityNavigationTab ??
        USE_COMMUNITY_NAVIGATION_TAB) ||
      options.isNarrowScreen
    )
  );
}
