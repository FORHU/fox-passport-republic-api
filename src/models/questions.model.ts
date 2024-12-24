import { ObjectId } from "mongodb";

// Enum for different space or venue uses
enum VenueUse {
  FOOD_AND_BEVERAGE = "FOOD_AND_BEVERAGE",
  ENTERTAINMENT = "ENTERTAINMENT",
  ACCOMMODATION = "ACCOMMODATION",
}

enum QuestionsType {
  "SPACE" = "SPACE",
  "VENUE" = "VENUE",
}

export interface TQuestionsOption {
  _id?: ObjectId;
  value: string;
}

// Interface for questions
export interface TQuestions {
  _id?: ObjectId;
  question?: string;
  answer?: boolean;
  type?: QuestionsType;
  options?: string[];
  max_capacity?: any;
  reference?: string;
  key?: string;
  createdAt?: Date;
  updatedAt?: Date;
  space_id?: ObjectId;
  venue_id?: ObjectId;
  user: ObjectId;
}

// Interface for updating questions
export interface TUpdateQuestions {
  question?: string;
  type?: QuestionsType;
  options?: string[];
  max_capacity?: any;
  updatedAt?: Date;
  key?: string;
  reference?: string;
  space_id?: ObjectId;
  venue_id?: ObjectId;
  user?: ObjectId;
}

export class MQuestions implements Partial<TQuestions> {
  _id?: ObjectId;
  question?: string;
  answer?: boolean;
  type?: QuestionsType;
  options?: string[];
  max_capacity?: any;
  reference?: string;
  key?: string;
  createdAt?: Date;
  updatedAt?: Date;
  space_id?: ObjectId;
  venue_id?: ObjectId;
  user: ObjectId;

  constructor({
    _id = new ObjectId(),
    question,
    answer,
    type,
    options = [],
    max_capacity = null,
    reference = "",
    key = "",
    space_id,
    venue_id,
    user,
    createdAt = new Date(),
    updatedAt,
  }: TQuestions) {
    this._id = _id;
    this.question = question;
    this.answer = answer;
    this.type = type;
    this.options = options;
    this.max_capacity = max_capacity;
    this.reference = reference;
    this.key = key;
    this.space_id = space_id;
    this.venue_id = venue_id;
    this.user = user;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
