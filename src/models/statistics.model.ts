import { ObjectId } from "mongodb";

export interface TQuestionsOption {
  _id?: ObjectId;
  value: string;
}

export interface TQuestions {
  _id?: ObjectId;
  title: string;
  question: string;
  answer: boolean;
  type: string;
  options: string[];
  reference: string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
}

export interface TUpdateQuestions {
  title?: string;
  question?: string;
  type?: string;
  options?: string[];
  updatedAt?: Date;
}

export class MQuestions implements Partial<TQuestions> {
  _id?: ObjectId;
  title: string;
  question: string;
  answer: boolean;
  type: string;
  options: string[];
  reference: string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;

  constructor({
    _id = new ObjectId(),
    title,
    question,
    answer,
    type = "",
    options = [],
    reference,
    createdAt = new Date(),
    updatedAt,
    deletedAt,
    deletedBy,
  }: TQuestions) {
    this._id = _id;
    this.title = title;
    this.question = question;
    this.answer = answer;
    this.type = type;
    this.options = options;
    this.reference = reference;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }

  markAsDeleted(deletedBy: ObjectId) {
    this.deletedAt = new Date();
    this.deletedBy = deletedBy;
  }
}
