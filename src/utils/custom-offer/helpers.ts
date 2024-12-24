import { ObjectId } from "mongodb";

export const consructCustomOfferQuery = (params: any) => {
  const { space_id, venue_id, user_id, offer_id, inbox_id, status } = params;
  const query: any = {};
  if (space_id) {
    query["space._id"] = new ObjectId(space_id);
  }

  if (venue_id) {
    query["venue._id"] = new ObjectId(venue_id);
  }

  if (user_id) {
    query["user._id"] = new ObjectId(user_id);
  }

  if (offer_id) {
    query._id = new ObjectId(offer_id);
  }

  if (inbox_id) {
    query.inbox = new ObjectId(inbox_id);
  }

  if (status) {
    query.status = status;
  }

  query["deletedAt"] = { $eq: null };
  query["status"] = { $ne: "DECLINED" };

  return query;
};
