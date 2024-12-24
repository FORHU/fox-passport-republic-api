/* eslint-disable no-useless-catch */
import CounterRepo from "../repositories/counter.repository";
import { TCounter } from "../models/counter.model";

export default class CounterSvc {
  static async createOrUpdateCounter(data: TCounter) {
    try {
      const insertedId = await CounterRepo.createOrUpdateCounter(data);
      return insertedId;
    } catch (error) {
      throw error;
    }
  }

  static async getCounterByType(type: any) {
    try {
      const counter = await CounterRepo.getCounterByType(type);
      return counter;
    } catch (error) {
      throw error;
    }
  }

  static async generateCounter(type: any) {
    try {
      const counter: any = await CounterSvc.getCounterByType(type);
      counter.count++;
      await CounterSvc.createOrUpdateCounter(counter);
      return counter;
    } catch (error) {
      throw error;
    }
  }
}
