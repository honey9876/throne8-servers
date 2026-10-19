import { z } from "zod";

export const analyticsIdSchema =
  z.object({
    id: z.string().min(1),
  });