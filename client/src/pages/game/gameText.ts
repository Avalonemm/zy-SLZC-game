import type { VisibleGameState } from "@zy/shared";
import type { RoleOption } from "./gameTypes";

export const roleOptions: RoleOption[] = [
  { id: "assassin", name: "\u523a\u5ba2" },
  { id: "thief", name: "\u76d7\u8d3c" },
  { id: "magician", name: "\u9b54\u672f\u5e08" },
  { id: "king", name: "\u56fd\u738b" },
  { id: "bishop", name: "\u4e3b\u6559" },
  { id: "merchant", name: "\u5546\u4eba" },
  { id: "architect", name: "\u5efa\u7b51\u5e08" },
  { id: "warlord", name: "\u519b\u9600" }
];

export function phaseText(phase: VisibleGameState["phase"]) {
  const text: Record<VisibleGameState["phase"], string> = {
    LOBBY: "\u5927\u5385",
    GAME_START: "\u6e38\u620f\u5f00\u59cb",
    CROWN_REVEAL: "\u7687\u51a0\u968f\u673a",
    ROLE_SELECTION: "\u89d2\u8272\u9009\u62e9",
    ROLE_ACTION: "\u89d2\u8272\u884c\u52a8",
    ROUND_END: "\u56de\u5408\u7ed3\u675f",
    SCORING: "\u7ed3\u7b97",
    ENDED: "\u5df2\u7ed3\u675f"
  };
  return text[phase];
}

export function playerName(gameState: VisibleGameState, playerId: string | null) {
  return gameState.players.find((player) => player.id === playerId)?.name ?? "\u65e0";
}

export function roleName(roleId: string | null) {
  if (!roleId) {
    return "\u672a\u516c\u5f00";
  }
  return roleOptions.find((role) => role.id === roleId)?.name ?? roleId;
}

export function roleOrder(roleId: string | null) {
  if (!roleId) {
    return "?";
  }

  const index = roleOptions.findIndex((role) => role.id === roleId);
  return index === -1 ? "?" : String(index + 1);
}
export function skillHint(roleId: string | null) {
  if (!roleId) {
    return "\u5148\u5b8c\u6210\u79d8\u5bc6\u89d2\u8272\u9009\u62e9\uff0c\u8fdb\u5165\u4f60\u7684\u89d2\u8272\u884c\u52a8\u540e\u624d\u80fd\u4f7f\u7528\u6280\u80fd\u3002";
  }

  const hints: Record<string, string> = {
    assassin: "\u523a\u5ba2\uff1a\u9009\u62e9\u4e00\u4e2a\u8fd8\u672a\u884c\u52a8\u7684\u76ee\u6807\u89d2\u8272\uff0c\u672c\u8f6e\u8be5\u89d2\u8272\u8df3\u8fc7\u884c\u52a8\u3002",
    thief: "\u76d7\u8d3c\uff1a\u9009\u62e9\u4e00\u4e2a\u8fd8\u672a\u884c\u52a8\u7684\u76ee\u6807\u89d2\u8272\uff0c\u76ee\u6807\u884c\u52a8\u524d\u4f1a\u88ab\u5077\u8d70\u91d1\u5e01\uff1b\u4e0d\u80fd\u5077\u523a\u5ba2\u6216\u88ab\u523a\u5ba2\u8df3\u8fc7\u7684\u89d2\u8272\u3002",
    magician: "\u9b54\u672f\u5e08\uff1a\u52fe\u9009\u4efb\u610f\u624b\u724c\uff0c\u5f03\u6389\u540e\u62bd\u7b49\u91cf\u65b0\u724c\uff1b\u4e5f\u53ef\u4ee5\u4e0e\u76ee\u6807\u73a9\u5bb6\u4ea4\u6362\u624b\u724c\u3002",
    king: "\u56fd\u738b\uff1a\u4f7f\u7528\u540e\u83b7\u5f97\u4e0b\u4e00\u8f6e\u5148\u624b\u6743\u3002",
    bishop: "\u4e3b\u6559\uff1a\u4f7f\u7528\u540e\u672c\u8f6e\u4f60\u7684\u5efa\u7b51\u53d7\u5230\u4fdd\u62a4\u3002",
    merchant: "\u5546\u4eba\uff1a\u6309\u4f60\u57ce\u5e02\u91cc\u7684\u7eff\u8272\u5efa\u7b51\u6570\u91cf\u83b7\u5f97\u989d\u5916\u91d1\u5e01\u3002",
    architect: "\u5efa\u7b51\u5e08\uff1a\u4f7f\u7528\u540e\u989d\u5916\u62bd 2 \u5f20\u5efa\u7b51\u724c\uff0c\u672c\u8f6e\u6700\u591a\u5efa\u9020 3 \u4e2a\u5efa\u7b51\u3002",
    warlord: "\u519b\u9600\uff1a\u9009\u62e9\u5176\u4ed6\u73a9\u5bb6\u7684\u4e00\u5ea7\u5efa\u7b51\uff0c\u652f\u4ed8\u5efa\u7b51\u8d39\u7528 -1 \u7684\u91d1\u5e01\u540e\u7834\u574f\u3002"
  };

  return hints[roleId] ?? "\u5f53\u524d\u89d2\u8272\u6682\u65e0\u6280\u80fd\u8bf4\u660e\u3002";
}