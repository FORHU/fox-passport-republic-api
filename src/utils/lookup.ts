// import { LookupFields } from "../types/common";

interface LookupConfig {
  lookup: {
    from: string;
    localField: string;
    foreignField: string;
    as: string;
  };
  addFields?: any;
}

export const lookupMap = {
  files: (field: string): LookupConfig => ({
    lookup: {
      from: "files",
      localField: field,
      foreignField: "_id",
      as: field,
    },
    addFields: {
      profile_picture: { $ifNull: [`$${field}.path`, null] },
    },
  }),
  organization_members: (field: string): LookupConfig => ({
    lookup: {
      from: "organization-members",
      localField: "_id",
      foreignField: "invited_user_id",
      as: field,
    },
  }),
  user_roles: (field: string): LookupConfig => ({
    lookup: {
      from: "user-roles",
      localField: "user_roles",
      foreignField: "_id",
      as: field,
    },
  }),
  admin_members: (field: string): LookupConfig => ({
    lookup: {
      from: "admin-members",
      localField: "_id",
      foreignField: "invited_user",
      as: field,
    },
  }),
  stripe_account: (field: string): LookupConfig => ({
    lookup: {
      from: "stripe-account",
      localField: "_id",
      foreignField: "user",
      as: field,
    },
    addFields: {
      stripe_account: {
        $cond: {
          if: { $eq: [`$${field}`, null] },
          then: null,
          else: `$${field}`,
        },
      },
    },
  }),
};
