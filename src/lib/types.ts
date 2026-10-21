export type ParticipantRole = "host" | "player" | "spectator";
export type RoomStatus = "lobby" | "waiting_for_question" | "ended";
export type QuestionType = "normal" | "special";

export type Participant = {
  id: string;
  name: string;
  role: ParticipantRole;
  joined_at: string;
};

export type PresetSummary = {
  id: string;
  name: string;
  isBuiltin: boolean;
  questionCount: number;
};

export type PresetQuestion = {
  id: string;
  text: string;
  correctAnswer: string;
  type: QuestionType;
  sortOrder: number;
};

export type PresetDetails = PresetSummary & { questions: PresetQuestion[] };

export type RoomSnapshot = {
  code: string;
  status: RoomStatus;
  preset: PresetSummary;
  participants: Participant[];
  isHost: boolean;
};
