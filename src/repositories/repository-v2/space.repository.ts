import { getDB } from "../../utils/mongo";
import {
  USER_LOOKUP,
  USER_UNWIND,
  VENUE_LOOKUP,
  VENUE_UNWIND,
  SPACE_PHOTO_LOOKUP,
  GET_SPACES_PROJECT,
  createPaginationStages,
} from "../../utils/db-constant/space.constant";

export default class SpaceRepository {
  static collection() {
    return getDB().collection("spaces");
  }

  static getSpaces(query: any, limit: number, skip: number) {
    return this.collection()
      .aggregate([
        {
          $match: query,
        },
        USER_LOOKUP,
        USER_UNWIND,
        VENUE_LOOKUP,
        VENUE_UNWIND,
        SPACE_PHOTO_LOOKUP,
        GET_SPACES_PROJECT,
        ...createPaginationStages(skip, limit),
      ])
      .toArray();
  }
}
