export type LocaleMeta = {
  locale: string;
  resolvedLocale: string;
  isFallback: boolean;
};

export type MoneyDto = {
  minor: number;
  currency: string;
  exponent: number;
  display: string;
  symbol: string;
};

export type CourseCard = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  coverUrl: string | null;
  level: "beginner" | "intermediate" | "advanced";
  durationMinutes: number;
  availableLocales: string[];
  isFree: boolean;
  price: MoneyDto;
  ratingAvg: number;
  ratingCount: number;
  studentsCount: number;
  category: string | null;
  instructor: { name: string; avatarUrl: string | null } | null;
  meta: LocaleMeta;
};

export type CurriculumLesson = {
  id: string;
  slug: string;
  title: string;
  type: string;
  durationMinutes: number;
  isPreview: boolean;
  locked: boolean;
  status?: string;
};

export type CourseDetail = CourseCard & {
  description: string;
  outcomes: string[];
  requirements: string[];
  curriculum: { id: string; title: string; lessons: CurriculumLesson[] }[];
  lessonsCount: number;
  isEnrolled: boolean;
  reviews: {
    id: string;
    rating: number;
    content: string | null;
    author: string;
    avatarUrl: string | null;
  }[];
};

export type Block = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

export type Lesson = {
  id: string;
  slug: string;
  courseSlug: string;
  courseTitle: string;
  title: string;
  type: string;
  durationMinutes: number;
  blocks: Block[];
  media: {
    assetId: string;
    src: string;
    poster: string | null;
    durationSeconds: number;
    subtitles: { locale: string; src: string }[];
  } | null;
  quizId: string | null;
  progress: {
    status: string;
    lastPositionSeconds: number;
    watchedSeconds: number;
    blocksSeen: string[];
  } | null;
  meta: LocaleMeta;
};

export type Outline = {
  courseId: string;
  slug: string;
  title: string;
  modules: { id: string; title: string; lessons: CurriculumLesson[] }[];
  lessonsTotal: number;
  lessonsCompleted: number;
  progressPercent: number;
  hasAccess: boolean;
};

export type QuizQuestion = {
  id: string;
  type: "single" | "multiple" | "boolean" | "short_text" | "number";
  prompt: string;
  points: number;
  config: { unit?: string; placeholder?: string };
  options: { id: string; content: string }[];
};

export type QuizAttempt = {
  attemptId: string;
  quizId: string;
  title: string;
  attemptNumber: number;
  maxAttempts: number;
  passingScore: number;
  status: string;
  deadlineAt: string | null;
  serverTime: string;
  questions: QuizQuestion[];
  answers: Record<string, Record<string, unknown>>;
};

export type QuizResult = {
  attemptId: string;
  score: number;
  maxScore: number;
  scorePercent: number;
  passed: boolean;
  passingScore: number;
  attemptNumber: number;
  maxAttempts: number;
  showAnswers: boolean;
  review: {
    questionId: string;
    prompt: string;
    type: string;
    isCorrect: boolean;
    pointsAwarded: number;
    points: number;
    answered: boolean;
    explanation?: string;
    yourAnswer?: Record<string, unknown> | null;
    correctOptions?: { id: string; content: string }[];
    correctValue?: unknown;
  }[];
};

export type MyCourse = {
  courseId: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  lessonsTotal: number;
  lessonsCompleted: number;
  progressPercent: number;
  status: string;
  continueSlug: string | null;
};

export type Certificate = {
  serial: string;
  courseTitle: string;
  courseSlug: string;
  issuedAt: string;
  nameAr: string | null;
  nameEn: string | null;
  scorePercent: number;
};

export type Me = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  locale: string;
  roles: string[];
};

export type Achievement = {
  code: string;
  icon: string;
  name: string;
  hint: string;
  target: number;
  progress: number;
  unlockedAt: string | null;
};

export type LearnerStats = {
  totalXp: number;
  level: number;
  title: string;
  levelFloor: number;
  levelCeiling: number | null;
  intoLevel: number;
  levelSpan: number | null;
  streakDays: number;
  longestStreak: number;
  activeDays: number;
  lessonsCompleted: number;
  minutesLearned: number;
  quizzesPassed: number;
  perfectQuizzes: number;
  coursesCompleted: number;
  achievements: Achievement[];
  achievementsUnlocked: number;
  achievementsTotal: number;
};
