import { ObjectId } from "mongodb";

export const constructQuery = (params: any) => {
  const { _id, search, target, user, viewed, active_only, target_device } = params;
  const query: any = { deletedAt: null };

  const _target = ["ALL", "VENUE_OWNERS_ONLY", "USERS_ONLY"];
  const targetDevice = ["ALL", "WEB_ONLY", "MOBILE_ONLY"];

  if (_id) query._id = new ObjectId(_id);

  if (search) query.$text = { $search: search };

  if (target) query.target = target !== "ALL" ? { $in: target.split(",").map((t: string) => t.trim()) } : { $in: _target };

  if (viewed) query.viewed = viewed === "true" || viewed === true ? true : false;

  if (active_only === "true" || active_only === true) query.active = true;

  if (target_device)
    query.target_device = target_device !== "ALL" ? { $in: target_device.split(",").map((t: string) => t.trim()) } : { $in: targetDevice };

  query["announcement_log.user"] = new ObjectId(user);

  return query;
};
