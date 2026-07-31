// Mirrors the SCHEMA in survey.html — kept separate and server-side so
// client-supplied answers can be validated against the real set of
// allowed questions/options rather than trusted as-is.
export const SCHEMA = [
  {
    id: "p1",
    required: true,
    questions: [
      { id: "job_searching", type: "radio", options: ["Actively", "Casually looking", "Not right now"] },
      { id: "new_methods", type: "radio", options: ["Yes", "Depends what they are", "No"] },
      { id: "computer_skill", type: "radio", options: ["Basic", "Comfortable", "Advanced", "I build things"] }
    ]
  },
  {
    id: "p2",
    required: true,
    questions: [
      { id: "media_work", type: "checkbox", options: ["Video editing", "Content creation", "Managing professional social accounts", "None of these"] },
      { id: "wifi_security", type: "radio", options: ["Yes", "Curious, know nothing", "No"] },
      { id: "test_platform", type: "radio", options: ["Yes", "Maybe", "No"] }
    ]
  },
  {
    id: "p3",
    required: false,
    questions: [
      { id: "ai_ethics", type: "textarea", maxLength: 2000 },
      { id: "ai_professional", type: "radio", options: ["Already do", "Yes", "Reluctantly", "No"] },
      { id: "security_domains", type: "checkbox", options: ["Network", "Cloud", "API", "Web app", "None of these"] },
      { id: "dmv", type: "radio", options: ["Yes", "Nearby", "No"] },
      { id: "relocate", type: "radio", options: ["Yes", "For the right offer", "No"] }
    ]
  }
];

export const ALL_QUESTIONS = SCHEMA.flatMap(p => p.questions.map(q => ({ ...q, phaseId: p.id })));
const QUESTION_MAP = new Map(ALL_QUESTIONS.map(q => [q.id, q]));

// Validates and returns a cleaned { [questionId]: value } object, or throws
// an Error with a human-readable message describing the first problem found.
export function validateAnswers(rawAnswers) {
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
    throw new Error("answers must be an object");
  }

  const cleaned = {};

  for (const [key, value] of Object.entries(rawAnswers)) {
    const q = QUESTION_MAP.get(key);
    if (!q) throw new Error(`unknown question id: ${key}`);

    if (q.type === "radio") {
      if (typeof value !== "string" || !q.options.includes(value)) {
        throw new Error(`invalid value for ${key}`);
      }
      cleaned[key] = value;
    } else if (q.type === "checkbox") {
      if (!Array.isArray(value) || value.length === 0 || value.length > q.options.length) {
        throw new Error(`invalid value for ${key}`);
      }
      for (const v of value) {
        if (typeof v !== "string" || !q.options.includes(v)) {
          throw new Error(`invalid option in ${key}`);
        }
      }
      if (new Set(value).size !== value.length) throw new Error(`duplicate options in ${key}`);
      cleaned[key] = value;
    } else if (q.type === "textarea") {
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`invalid value for ${key}`);
      }
      const trimmed = value.trim();
      if (trimmed.length > (q.maxLength || 2000)) throw new Error(`${key} is too long`);
      cleaned[key] = trimmed;
    }
  }

  // Every required-phase question must be present.
  for (const phase of SCHEMA) {
    if (!phase.required) continue;
    for (const q of phase.questions) {
      if (!(q.id in cleaned)) throw new Error(`missing required answer: ${q.id}`);
    }
  }

  return cleaned;
}
