import { Request, Response, NextFunction } from "express";
import { z } from "zod";

export const validateRequest =
  (schema: z.ZodSchema<any>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Re-assign the PARSED (and therefore stripped/coerced) body back
      // onto the request. Without this, Zod validates a copy of the data
      // but the original, unstripped req.body still flows downstream —
      // letting a client smuggle extra fields (e.g. "status": "completed")
      // straight into a mongoose document.
      if (parsed?.body !== undefined) {
        req.body = parsed.body;
      }

      return next();
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: "Validation Error",
        errors: error.errors,
      });
    }
  };
