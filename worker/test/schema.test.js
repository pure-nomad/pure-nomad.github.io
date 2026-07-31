import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAnswers, validateContact, CONTACT_LIMITS } from "../src/schema.js";

// --- survey: validateAnswers -------------------------------------------

test("survey: accepts a valid full response", () => {
  const cleaned = validateAnswers({
    job_searching: "Actively",
    new_methods: "Yes",
    computer_skill: "Advanced",
    media_work: ["Video editing", "Content creation"],
    wifi_security: "Yes",
    test_platform: "Yes"
  });
  assert.equal(cleaned.job_searching, "Actively");
  assert.deepEqual(cleaned.media_work, ["Video editing", "Content creation"]);
});

test("survey: rejects missing required answers", () => {
  assert.throws(() => validateAnswers({ job_searching: "Actively" }), /missing required answer/);
});

test("survey: rejects unknown question ids", () => {
  assert.throws(() => validateAnswers({ not_a_real_question: "x" }), /unknown question id/);
});

test("survey: rejects radio values outside the option set", () => {
  assert.throws(
    () => validateAnswers({
      job_searching: "Actively", new_methods: "Yes", computer_skill: "Advanced",
      media_work: ["Video editing"], wifi_security: "Yes", test_platform: "Definitely not an option"
    }),
    /invalid value for test_platform/
  );
});

test("survey: rejects empty checkbox arrays", () => {
  assert.throws(
    () => validateAnswers({
      job_searching: "Actively", new_methods: "Yes", computer_skill: "Advanced",
      media_work: [], wifi_security: "Yes", test_platform: "Yes"
    }),
    /invalid value for media_work/
  );
});

test("survey: rejects duplicate checkbox options", () => {
  assert.throws(
    () => validateAnswers({
      job_searching: "Actively", new_methods: "Yes", computer_skill: "Advanced",
      media_work: ["Video editing", "Video editing"], wifi_security: "Yes", test_platform: "Yes"
    }),
    /duplicate options in media_work/
  );
});

test("survey: rejects an over-length textarea", () => {
  assert.throws(
    () => validateAnswers({
      job_searching: "Actively", new_methods: "Yes", computer_skill: "Advanced",
      media_work: ["Video editing"], wifi_security: "Yes", test_platform: "Yes",
      ai_ethics: "x".repeat(2001)
    }),
    /ai_ethics is too long/
  );
});

test("survey: rejects non-object payloads", () => {
  assert.throws(() => validateAnswers(null), /answers must be an object/);
  assert.throws(() => validateAnswers(["nope"]), /answers must be an object/);
});

// --- contact: validateContact -------------------------------------------

test("contact: accepts a minimal valid message", () => {
  const cleaned = validateContact({
    name: "Ada Lovelace",
    email: "ada@example.com",
    message: "Interested in the platform."
  });
  assert.equal(cleaned.name, "Ada Lovelace");
  assert.equal(cleaned.email, "ada@example.com");
  assert.equal(cleaned.subject, "");
});

test("contact: trims whitespace on all fields", () => {
  const cleaned = validateContact({
    name: "  Ada  ", email: "  ada@example.com  ", subject: "  Hi  ", message: "  hello  "
  });
  assert.equal(cleaned.name, "Ada");
  assert.equal(cleaned.email, "ada@example.com");
  assert.equal(cleaned.subject, "Hi");
  assert.equal(cleaned.message, "hello");
});

test("contact: rejects a missing name", () => {
  assert.throws(() => validateContact({ email: "a@b.com", message: "hi" }), /name is required/);
});

test("contact: rejects malformed emails", () => {
  for (const bad of ["not-an-email", "missing-domain@", "@no-local.com", "has space@example.com"]) {
    assert.throws(() => validateContact({ name: "A", email: bad, message: "hi" }), /email is invalid/);
  }
});

test("contact: rejects a missing message", () => {
  assert.throws(() => validateContact({ name: "A", email: "a@b.com", message: "   " }), /message is required/);
});

test("contact: rejects fields over their length limits", () => {
  assert.throws(
    () => validateContact({ name: "x".repeat(CONTACT_LIMITS.name + 1), email: "a@b.com", message: "hi" }),
    /name is too long/
  );
  assert.throws(
    () => validateContact({ name: "A", email: "a@b.com", message: "x".repeat(CONTACT_LIMITS.message + 1) }),
    /message is too long/
  );
  assert.throws(
    () => validateContact({ name: "A", email: "a@b.com", subject: "x".repeat(CONTACT_LIMITS.subject + 1), message: "hi" }),
    /subject is too long/
  );
});

test("contact: rejects non-object payloads", () => {
  assert.throws(() => validateContact(null), /payload must be an object/);
  assert.throws(() => validateContact("hi"), /payload must be an object/);
});
