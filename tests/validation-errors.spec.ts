import { describe, expect, it, vi } from "vitest";
import Joi from "joi";
import multer from "multer";
import { createErrorHandler } from "../src/middleware/error.middleware";
import { postJoi } from "../src/utils/limits";
import {
  END_BEFORE_START_MESSAGE,
  VALIDATE_ALL,
  endAfter,
  validationPayload,
} from "../src/utils/validation";

const check = (schema: Joi.ObjectSchema, value: unknown) => {
  const { error } = schema.validate(value, VALIDATE_ALL);
  return error ? validationPayload(error) : null;
};

describe("validationPayload", () => {
  const post = Joi.object({ content: postJoi().required() });

  it("says what to fix when a post is over 5,000 characters", () => {
    const result = check(post, { content: "a".repeat(5001) });

    expect(result?.message).toBe(
      "Posts can be up to 5,000 characters. Shorten it and try again.",
    );
    expect(result?.code).toBe("VALIDATION");
    expect(result?.fields).toEqual([
      { field: "content", message: result?.message },
    ]);
  });

  it("rewrites Joi's default text, which quotes field names", () => {
    const schema = Joi.object({
      title: Joi.string().max(5).required(),
      count: Joi.number().min(1).required(),
      endDate: Joi.date().min(Joi.ref("startDate")),
      startDate: Joi.date(),
    });
    const result = check(schema, {
      count: 0,
      endDate: "2026-01-01",
      startDate: "2026-02-01",
    });

    const text = JSON.stringify(result);
    expect(text).not.toMatch(/ref:|must be (greater|less)|"title" /);
    expect(result?.fields.map((f) => f.field).sort()).toEqual([
      "count",
      "endDate",
      "title",
    ]);
  });

  it("keeps a message written for the person", () => {
    const schema = Joi.object({ a: Joi.string().required() }).messages({
      "any.required": "Fill this in.",
    });

    expect(check(schema, {})?.message).toBe("Fill this in.");
  });
});

describe("endAfter", () => {
  const schema = Joi.object({
    startDatetime: Joi.date().optional(),
    startAt: Joi.date().optional(),
    endDatetime: endAfter(["startDatetime", "startAt"]).optional(),
  });

  it("rejects an end that is not after the start", () => {
    const result = check(schema, {
      startDatetime: "2026-08-01T10:00:00Z",
      endDatetime: "2026-08-01T09:00:00Z",
    });

    expect(result?.message).toBe(END_BEFORE_START_MESSAGE);
    expect(result?.fields[0].field).toBe("endDatetime");
  });

  it("uses the other start key and accepts a later end or no start", () => {
    expect(
      check(schema, { startAt: "2026-08-01", endDatetime: "2026-08-02" }),
    ).toBeNull();
    expect(check(schema, { endDatetime: "2026-08-02" })).toBeNull();
  });
});

describe("global handler: uploads and logging", () => {
  function run(isDev: boolean, err: unknown) {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    log.mockClear();
    const req = {
      method: "POST",
      originalUrl: "/api/v1/files",
      user: { userId: "u1" },
    };
    createErrorHandler(isDev)(err, req as never, res as never, vi.fn());
    return {
      status: res.status.mock.calls[0][0],
      body: res.json.mock.calls[0][0],
      log: log.mock.calls[0],
    };
  }

  it("answers an oversized upload with 413 and a plain sentence", () => {
    const { status, body } = run(
      false,
      new multer.MulterError("LIMIT_FILE_SIZE"),
    );

    expect(status).toBe(413);
    expect(body.message).toMatch(/too large/);
    expect(body.code).toBe("LIMIT_FILE_SIZE");
  });

  it("logs the stack and request, but never sends them in production", () => {
    const { body, log } = run(false, new Error("db password is hunter2"));

    expect(body.message).toBe("Something went wrong");
    expect(body.stack).toBeUndefined();
    expect(log[1]).toMatchObject({
      status: 500,
      method: "POST",
      path: "/api/v1/files",
      userId: "u1",
      message: "db password is hunter2",
    });
    expect(String((log[1] as { stack: string }).stack)).toContain("Error");
  });
});
