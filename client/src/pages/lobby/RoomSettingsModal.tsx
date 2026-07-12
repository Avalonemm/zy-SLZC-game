import type { FormEvent } from "react";
import { InfoModal } from "./InfoModal";
import { standardRoles } from "./lobbyScreenConfig";

export function RoomSettingsModal(props: {
  turnTimeoutInput: string;
  endCitySizeInput: string;
  enabledRoleIdsInput: string[];
  enableFaceUpRoleDiscardInput: boolean;
  enableFaceDownRoleDiscardInput: boolean;
  canUseFaceUpRoleDiscard: boolean;
  canUseFaceDownRoleDiscard: boolean;
  canSaveRoomSettings: boolean;
  requiredRoleCount: number;
  onTurnTimeoutChange: (value: string) => void;
  onEndCitySizeChange: (value: string) => void;
  onToggleEnabledRole: (roleId: string) => void;
  onFaceUpRoleDiscardChange: (value: boolean) => void;
  onFaceDownRoleDiscardChange: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <InfoModal title={"\u623f\u95f4\u8bbe\u7f6e"} onClose={props.onClose}>
      <form className="room-settings-form" onSubmit={props.onSubmit}>
        <label>
          <span>{"\u6bcf\u8f6e\u73a9\u5bb6\u7b49\u5f85\u79d2\u6570"}</span>
          <input
            min={10}
            max={180}
            type="number"
            value={props.turnTimeoutInput}
            onChange={(event) => props.onTurnTimeoutChange(event.target.value)}
          />
        </label>
        <label>
          <span>{"\u7ed3\u675f\u5efa\u7b51\u6570"}</span>
          <input
            min={4}
            max={8}
            type="number"
            value={props.endCitySizeInput}
            onChange={(event) => props.onEndCitySizeChange(event.target.value)}
          />
        </label>
        <fieldset className="room-settings-form__fieldset">
          <legend>{"\u672c\u5c40\u542f\u7528\u89d2\u8272"}</legend>
          <div className="room-settings-form__roles">
            {standardRoles.map((role) => (
              <label key={role.id}>
                <input
                  type="checkbox"
                  checked={props.enabledRoleIdsInput.includes(role.id)}
                  onChange={() => props.onToggleEnabledRole(role.id)}
                />
                {role.name}
              </label>
            ))}
          </div>
        </fieldset>
        {!props.canSaveRoomSettings && (
          <p className="room-settings-form__warning">
            {"\u5f53\u524d\u81f3\u5c11\u9700\u8981\u542f\u7528"} {props.requiredRoleCount} {"\u4e2a\u89d2\u8272"}
          </p>
        )}
        <label className={props.canUseFaceUpRoleDiscard ? "room-settings-form__check" : "room-settings-form__check room-settings-form__check--disabled"}>
          <input
            type="checkbox"
            disabled={!props.canUseFaceUpRoleDiscard}
            checked={props.canUseFaceUpRoleDiscard && props.enableFaceUpRoleDiscardInput}
            onChange={(event) => props.onFaceUpRoleDiscardChange(event.target.checked)}
          />
          {"\u542f\u7528\u660e\u5f03\u89d2\u8272"}
          {!props.canUseFaceUpRoleDiscard && <small>{"6\u4eba\u4ee5\u4e0a\u4e0d\u4f7f\u7528\u660e\u5f03"}</small>}
        </label>
        <label className={props.canUseFaceDownRoleDiscard ? "room-settings-form__check" : "room-settings-form__check room-settings-form__check--disabled"}>
          <input
            type="checkbox"
            disabled={!props.canUseFaceDownRoleDiscard}
            checked={props.canUseFaceDownRoleDiscard && props.enableFaceDownRoleDiscardInput}
            onChange={(event) => props.onFaceDownRoleDiscardChange(event.target.checked)}
          />
          {"\u542f\u7528\u6697\u5f03\u89d2\u8272"}
          {!props.canUseFaceDownRoleDiscard && <small>{"8\u4eba\u4e0d\u4f7f\u7528\u5f03\u724c"}</small>}
        </label>
        <button type="submit" disabled={!props.canSaveRoomSettings}>{"\u4fdd\u5b58\u8bbe\u7f6e"}</button>
      </form>
    </InfoModal>
  );
}
