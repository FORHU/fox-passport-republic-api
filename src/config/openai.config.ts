import openAI from "openai";

export const openai = new openAI({
  apiKey: process.env.OPENAI_API_KEY,
});
