import type { VisibleGameState } from "@zy/shared";
import { roleName } from "./testGameUtils";

type TurnHintPanelProps = {
  currentTurnName: string;
  roleSelectionTurnName: string;
  selfRoleId: string | null;
  skillUsed: boolean;
  turnState: VisibleGameState["turnState"];
  turnTimer: VisibleGameState["turnTimer"];
  remainingSeconds: number | null;
};

export function TurnHintPanel(props: TurnHintPanelProps) {
  const buildProgress = props.turnState
    ? `${props.turnState.buildsUsed}/${props.turnState.maxBuilds}`
    : "0/0";
  const timerSeconds = props.turnTimer
    ? Math.min(
        Math.max(1, Math.ceil(props.turnTimer.timeoutMs / 1000)),
        Math.max(0, props.remainingSeconds ?? 0)
      )
    : null;

  return (
    <div className="test-status-strip">
      <span className="test-status-pill">当前行动：{props.currentTurnName}</span>
      <span className="test-status-pill">角色选择：{props.roleSelectionTurnName}</span>
      <span className="test-status-pill">你的角色：{roleName(props.selfRoleId)}</span>
      <span className="test-status-pill">
        资源行动：{props.turnState?.resourceActionTaken ? "已选择" : "未选择"}
      </span>
      <span className="test-status-pill">建造次数：{buildProgress}</span>
      <span className="test-status-pill">技能：{props.skillUsed ? "已使用" : "未使用"}</span>
      <span className="test-status-pill">
        倒计时：{timerSeconds !== null ? `${timerSeconds} 秒` : "无"}
      </span>
    </div>
  );
}
