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

// RFC 5322 is overkill for a contact form; this rejects the obvious
// garbage (missing @, no domain dot, whitespace) without being so strict
// that it bounces real addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CONTACT_LIMITS = {
  name: 100,
  email: 254, // RFC 5321 max mailbox length
  subject: 150,
  message: 3000
};

// Validates and returns a cleaned { name, email, subject, message } object,
// or throws an Error describing the first problem found.
export function validateContact(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("payload must be an object");
  }

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) throw new Error("name is required");
  if (name.length > CONTACT_LIMITS.name) throw new Error("name is too long");

  const email = typeof raw.email === "string" ? raw.email.trim() : "";
  if (!email) throw new Error("email is required");
  if (email.length > CONTACT_LIMITS.email || !EMAIL_RE.test(email)) {
    throw new Error("email is invalid");
  }

  const subject = typeof raw.subject === "string" ? raw.subject.trim() : "";
  if (subject.length > CONTACT_LIMITS.subject) throw new Error("subject is too long");

  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (!message) throw new Error("message is required");
  if (message.length > CONTACT_LIMITS.message) throw new Error("message is too long");

  return { name, email, subject, message };
}
