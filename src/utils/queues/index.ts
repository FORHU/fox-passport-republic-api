import Bull from "bull";

import { REDIS_HOST, REDIS_PASSWORD, REDIS_PORT } from "../../config";

const bull_queues = {};

const queueOptions = {
  redis: {
    port: REDIS_PORT,
    host: REDIS_HOST,
    password: REDIS_PASSWORD,
  },
};

export const createQueue = (queueName: string) => {
  const newQueue = new Bull(queueName, queueOptions);
  // @ts-ignore
  bull_queues[queueName] = newQueue;
  return newQueue;
};

export { bull_queues };
