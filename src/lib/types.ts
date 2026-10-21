export type ParticipantRole = "host" | "player" | "spectator";
export type RoomStatus = "lobby" | "waiting_for_question" | "ended";
export type PresetKey = "classic";

export type Participant = {
  id: string;
  name: string;
  role: ParticipantRole;
  joined_at: string;
};

export type RoomSnapshot = {
  code: string;
  status: RoomStatus;
  presetKey: PresetKey;
  participants: Participant[];
  isHost: boolean;
};
