export type ParticipantRole = "host" | "player" | "spectator";
export type GamePhase = "lobby" | "preparing" | "answering" | "voting" | "results" | "finished";
export type RoomStatus = GamePhase;
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
  role: ParticipantRole;
  game: {
    question: { text: string; type: QuestionType } | null;
    correctAnswer?: string;
    ownAnswers?: string[];
    publicAnswers?: PublicAnswer[];
    submittedPlayerCount?: number;
    phaseEndsAt: string | null;
    answeringSeconds: number;
    votingSeconds: number;
  };
};

export type PublicAnswer = { id: string; text: string };
