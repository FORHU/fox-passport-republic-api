/* eslint-disable indent */
import { ObjectId } from "mongodb";
import { user_role } from "../../models/user.model";

export const constructVenueQuery = (params: any, user: any, venues?: any) => {
  const { user_id, venue_id, keywords, categories, status, venue_name, tenant_code } = params;
  const query: any = {};

  if (venue_name) {
    const words = venue_name
      .split(" ")
      .map((word: string) => word.trim())
      .filter(Boolean);
    const regexPattern = new RegExp(words.map((word: string) => `(?=.*${word})`).join(""), "i");

    query.$or = [{ name: { $regex: regexPattern } }, { spaces: { $elemMatch: { name: { $regex: regexPattern } } } }];
  }

  if (user_id) {
    query.user = new ObjectId(user_id as string);
  }

  if (venue_id) {
    query._id = new ObjectId(venue_id as string);
  }

  if (keywords) {
    const keywordArray = keywords.split(",").map((keyword: string) => keyword.trim());
    query["matched_keywords.keyword"] = { $in: keywordArray.map((keyword: string | RegExp) => new RegExp(keyword, "i")) };
  }

  if (categories) {
    const categoriesRegex = categories.split(",").map((category: string) => new RegExp(category.trim(), "i"));
    query["matched_keywords.categories"] = { $elemMatch: { $in: categoriesRegex } };
  }

  if (status) {
    const statusStrings = status as string;
    const statusArray = statusStrings.split(",");
    if (!statusStrings.includes("ALL")) {
      query.status = { $in: statusArray };
    }
  }

  /**
   * Special case condition, if user role is not a ADMIN or SUPER ADMIN ROLE
   * Will only display its venue organization
   */

  if (venues) {
    if (Array.isArray(venues)) {
      query._id = { $in: venues.map((id: string) => new ObjectId(id as string)) };
    } else if (typeof venues === "object") {
      Object.assign(query, venues);
    }
  }

  if (tenant_code) {
    query["address"] = {
      country: tenant_code,
    };
  }

  return query;
};

export const extractAddressComponents = (address: string) => {
  try {
    const parts = address.split(",");

    const street = parts[0].trim();
    const city = parts[1].trim();
    const postal_code = parts[2].trim();

    const state = city;
    const country = extractCountryFromAddress(address);

    return {
      street,
      city,
      state,
      country,
      postal_code,
    };
  } catch (err) {
    return false;
  }
};

export const extractCountryFromAddress = (address: string) => {
  let country = null;

  switch (true) {
    case address.includes("Singapore"):
      country = "SG";
      break;
    case address.includes("United States"):
      country = "US";
      break;
    case address.includes("Philippines"):
      country = "PH";
      break;
    case address.includes("Malaysia"):
      country = "MY";
      break;
    case address.includes("Thailand"):
      country = "TH";
      break;
    case address.includes("Taiwan"):
      country = "TW";
      break;
    case address.includes("Indonesia"):
      country = "ID";
      break;
    default:
      country = "SG";
  }

  return country;
};

const roleDisplayName: { [key in user_role]: string } = {
  [user_role.SUPER_ADMIN]: "Super Admin",
  [user_role.ADMIN]: "Admin",
  [user_role.USER]: "User",
  [user_role.VENUE_OWNER]: "Venue Owner",
  [user_role.VENUE_LISTER]: "Venue Lister",
  [user_role.EVENT_MANAGER]: "Event Manager",
  [user_role.FINANCE_AND_ACCOUNTING]: "Finance and Accounting",
};

export const getRoleDisplayName = (role: user_role): string => {
  return roleDisplayName[role] || "Unknown Role";
};
