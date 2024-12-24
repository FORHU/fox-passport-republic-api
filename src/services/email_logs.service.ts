/* eslint-disable no-useless-catch */

import EmailLogsRepo from "../repositories/email_logs.repository";

export default class EmailLogsService {
  static async createEmailLog(data: any) {
    try {
      const result = await EmailLogsRepo.createEmailLog(data);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getEmailLogs(query: any, skip: number, limit: number) {
    try {
      const result = await EmailLogsRepo.getEmailLogs(query, skip, limit);
      return result;
    } catch (error) {
      throw error;
    }
  }
}
