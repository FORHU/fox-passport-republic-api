import { logger } from "./logger";

export const generateResponse = ({ res, data, message, code, status_code, description, status }: any) => {
  return res.status(status_code || 200).send({
    message,
    description,
    code,
    data,
    status,
  });
};

export const handleResponse = (res: any, data: any, message: any) => {
  logger.log({
    level: "info",
    message,
    timestamp: new Date().toISOString(),
    service: "venue4use-api",
  });
  return generateResponse({
    res,
    data,
    message,
    status: true,
    status_code: 200,
  });
};

export const handleErrorResponse = (res: any, error: any, fallback: any, status_code?: any, message?: string, description?: string) => {
  logger.log({
    level: "error",
    message,
    timestamp: new Date().toISOString(),
    service: "venue4use-api",
    error: error?.message || "Server not responding",
  });
  return generateResponse({
    res,
    message: message || "Server not responding",
    code: error?.code || fallback?.code || "ERR_SERVER_NOT_RESPONDING",
    description: description || error?.message || "Server not responding",
    status_code: status_code || 500,
  });
};
