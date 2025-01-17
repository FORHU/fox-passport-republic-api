import { getDB } from "../../utils/mongo";

export default class SpaceRepository {
  static collection() {
    return getDB().collection("spaces");
  }
}
