import { useEffect, useMemo, useState } from "react";
import { getRoleDiscardPolicy } from "@zy/shared";
import type { RoomState } from "@zy/shared";
import { standardRoles } from "./lobbyScreenConfig";

export function useRoomSettings(roomState: RoomState | null) {
  const roomSettingsRoleKey = roomState?.settings.enabledRoleIds.join("|") ?? "";
  const [turnTimeoutInput, setTurnTimeoutInput] = useState("15");
  const [endCitySizeInput, setEndCitySizeInput] = useState("8");
  const [enabledRoleIdsInput, setEnabledRoleIdsInput] = useState<string[]>(
    standardRoles.map((role) => role.id)
  );
  const [enableFaceUpRoleDiscardInput, setEnableFaceUpRoleDiscardInput] = useState(true);
  const [enableFaceDownRoleDiscardInput, setEnableFaceDownRoleDiscardInput] = useState(true);

  useEffect(() => {
    if (!roomState) {
      return;
    }

    setTurnTimeoutInput(String(roomState.settings.turnTimeoutSeconds));
    setEndCitySizeInput(String(roomState.settings.endCitySize));
    setEnabledRoleIdsInput(roomState.settings.enabledRoleIds);
    setEnableFaceUpRoleDiscardInput(roomState.settings.enableFaceUpRoleDiscard);
    setEnableFaceDownRoleDiscardInput(roomState.settings.enableFaceDownRoleDiscard);
  }, [
    roomSettingsRoleKey,
    roomState?.settings.turnTimeoutSeconds,
    roomState?.settings.endCitySize,
    roomState?.settings.enableFaceUpRoleDiscard,
    roomState?.settings.enableFaceDownRoleDiscard
  ]);

  const roomDiscardPolicy = useMemo(
    () =>
      roomState
        ? getRoleDiscardPolicy(roomState.maxPlayers, roomState.settings.enabledRoleIds.length)
        : null,
    [roomState?.maxPlayers, roomState?.settings.enabledRoleIds.length]
  );
  const settingsDiscardPolicy = useMemo(
    () => (roomState ? getRoleDiscardPolicy(roomState.maxPlayers, enabledRoleIdsInput.length) : null),
    [enabledRoleIdsInput.length, roomState?.maxPlayers]
  );
  const canUseFaceUpRoleDiscard = settingsDiscardPolicy?.canUseFaceUpDiscard ?? true;
  const canUseFaceDownRoleDiscard = settingsDiscardPolicy?.canUseFaceDownDiscard ?? true;
  const roomDiscardSummary =
    roomState && roomDiscardPolicy
      ? [
          roomState.settings.enableFaceDownRoleDiscard && roomDiscardPolicy.canUseFaceDownDiscard
            ? `\u6697\u5f03 ${roomDiscardPolicy.faceDownDiscardCount} \u5f20`
            : "",
          roomState.settings.enableFaceUpRoleDiscard && roomDiscardPolicy.canUseFaceUpDiscard
            ? `\u660e\u5f03 ${roomDiscardPolicy.faceUpDiscardCount} \u5f20`
            : ""
        ]
          .filter(Boolean)
          .join(" \u00b7 ") || "\u4e0d\u5f03\u724c"
      : "";
  const requiredRoleCount = roomState
    ? Math.max(roomState.minPlayers, roomState.players.length)
    : 0;
  const canSaveRoomSettings = !roomState || enabledRoleIdsInput.length >= requiredRoleCount;

  function toggleEnabledRole(roleId: string) {
    setEnabledRoleIdsInput((current) =>
      current.includes(roleId)
        ? current.filter((enabledRoleId) => enabledRoleId !== roleId)
        : [...current, roleId]
    );
  }

  return {
    turnTimeoutInput,
    endCitySizeInput,
    enabledRoleIdsInput,
    enableFaceUpRoleDiscardInput,
    enableFaceDownRoleDiscardInput,
    canUseFaceUpRoleDiscard,
    canUseFaceDownRoleDiscard,
    roomDiscardSummary,
    requiredRoleCount,
    canSaveRoomSettings,
    setTurnTimeoutInput,
    setEndCitySizeInput,
    setEnableFaceUpRoleDiscardInput,
    setEnableFaceDownRoleDiscardInput,
    toggleEnabledRole
  };
}
