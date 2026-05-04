import { z } from "zod";

export const searchSchema = z.object({
  query: z.object({
    q: z.string().optional(),
    country: z.string().optional(),
    city: z.string().optional(),
    type: z.enum(["event_template", "service", "asset", "venue", "pros"]).optional().default("event_template"),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    sortBy: z.string().optional().default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
    category: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }).superRefine((data, ctx) => {
    if ((data.startDate && !data.endDate) || (!data.startDate && data.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please provide both start and end dates.",
        path: ["startDate"],
      });
    }
  }),
});
