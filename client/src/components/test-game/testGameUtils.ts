import type { VisibleGameState } from "@zy/shared";
import type { RoleOption } from "./testGameTypes";

export const roleOptions: RoleOption[] = [
  { id: "assassin", name: "刺客" },
  { id: "thief", name: "盗贼" },
  { id: "magician", name: "魔术师" },
  { id: "king", name: "国王" },
  { id: "bishop", name: "主教" },
  { id: "merchant", name: "商人" },
  { id: "architect", name: "建筑师" },
  { id: "warlord", name: "军阀" }
];

export function phaseText(phase: VisibleGameState["phase"]) {
  const text: Record<VisibleGameState["phase"], string> = {
    LOBBY: "大厅",
    GAME_START: "游戏开始",
    CROWN_REVEAL: "皇冠随机",
    ROLE_SELECTION: "角色选择",
    ROLE_ACTION: "角色行动",
    ROUND_END: "回合结束",
    SCORING: "结算",
    ENDED: "已结束"
  };
  return text[phase];
}

export function playerName(gameState: VisibleGameState, playerId: string | null) {
  return gameState.players.find((player) => player.id === playerId)?.name ?? "无";
}

export function roleName(roleId: string | null) {
  if (!roleId) {
    return "未公开";
  }
  return roleOptions.find((role) => role.id === roleId)?.name ?? roleId;
}

export function skillHint(roleId: string | null) {
  if (!roleId) {
    return "先完成秘密角色选择，进入你的角色行动后才能使用技能。";
  }

  const hints: Record<string, string> = {
    assassin: "刺客：选择一个还未行动的目标角色，本轮该角色跳过行动。",
    thief: "盗贼：选择一个还未行动的目标角色，目标行动前会被偷走金币；不能偷刺客或被刺客跳过的角色。",
    magician: "魔术师：勾选任意手牌，弃掉后抽等量新牌。",
    king: "国王：使用后获得下一轮先手权。",
    bishop: "主教：使用后本轮你的建筑受到保护。",
    merchant: "商人：按你城市里的绿色建筑数量获得额外金币。",
    architect: "建筑师：使用后额外抽 2 张建筑牌，本轮最多建造 3 个建筑。",
    warlord: "军阀：选择其他玩家的一座建筑，支付建筑费用 -1 的金币后破坏。"
  };

  return hints[roleId] ?? "当前角色暂无技能说明。";
}

