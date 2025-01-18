import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { ObjectId } from "mongodb";

import { verifyObjectId } from "../helpers";
dayjs.extend(customParseFormat);

export const createRegexPatterns = (input: string) => {
  return input.split(",").map((item: string) => new RegExp(item.trim(), "i"));
};

export const constructQuery = (params: any, startTime?: any, endTime?: any, filteredSpaces?: string[], mostPopularIds?: any) => {
  const {
    user_id,
    space_id,
    venue_id,
    keywords,
    categories,
    total_guest,
    location,
    min_price,
    max_price,
    status,
    capacity_layout,
    representation,
    age_restriction,
    min_age_requirement,
    enforcement_time,
    city,
    state,
    foods_and_beverages,
    menu_offer,
    cancellation_flexibility,
    facilities,
    allow_events,
    accessibility_features,
    parking_and_accommodation,
    open_days,
    start_date,
    tenant_code,
  } = params;
  const query: any = {};
  const date = dayjs(start_date);
  const dayOfWeek = date.format("dddd").toUpperCase();

  const addOrCondition = (key: string, values: string) => {
    const valueArray = values.split(",").map((value) => value.trim());

    query["$and"] = query["$and"] || [];
    query["$and"].push({
      [key]: {
        $all: valueArray.map((question) => ({
          $elemMatch: {
            question: question,
            answer: true,
          },
        })),
      },
    });
  };

  if (mostPopularIds) {
    query._id = { $in: mostPopularIds.map((item: any) => new ObjectId(item._id)) };
  }

  // if (location) {
  //   const locationArray = location.split(",").map((location: any) => location.trim());
  //   query["venue.address.country"] = { $in: locationArray };
  // }

  if (tenant_code) {
    query["venue.tenant"] = tenant_code;
  } else if (location) {
    const locationArray = location.split(",").map((loc: any) => loc.trim());
    query["venue.address.country"] = { $in: locationArray };
  }

  if (filteredSpaces || space_id) {
    const conditions: any = {};

    if (filteredSpaces && filteredSpaces.length > 0) {
      const filteredSpaceIds = filteredSpaces.map((id: string) => new ObjectId(id));
      conditions.$nin = filteredSpaceIds;
    }

    if (space_id) {
      const spaceObjectId = verifyObjectId(space_id);
      conditions.$in = [spaceObjectId];
    }

    if (conditions.$nin && conditions.$in) {
      query._id = {
        $nin: conditions.$nin,
        $in: conditions.$in.filter((id: any) => !conditions.$nin.includes(id)),
      };
    } else if (conditions.$nin) {
      query._id = { $nin: conditions.$nin };
    } else if (conditions.$in) {
      query._id = { $in: conditions.$in };
    }
  }

  if (total_guest && !capacity_layout) {
    query["guest_capacity.maximum"] = { $gte: parseInt(total_guest) };
  }

  if (capacity_layout && total_guest) {
    query["capacity_layout"] = {
      $elemMatch: {
        question: capacity_layout,
        answer: true,
        max_capacity: { $gte: Number(total_guest) || 0 },
      },
    };
  }

  if (open_days) {
    const daysArray = open_days.split(",");
    query["pricing.hire_fee.days"] = {
      $elemMatch: { name: { $in: daysArray } },
    };
  }

  if (cancellation_flexibility === "true") {
    query["venue.cancellation_policy.policy.no_cancellation"] = false;
  }

  if (accessibility_features) {
    const featuresArray: string[] =
      typeof accessibility_features === "string" ? accessibility_features.split(",").map((feature) => feature.trim()) : [];

    query["$and"] = query["$and"] || [];

    query["features"] = {
      $all: featuresArray.map((feature: string) => ({
        $elemMatch: {
          question: feature,
          answer: true,
        },
      })),
    };
  }

  if (parking_and_accommodation) {
    const parkingAccommodationArray: string[] =
      typeof parking_and_accommodation === "string"
        ? parking_and_accommodation.split(",").map((parking_accommodation) => parking_accommodation.trim())
        : [];

    query["$and"] = query["$and"] || [];

    query["venue.venue_details"] = {
      $all: parkingAccommodationArray.map((parking_accommodation: string) => ({
        $elemMatch: {
          question: parking_accommodation,
          answer: true,
        },
      })),
    };
  }

  if (user_id) query._user = new ObjectId(user_id);

  if (venue_id) query["venue._id"] = new ObjectId(venue_id);
  if (age_restriction === "true") query["venue.age_restriction.answer"] = true;
  if (min_age_requirement) query["venue.age_restriction.min_age_requirement"] = min_age_requirement;
  if (enforcement_time) query["venue.age_restriction.enforcement_time"] = enforcement_time;
  if (city) query["venue.address.city"] = { $regex: new RegExp(city, "i") };
  if (state) query["venue.address.state"] = { $regex: new RegExp(state, "i") };

  // Handling keywords and categories
  if (keywords) {
    query["keywords.keyword"] = { $in: createRegexPatterns(keywords) };
  }

  if (categories) {
    query["keywords.categories"] = { $elemMatch: { $in: createRegexPatterns(categories) } };
  }

  query["$and"] = [];
  if (min_price && max_price && !start_date) {
    const parsedMinPrice = parseInt(min_price);
    const parsedMaxPrice = parseInt(max_price);
    const priceQuery = { $gte: parsedMinPrice, $lte: parsedMaxPrice };

    if (!query.$and) {
      query.$and = [];
    }

    query.$and.push({
      $or: [
        {
          "pricing.selected_pricing": "HIRE_FEE",
          "pricing.hire_fee.days": {
            $elemMatch: {
              $or: [{ "slots.rate": priceQuery }, { full_day_rate: priceQuery }],
            },
          },
        },
        {
          "pricing.selected_pricing": "CUSTOM_PRICE",
          "pricing.custom_price.prices": {
            $elemMatch: {
              price: priceQuery,
            },
          },
        },
      ],
    });
  }

  if (min_price && max_price && start_date) {
    const parsedMinPrice = parseInt(min_price);
    const parsedMaxPrice = parseInt(max_price);
    const priceQuery = { $gte: parsedMinPrice, $lte: parsedMaxPrice };

    if (!query.$and) {
      query.$and = [];
    }

    query.$and.push({
      $or: [
        {
          "pricing.selected_pricing": "HIRE_FEE",
          "pricing.hire_fee.days": {
            $elemMatch: {
              name: dayOfWeek,
              $or: [{ "slots.rate": priceQuery }, { full_day_rate: priceQuery }],
            },
          },
        },
        {
          "pricing.selected_pricing": "CUSTOM_PRICE",
          "pricing.custom_price.prices": {
            $elemMatch: {
              weekdays: { $in: [dayOfWeek] },
              price: priceQuery,
            },
          },
        },
      ],
    });
  }

  if (start_date) {
    query["$or"] = [];

    if (startTime && endTime) {
      query["$or"].push({
        "pricing.selected_pricing": "HIRE_FEE",
        "pricing.hire_fee.days": {
          $elemMatch: {
            name: dayOfWeek,
            $and: [{ "slots.start": { $lte: startTime } }, { "slots.end": { $gte: endTime } }],
          },
        },
      });

      query["$or"].push({
        "pricing.selected_pricing": "CUSTOM_PRICE",
        "pricing.custom_price.prices": {
          $elemMatch: {
            weekdays: dayOfWeek,
            $and: [{ "time.from": { $lte: startTime } }, { "time.to": { $gte: endTime } }],
          },
        },
      });
    } else {
      if (startTime) {
        query["$or"].push({
          "pricing.selected_pricing": "HIRE_FEE",
          "pricing.hire_fee.days": {
            $elemMatch: {
              name: dayOfWeek,
              $and: [{ "slots.start": { $lte: startTime } }, { "slots.end": { $gte: startTime } }],
            },
          },
        });

        query["$or"].push({
          "pricing.selected_pricing": "CUSTOM_PRICE",
          "pricing.custom_price.prices": {
            $elemMatch: {
              weekdays: dayOfWeek,
              $and: [{ "time.from": { $lte: startTime } }, { "time.to": { $gte: startTime } }],
            },
          },
        });
      }

      if (endTime) {
        query["$or"].push({
          "pricing.selected_pricing": "HIRE_FEE",
          "pricing.hire_fee.days": {
            $elemMatch: {
              name: dayOfWeek,
              $and: [{ "slots.start": { $lte: endTime } }, { "slots.end": { $gte: endTime } }],
            },
          },
        });

        query["$or"].push({
          "pricing.selected_pricing": "CUSTOM_PRICE",
          "pricing.custom_price.prices": {
            $elemMatch: {
              weekdays: dayOfWeek,
              $and: [{ "time.from": { $lte: endTime } }, { "time.to": { $gte: endTime } }],
            },
          },
        });
      }

      if (!startTime && !endTime) {
        query["$or"].push({
          "pricing.selected_pricing": "HIRE_FEE",
          "pricing.hire_fee.days": {
            $elemMatch: {
              name: dayOfWeek,
            },
          },
        });

        query["$or"].push({
          "pricing.selected_pricing": "CUSTOM_PRICE",
          "pricing.custom_price.prices": {
            $elemMatch: {
              weekdays: dayOfWeek,
            },
          },
        });
      }
    }
  } else if (startTime || endTime) {
    query["$or"] = [];

    if (startTime && endTime) {
      query["$or"].push({
        "pricing.selected_pricing": "HIRE_FEE",
        "pricing.hire_fee.days": {
          $elemMatch: {
            $and: [{ "slots.start": { $lte: startTime } }, { "slots.end": { $gte: endTime } }],
          },
        },
      });

      query["$or"].push({
        "pricing.selected_pricing": "CUSTOM_PRICE",
        "pricing.custom_price.prices": {
          $elemMatch: {
            $and: [{ "time.from": { $lte: startTime } }, { "time.to": { $gte: endTime } }],
          },
        },
      });
    } else {
      if (startTime) {
        query["$or"].push({
          "pricing.selected_pricing": "HIRE_FEE",
          "pricing.hire_fee.days": {
            $elemMatch: {
              $and: [{ "slots.start": { $lte: startTime } }, { "slots.end": { $gte: startTime } }],
            },
          },
        });

        query["$or"].push({
          "pricing.selected_pricing": "CUSTOM_PRICE",
          "pricing.custom_price.prices": {
            $elemMatch: {
              $and: [{ "time.from": { $lte: startTime } }, { "time.to": { $gte: startTime } }],
            },
          },
        });
      }

      if (endTime) {
        query["$or"].push({
          "pricing.selected_pricing": "HIRE_FEE",
          "pricing.hire_fee.days": {
            $elemMatch: {
              $and: [{ "slots.start": { $lte: endTime } }, { "slots.end": { $gte: endTime } }],
            },
          },
        });

        query["$or"].push({
          "pricing.selected_pricing": "CUSTOM_PRICE",
          "pricing.custom_price.prices": {
            $elemMatch: {
              $and: [{ "time.from": { $lte: endTime } }, { "time.to": { $gte: endTime } }],
            },
          },
        });
      }
    }
  }

  if (query["$and"].length === 0) {
    delete query["$and"];
  }

  if (status) {
    let statusArray: string[];

    if (Array.isArray(status)) {
      statusArray = status;
    } else if (typeof status === "string") {
      statusArray = status.split(",").map((s: string) => s.trim());
    } else {
      statusArray = [];
    }

    if (!statusArray.includes("ALL")) {
      query.status = { $in: statusArray };
    }
  }

  const addMenuOfferCondition = (query: any, key: string, values: string) => {
    const valueArray = values.split(",").map((value) => value.trim());

    query["$and"] = query["$and"] || [];
    query["$and"].push({
      [key]: {
        $elemMatch: {
          question: "The venue offers in-house catering services",
          $and: [{ options: { $all: valueArray } }, { answer: true }],
        },
      },
    });
  };

  if (foods_and_beverages) {
    addOrCondition("venue.foods_and_beverages", foods_and_beverages);
  }

  if (menu_offer) {
    addMenuOfferCondition(query, "venue.foods_and_beverages", menu_offer);
  }

  if (facilities) addOrCondition("features", facilities);

  if (allow_events) addOrCondition("features", allow_events);

  let representationArray: string[] = [];
  if (representation) {
    if (Array.isArray(representation)) {
      representationArray = representation;
    } else if (typeof representation === "string") {
      representationArray = representation.split(",").map((value) => value.trim());
    }
  }

  if (representationArray.length > 0) {
    query["representation"] = { $in: representationArray };
  }

  return query;
};

export const constructQueryV2 = (params) => {
  const { status } = params;
  let query: any = {};
  if (status) {
    let statusArray: string[];

    if (Array.isArray(status)) {
      statusArray = status;
    } else if (typeof status === "string") {
      statusArray = status.split(",").map((s: string) => s.trim());
    } else {
      statusArray = [];
    }

    if (!statusArray.includes("ALL")) {
      query.status = { $in: statusArray };
    }
  }

  return query;
};
