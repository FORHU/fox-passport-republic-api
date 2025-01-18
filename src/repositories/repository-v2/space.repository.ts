import { getDB } from "../../utils/mongo";
import { Filter } from "mongodb";
import { TSpace } from "../../models/space.model";
import { createPaginationStages, createMatchStages } from "../../utils/pipelines/common.pipelines";
import {
  CAPACITY_LAYOUT_LOOKUP,
  FEATURES_LOOKUP,
  FLOOR_PLAN_LOOKUP,
  GET_SPACES_PROJECT,
  KEYWORDS_LOOKUP,
  SPACE_PHOTO_LOOKUP,
  USER_LOOKUP,
  USER_UNWIND,
  VENUE_LOOKUP,
  VENUE_PHOTO_LOOKUP,
  VENUE_UNWIND,
} from "../../utils/pipelines/space.pipelines";

export default class SpaceRepository {
  static collection() {
    return getDB().collection("spaces");
  }

  static getSpaces(query: any, limit: number, skip: number) {
    return this.collection()
      .aggregate([
        USER_LOOKUP,
        USER_UNWIND,
        VENUE_LOOKUP,
        VENUE_UNWIND,
        KEYWORDS_LOOKUP,
        SPACE_PHOTO_LOOKUP,
        VENUE_PHOTO_LOOKUP,
        CAPACITY_LAYOUT_LOOKUP,
        GET_SPACES_PROJECT,
        FEATURES_LOOKUP,
        FLOOR_PLAN_LOOKUP,
        ...createMatchStages(query),
        ...createPaginationStages(skip, limit),
      ])
      .toArray();
  }

  static getSpace(query: Filter<TSpace>) {
    return this.collection().findOne(query);
  }
}
