import { ObjectId } from "mongodb";
import { TQuestions } from "../models/questions.model";

import QuestionsRepo from "../repositories/question.repository";

export default class QuestionSvc {
  static createQuestions(data: TQuestions[]) {
    return QuestionsRepo.createQuestions(data);
  }

  static getTotalCountQuestions(query: TQuestions) {
    return QuestionsRepo.countQuestions(query);
  }

  static getQuestions(query: TQuestions, skip: number, limit: number) {
    return QuestionsRepo.getQuestions(query, skip, limit);
  }

  static async deleteQuestions(ids: ObjectId[]) {
    return QuestionsRepo.deleteQuestions(ids);
  }
}
