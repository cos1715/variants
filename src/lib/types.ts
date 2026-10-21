export type ParticipantRole = "host" | "player" | "spectator";
export type GamePhase = "lobby" | "preparing" | "answering" | "voting" | "results" | "finished";
export type RoomStatus = GamePhase;

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
  answerCount: number;
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
    question: { text: string; answerCount: number } | null;
    correctAnswer?: string;
    ownAnswers?: string[];
    publicAnswers?: PublicAnswer[];
    ownPublicAnswerIds?: string[];
    hasVoted?: boolean;
    votedPlayerCount?: number;
    votingClosedAt?: string | null;
    results?: RoundResults;
    leaderboard?: LeaderboardEntry[];
    hasNextQuestion?: boolean;
    submittedPlayerCount?: number;
    phaseEndsAt: string | null;
    answeringSeconds: number;
    votingSeconds: number;
    scoreAdjustments?: ScoreAdjustment[];
  };
};

export type PublicAnswer = { id: string; text: string };
export type ResultAnswer = PublicAnswer & { kind: "correct" | "host_lie" | "player_lie"; authorName: string | null; voteCount: number; voters: string[] };
export type LeaderboardEntry = { participantId: string; name: string; score: number; lastRoundDelta: number; place: number };
export type RoundResults = { answers: ResultAnswer[] };
export type ScoreAdjustment = { id: string; participantId: string; participantName: string; delta: number; reason: string | null; createdAt: string };
