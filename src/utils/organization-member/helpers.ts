import { ObjectId } from "mongodb";

export const constructOrgQuery = (params: any, user: any) => {
  const query: any = {};

  const { inviter_user_id, venues, status, assigned_roles, search } = params;

  if (user?.role !== "ADMIN") {
    query.organization = new ObjectId(user?.organization);
  }

  if (inviter_user_id) {
    query.inviter_user_id = new ObjectId(inviter_user_id);
  }

  if (venues) {
    query.venues = venues;
  }

  if (search) {
    const trimmedSearch = search.trim();
    const searchRegex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    query["$or"] = [
      { "invited_user.phone_number": { $regex: searchRegex } },
      { "invited_user.email": { $regex: searchRegex } },
      {
        $expr: {
          $regexMatch: {
            input: {
              $concat: [
                {
                  $cond: {
                    if: { $isArray: "$invited_user.first_name" },
                    then: { $arrayElemAt: ["$invited_user.first_name", 0] },
                    else: "$invited_user.first_name",
                  },
                },
                " ",
                {
                  $cond: {
                    if: { $isArray: "$invited_user.last_name" },
                    then: { $arrayElemAt: ["$invited_user.last_name", 0] },
                    else: "$invited_user.last_name",
                  },
                },
              ],
            },
            regex: searchRegex,
          },
        },
      },
      {
        $expr: {
          $regexMatch: {
            input: {
              $concat: [
                {
                  $cond: {
                    if: { $isArray: "$invited_user.last_name" },
                    then: { $arrayElemAt: ["$invited_user.last_name", 0] },
                    else: "$invited_user.last_name",
                  },
                },
                " ",
                {
                  $cond: {
                    if: { $isArray: "$invited_user.first_name" },
                    then: { $arrayElemAt: ["$invited_user.first_name", 0] },
                    else: "$invited_user.first_name",
                  },
                },
              ],
            },
            regex: searchRegex,
          },
        },
      },
    ];
  }

  if (status) {
    query.status = status;
  }

  if (assigned_roles) {
    const roleArray = assigned_roles.split(",").map((r: any) => Number(r.trim()));
    query.assigned_roles = { $in: roleArray };
  }

  query["deletedAt"] = { $eq: null };

  return query;
};
