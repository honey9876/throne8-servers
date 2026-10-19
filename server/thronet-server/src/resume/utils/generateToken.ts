import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export const generateToken = (userId: string) => {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };

  return jwt.sign({ userId }, env.JWT_SECRET, options);
};