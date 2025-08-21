import { create } from 'zustand';

const useExamStore = create((set, get) => ({
  examDetails: {
    title: '',
    period: '',
    startTime: null,
    endTime: null,
  },
  questions: [],
  answers: {}, // { questionId: [selectedOptionIndex1, selectedOptionIndex2] }
  isSubmitted: false,

  setExamData: (data) => set({
    examDetails: {
      title: data.title,
      period: data.period,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
    },
    questions: data.questions,
    answers: data.questions.reduce((acc, q) => {
      acc[q.id] = [];
      return acc;
    }, {}),
  }),

  selectAnswer: (questionId, optionIndex) => {
    const { questions, answers } = get();
    const question = questions.find(q => q.id === questionId);
    if (!question) return;

    const currentAnswers = answers[questionId] || [];
    const isMultiSelect = question.multiSelect || false; // Assuming a property indicates multi-select

    let newAnswers;
    if (isMultiSelect) {
      // For multi-select, toggle the option
      if (currentAnswers.includes(optionIndex)) {
        newAnswers = currentAnswers.filter(idx => idx !== optionIndex);
      } else {
        newAnswers = [...currentAnswers, optionIndex];
      }
    } else {
      // For single-select, replace the answer
      newAnswers = [optionIndex];
    }

    set(state => ({
      answers: {
        ...state.answers,
        [questionId]: newAnswers,
      },
    }));
  },

  submitExam: () => set({ isSubmitted: true }),
}));

export default useExamStore;
