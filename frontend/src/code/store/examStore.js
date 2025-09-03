import { create } from 'zustand';

// ------------------------------------------------------------
// useExamStore: Holds exam content and schedule utilities
// ------------------------------------------------------------
const useExamStore = create((set, get) => ({
  // Raw payload fields from GET /api/sessions/get_exam_content/{exam_id}
  exam_meta: {
    user_name: '',
    user_id: '',
    exam_title: '',
    exam_start_datetime: null,
    exam_end_datetime: null,
    exam_duration_time: null,
    break_time: null,
  },
  schedules: [], // [{ schedule_id, schedule_index, start_datetime: Date, end_datetime: Date, content_id }]
  exam_contents: [], // As returned from backend

  // Track submissions to prevent duplicate attempts per schedule
  submitted_history: [], // [{ schedule_id, exam_content_id }]
  last_submitted: null, // { schedule_id, exam_content_id }

  // Legacy fields kept for backward compatibility with existing UI
  examDetails: {
    title: '',
    period: '',
    startTime: null,
    endTime: null,
  },
  questions: [],
  answers: {}, // { questionId: [selectedOptionIndex1, selectedOptionIndex2] } (legacy demo)
  isSubmitted: false,

  // Map backend payload into store
  setExamData: (payload) => {
    // Accept both mock shape and backend shape gracefully
    // If payload has exam_contents it is the real backend response.
    if (payload && payload.exam_contents) {
      const start = payload.exam_start_datetime ? new Date(payload.exam_start_datetime) : null;
      const end = payload.exam_end_datetime ? new Date(payload.exam_end_datetime) : null;
      const schedules = (payload.schedules || []).map((s) => ({
        schedule_id: s.schedule_id,
        schedule_index: s.schedule_index,
        start_datetime: new Date(s.start_datetime),
        end_datetime: new Date(s.end_datetime),
        content_id: s.content_id,
      }));

      set({
        exam_meta: {
          user_name: payload.user_name,
          user_id: payload.user_id,
          exam_title: payload.exam_title,
          exam_start_datetime: start,
          exam_end_datetime: end,
          exam_duration_time: payload.exam_duration_time,
          break_time: payload.break_time,
        },
        schedules,
        exam_contents: payload.exam_contents || [],

        // keep legacy fields populated for existing UI
        examDetails: {
          title: payload.exam_title || '',
          period: '',
          startTime: start,
          endTime: end,
        },
      });
      return;
    }

    // Fallback to previous mock structure (ExamPage current demo)
    set({
      examDetails: {
        title: payload?.title || '',
        period: payload?.period || '',
        startTime: payload?.startTime ? new Date(payload.startTime) : null,
        endTime: payload?.endTime ? new Date(payload.endTime) : null,
      },
      questions: payload?.questions || [],
      answers: (payload?.questions || []).reduce((acc, q) => {
        acc[q.id] = [];
        return acc;
      }, {}),
    });
  },

  // Schedule helpers ------------------------------------------------------
  // Return current schedule object (or null) based on provided or current time
  getCurrentSchedule: (now = new Date()) => {
    const { schedules } = get();
    if (!schedules || schedules.length === 0) return null;
    const t = now instanceof Date ? now : new Date(now);
    return (
      schedules.find(
        (s) => t >= s.start_datetime && t <= s.end_datetime
      ) || null
    );
  },

  // Return current schedule_index (교시) or null
  getCurrentScheduleIndex: (now = new Date()) => {
    const sch = get().getCurrentSchedule(now);
    return sch ? sch.schedule_index : null;
  },

  // Whether there is a future schedule from given time
  hasNextSchedule: (now = new Date()) => {
    const { schedules } = get();
    if (!schedules || schedules.length === 0) return false;
    const t = now instanceof Date ? now : new Date(now);
    return schedules.some((s) => s.start_datetime > t);
  },

  // Get the very next schedule from given time (or null)
  getNextSchedule: (now = new Date()) => {
    const { schedules } = get();
    if (!schedules || schedules.length === 0) return null;
    const t = now instanceof Date ? now : new Date(now);
    const future = schedules.filter((s) => s.start_datetime > t);
    future.sort((a, b) => a.start_datetime - b.start_datetime);
    return future[0] || null;
  },

  // Given schedule_id (optional), make sure it's the current schedule and not yet submitted,
  // then return the matching exam_content using the schedule's content_id.
  getExamContentForCurrent: ({ schedule_id, now = new Date() } = {}) => {
    const { schedules, exam_contents, last_submitted } = get();
    if (!schedules || schedules.length === 0) throw new Error('No schedules available');
    const current = get().getCurrentSchedule(now);
    if (!current) throw new Error('No active schedule at this time');

    if (schedule_id && schedule_id !== current.schedule_id) {
      throw new Error('Provided schedule_id does not match current schedule');
    }

    if (last_submitted && last_submitted.schedule_id === current.schedule_id) {
      throw new Error('This schedule was already submitted');
    }

    const content = (exam_contents || []).find(
      (c) => c.exam_content_id === current.content_id || c.exam_content_id === current.schedule_id || c.schedule_id === current.schedule_id
    );
    if (!content) throw new Error('Exam content for current schedule not found');
    return { schedule: current, content };
  },

  // Direct accessor by schedule_id with duplicate-submission guard
  getExamContentForScheduleId: (schedule_id) => {
    const { schedules, exam_contents, last_submitted } = get();
    const sch = (schedules || []).find((s) => s.schedule_id === schedule_id);
    if (!sch) throw new Error('Invalid schedule_id');
    if (last_submitted && last_submitted.schedule_id === schedule_id) {
      throw new Error('This schedule was already submitted');
    }
    const content = (exam_contents || []).find(
      (c) => c.exam_content_id === sch.content_id || c.schedule_id === sch.schedule_id
    );
    if (!content) throw new Error('Exam content not found for the given schedule');
    return { schedule: sch, content };
  },

  // Record a submission so the same schedule cannot be started again
  recordSubmission: (schedule_id, exam_content_id) =>
    set((state) => ({
      last_submitted: { schedule_id, exam_content_id },
      submitted_history: [
        ...state.submitted_history,
        { schedule_id, exam_content_id },
      ],
      isSubmitted: true,
    })),

  // Legacy demo selection handlers kept for compatibility with current UI
  selectAnswer: (questionId, optionIndex) => {
    const { questions, answers } = get();
    const question = questions.find((q) => q.id === questionId);
    if (!question) return;

    const currentAnswers = answers[questionId] || [];
    const isMultiSelect = question.multiSelect || false;

    let newAnswers;
    if (isMultiSelect) {
      if (currentAnswers.includes(optionIndex)) {
        newAnswers = currentAnswers.filter((idx) => idx !== optionIndex);
      } else {
        newAnswers = [...currentAnswers, optionIndex];
      }
    } else {
      newAnswers = [optionIndex];
    }

    set((state) => ({
      answers: {
        ...state.answers,
        [questionId]: newAnswers,
      },
    }));
  },

  submitExam: () => set({ isSubmitted: true }),
}));

// ------------------------------------------------------------
// useExamAnswerStore: Hold answers and build submit payload
// ------------------------------------------------------------
export const useExamAnswerStore = create((set, get) => ({
  // Required identifiers
  user_id: '',
  schedule_id: '',
  exam_content_id: '',

  // Track question ids and chosen selections
  question_ids: [], // [question_id, ...]
  answers: {}, // { [question_id]: number } -> chosen_selection (1-5)

  // Initialize exam info and questions
  initExam: ({ user_id, schedule_id, exam_content_id, question_ids }) =>
    set({
      user_id: user_id || '',
      schedule_id: schedule_id || '',
      exam_content_id: exam_content_id || '',
      question_ids: Array.isArray(question_ids) ? question_ids : [],
      answers: {},
    }),

  setScheduleAndContent: ({ schedule_id, exam_content_id }) =>
    set((state) => ({
      schedule_id: schedule_id || state.schedule_id,
      exam_content_id: exam_content_id || state.exam_content_id,
    })),

  // Choose an answer (single selection)
  selectAnswer: (question_id, chosen_selection) => {
    // Ensure chosen_selection is a positive integer (1-based)
    const selection = Number(chosen_selection);
    if (!question_id || !Number.isInteger(selection) || selection < 1) return;
    set((state) => ({
      answers: {
        ...state.answers,
        [question_id]: selection,
      },
    }));
  },

  // Build payload matching backend ExamineeAnswers model
  buildPayload: () => {
    const { user_id, schedule_id, exam_content_id, answers } = get();
    const answersArray = Object.entries(answers).map(([question_id, chosen_selection]) => ({
      question_id,
      chosen_selection,
    }));
    return {
      user_id,
      schedule_id,
      exam_content_id,
      answers: answersArray,
    };
  },

  // After successful submit: notify useExamStore then reset
  afterSubmitAndReset: () => {
    const { schedule_id, exam_content_id } = get();
    try {
      const { recordSubmission } = useExamStore.getState();
      if (recordSubmission && schedule_id && exam_content_id) {
        recordSubmission(schedule_id, exam_content_id);
      }
    } finally {
      // Always reset local state regardless of notification success
      set({
        user_id: '',
        schedule_id: '',
        exam_content_id: '',
        question_ids: [],
        answers: {},
      });
    }
  },
}));

export default useExamStore;
