import { ObjectId } from "mongodb";

export const constructQuery = (params: any) => {
  const { _id, search } = params;
  const query: any = {};

  if (_id) {
    query._id = new ObjectId(_id);
  }

  if (search) {
    query.$text = { $search: search };
  }

  return query;
};
