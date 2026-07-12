import type { RoomState, VisibleGameState } from "@zy/shared";

export type GuideStep = {
  id: "home" | "ready" | "role" | "resource" | "draw" | "action" | "waiting" | "result";
  title: string;
  body: string;
};

export function getCurrentGuideStep(options: {
  roomState: RoomState | null;
  gameState: VisibleGameState | null;
  playerId: string | null;
}): GuideStep {
  const { roomState, gameState, playerId } = options;
  if (!roomState) {
    return {
      id: "home",
      title: "先进入一间房",
      body: "创建房间后可以加入机器人，也可以把房间码发给朋友。已有房间码时直接输入并加入。"
    };
  }

  const self = gameState?.players.find((player) => player.id === playerId) ?? null;
  if (!gameState) {
    const lobbySelf = roomState.players.find((player) => player.id === playerId);
    if (lobbySelf?.isHost) {
      return {
        id: "ready",
        title: "等待其他玩家准备",
        body: "正式对局需要 4–8 名玩家，至少一名真人。其他玩家全部准备后，点击开始游戏即可开局；房主无需单独准备。"
      };
    }
    return {
      id: "ready",
      title: lobbySelf?.isReady ? "等待其他玩家准备" : "准备开始",
      body: "正式对局需要 4–8 名玩家，至少一名真人。确认房间规则后点击准备，等待房主开始游戏。"
    };
  }

  if (gameState.phase === "ENDED") {
    return {
      id: "result",
      title: "查看本局结算",
      body: "总分由建筑分和奖励分组成。房主可以保留当前座位和设置，发起再来一局。"
    };
  }

  if (gameState.phase === "ROLE_SELECTION") {
    return {
      id: "role",
      title: "秘密选择身份",
      body: gameState.roleSelectionTurnPlayerId === playerId
        ? "点击一张身份牌完成选择。其他玩家不会看到你的身份，身份会按编号依次行动。"
        : "等待当前玩家选完身份。轮到你时，可选身份牌会出现在桌面中央。"
    };
  }

  if (gameState.pendingDrawChoice?.playerId === playerId) {
    return {
      id: "draw",
      title: "保留一张建筑牌",
      body: "查看候选牌的费用和效果，点击其中一张加入手牌，其余牌会放回牌堆底部。"
    };
  }

  if (gameState.phase === "ROLE_ACTION" && gameState.currentTurnPlayerId === playerId) {
    if (!gameState.turnState?.resourceActionTaken) {
      return {
        id: "resource",
        title: "先选择本回合资源",
        body: "获取 2 枚金币，或抽取建筑牌。两项只能选择一项，完成后才能继续建造。"
      };
    }
    return {
      id: "action",
      title: "建造、使用能力或结束回合",
      body: `点击手牌可以建造；身份为 ${self?.selectedRoleId ? "已公开角色" : "当前角色"} 时也可以使用技能。完成操作后点击结束回合。`
    };
  }

  return {
    id: "waiting",
    title: "观察其他玩家行动",
    body: "当前行动玩家的名片会高亮。你可以悬停查看已公开的身份和建筑说明。"
  };
}

export function FirstTimeGuide(props: {
  step: GuideStep;
  onDismissStep: () => void;
  onFinish: () => void;
}) {
  return (
    <aside className="first-time-guide" aria-live="polite" aria-label="新手引导">
      <span>新手引导</span>
      <strong>{props.step.title}</strong>
      <p>{props.step.body}</p>
      <div>
        <button type="button" onClick={props.onDismissStep}>本阶段知道了</button>
        <button type="button" onClick={props.onFinish}>结束引导</button>
      </div>
    </aside>
  );
}
