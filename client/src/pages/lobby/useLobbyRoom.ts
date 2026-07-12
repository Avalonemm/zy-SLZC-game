import type { FormEvent } from "react";
import type { LobbyPlayer, RoomState } from "@zy/shared";
import { socket } from "../../socket/socketClient";

export function useLobbyRoom(options: {
  roomState: RoomState | null;
  currentPlayer: LobbyPlayer | null;
  isHost: boolean;
  playerName: string;
  roomCodeInput: string;
  turnTimeoutInput: string;
  endCitySizeInput: string;
  enabledRoleIdsInput: string[];
  enableFaceUpRoleDiscardInput: boolean;
  enableFaceDownRoleDiscardInput: boolean;
  canUseFaceUpRoleDiscard: boolean;
  canUseFaceDownRoleDiscard: boolean;
  canSaveRoomSettings: boolean;
  requiredRoleCount: number;
  onMessage: (message: string) => void;
  onResetActionEvents: () => void;
  onRoomSettingsSaved: () => void;
  onLeaveRoomLocally: (message: string) => void;
}) {
  function createRoom(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    options.onMessage("");
    socket.emit("create_room", { playerName: options.playerName });
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    options.onMessage("");
    socket.emit("join_room", {
      playerName: options.playerName,
      roomCode: options.roomCodeInput
    });
  }

  function toggleReady() {
    if (!options.roomState || !options.currentPlayer) {
      return;
    }

    socket.emit("set_ready", {
      roomCode: options.roomState.roomCode,
      playerId: options.currentPlayer.id,
      isReady: !options.currentPlayer.isReady
    });
  }

  function startGame() {
    if (!options.roomState || !options.currentPlayer) {
      return;
    }

    socket.emit("start_game", {
      roomCode: options.roomState.roomCode,
      playerId: options.currentPlayer.id
    });
    options.onResetActionEvents();
  }

  function addBot() {
    if (!options.roomState || !options.currentPlayer) {
      return;
    }

    socket.emit("add_test_bots", {
      roomCode: options.roomState.roomCode,
      playerId: options.currentPlayer.id
    });
  }

  function addRoomSeat() {
    if (
      !options.roomState ||
      !options.currentPlayer ||
      !options.isHost ||
      options.roomState.maxPlayers >= options.roomState.futureMaxPlayers
    ) {
      return;
    }

    socket.emit("update_room_settings", {
      roomCode: options.roomState.roomCode,
      playerId: options.currentPlayer.id,
      settings: {
        maxPlayers: options.roomState.maxPlayers + 1
      }
    });
  }

  function removeRoomSeat() {
    if (!options.roomState || !options.currentPlayer || !options.isHost) {
      return;
    }

    const nextMaxPlayers = options.roomState.maxPlayers - 1;
    if (nextMaxPlayers < Math.max(options.roomState.minPlayers, options.roomState.players.length)) {
      return;
    }

    socket.emit("update_room_settings", {
      roomCode: options.roomState.roomCode,
      playerId: options.currentPlayer.id,
      settings: {
        maxPlayers: nextMaxPlayers
      }
    });
  }

  function removeBot(targetBotPlayerId: string) {
    if (!options.roomState || !options.currentPlayer) {
      return;
    }

    socket.emit("remove_test_bot", {
      roomCode: options.roomState.roomCode,
      playerId: options.currentPlayer.id,
      targetBotPlayerId
    });
  }

  function kickPlayer(targetPlayerId: string) {
    if (!options.roomState || !options.currentPlayer) {
      return;
    }

    socket.emit("kick_player", {
      roomCode: options.roomState.roomCode,
      playerId: options.currentPlayer.id,
      targetPlayerId
    });
  }

  function transferHost(targetPlayerId: string) {
    if (!options.roomState || !options.currentPlayer) {
      return;
    }

    socket.emit("transfer_host", {
      roomCode: options.roomState.roomCode,
      playerId: options.currentPlayer.id,
      targetPlayerId
    });
  }

  function updateRoomSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!options.roomState || !options.currentPlayer) {
      return;
    }

    if (!options.canSaveRoomSettings) {
      options.onMessage(
        `\u5f53\u524d\u81f3\u5c11\u9700\u8981\u542f\u7528 ${options.requiredRoleCount} \u4e2a\u89d2\u8272\u3002`
      );
      return;
    }

    socket.emit("update_room_settings", {
      roomCode: options.roomState.roomCode,
      playerId: options.currentPlayer.id,
      settings: {
        turnTimeoutSeconds: Number(options.turnTimeoutInput),
        endCitySize: Number(options.endCitySizeInput),
        enabledRoleIds: options.enabledRoleIdsInput,
        enableFaceUpRoleDiscard:
          options.canUseFaceUpRoleDiscard && options.enableFaceUpRoleDiscardInput,
        enableFaceDownRoleDiscard:
          options.canUseFaceDownRoleDiscard && options.enableFaceDownRoleDiscardInput,
        drawMode: "draw2Choose1"
      }
    });
    options.onRoomSettingsSaved();
  }

  function sendChatMessage(message: string) {
    if (!options.roomState || !options.currentPlayer) {
      return;
    }

    socket.emit("send_chat_message", {
      roomCode: options.roomState.roomCode,
      playerId: options.currentPlayer.id,
      message
    });
  }

  function leaveRoom() {
    if (!options.roomState || !options.currentPlayer) {
      return;
    }

    socket.emit("leave_room", {
      roomCode: options.roomState.roomCode,
      playerId: options.currentPlayer.id
    });
    options.onLeaveRoomLocally("\u5df2\u79bb\u5f00\u623f\u95f4\u3002");
  }

  return {
    createRoom,
    joinRoom,
    toggleReady,
    startGame,
    addBot,
    addRoomSeat,
    removeRoomSeat,
    removeBot,
    kickPlayer,
    transferHost,
    updateRoomSettings,
    sendChatMessage,
    leaveRoom
  };
}
