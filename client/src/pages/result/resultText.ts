import type { ResultHighlight, ResultTitleType } from "@zy/shared";
import { visualAssets } from "../../config/visualAssets";

export const resultTitleLabels: Record<ResultTitleType, string> = {
  first_city: "开城先锋",
  five_color: "五色收藏家",
  city_master: "城市巨匠",
  treasury_keeper: "金库守护者",
  yellow_theme: "王城营造师",
  blue_theme: "圣堂建筑师",
  green_theme: "商贸规划师",
  red_theme: "军镇统筹者",
  purple_theme: "奇迹收藏家",
  city_dreamer: "城市筑梦家"
};

export function highlightAwardLabel(highlight: ResultHighlight) {
  switch (highlight.type) {
    case "first_city": return "开城先锋";
    case "five_color": return "五色之城";
    case "largest_steal": return "巧取高手";
    case "most_builds": return "建造达人";
    case "highest_role_income": return "职业收入王";
    case "warlord_destroy": return "拆城高手";
    case "district_score": return "建筑之星";
  }
}

export function highlightPerformanceText(highlight: ResultHighlight) {
  switch (highlight.type) {
    case "first_city": return "全场首位完成城市";
    case "five_color": return "集齐五种颜色";
    case "largest_steal": return `单次巧取 ${highlight.value} 金`;
    case "most_builds": return `本局建造 ${highlight.value} 次`;
    case "highest_role_income": return `职业收入 ${highlight.value} 金`;
    case "warlord_destroy": return `精彩拆除 ${highlight.value} 次`;
    case "district_score": return `建筑分 ${highlight.value} 领跑`;
  }
}

export function highlightIcon(highlight: ResultHighlight) {
  return visualAssets.result.highlights[highlight.type];
}
