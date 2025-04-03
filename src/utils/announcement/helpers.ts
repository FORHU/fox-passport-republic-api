import { ObjectId } from "mongodb";

export const constructQuery = (params: any) => {
  const { _id, search, target } = params;
  const query: any = { deletedAt: null };

  if (_id) {
    query._id = new ObjectId(_id);
  }

  if (search) {
    query.$text = { $search: search };
  }

  if (target) {
    query.target = { $in: target.split(",").map((t: string) => t.trim()) };
  }

  return query;
};
