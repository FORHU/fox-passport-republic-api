import crypto from "crypto";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import fs from "fs";
import { ObjectId } from "mongodb";
import path from "path";
import puppeteer from "puppeteer-core";

import { DEBUG_EMAIL, isDev, SUPPORT_EMAIL } from "../config";
import { OrgRoles } from "../models/organization-member.model";
import SpaceSvc from "../services/space.service";
import VenueSvc from "../services/venue.service";
import { QueryParams } from "../types/common";
import { CustomPrice, HireFee } from "../types/pricing";
import { COUNTRY, CURRENCY_RATES } from "./constant";
import { handleSendEmail } from "./email.utils";
import { logger } from "./logger";

dayjs.extend(customParseFormat);

const groupConsecutiveDays = (weekdays: string[]) => {
  const allDays = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const sortedDays = weekdays.map((day) => day.toUpperCase()).sort((a, b) => allDays.indexOf(a) - allDays.indexOf(b));

  const groupedRanges: string[] = [];
  let startDay = sortedDays[0];
  let previousDayIndex = allDays.indexOf(startDay);

  for (let i = 1; i <= sortedDays.length; i++) {
    const currentDay = sortedDays[i];
    const currentDayIndex = allDays.indexOf(currentDay);

    if (currentDayIndex - previousDayIndex > 1 || i === sortedDays.length) {
      // Finalize the range when days are not consecutive
      if (startDay === sortedDays[i - 1]) {
        groupedRanges.push(startDay);
      } else {
        groupedRanges.push(`${startDay}-${sortedDays[i - 1]}`);
      }

      startDay = currentDay; // Start a new range
    }
    previousDayIndex = currentDayIndex;
  }

  return groupedRanges.join(", ");
};

export type PricingData = {
  _id?: string;
  selected_pricing?: string;
  currency?: string;
  hire_fee?: HireFee;
  custom_price?: CustomPrice;
  cleaning_fee?: number;
  space_id?: string;
};

export const formatDate = (isoDateString?: string): string => {
  const date = isoDateString ? dayjs(isoDateString) : dayjs();
  return date.format("MM-DD-YYYY");
};

export const formatDateTimeToIso = (isoDateString?: string): string => {
  return dayjs(isoDateString, "DD/MM/YYYY HH:mm").toISOString();
};

export const isNullOrUndefinedOrEmptyArray = (object: any) => {
  return object === null || object === undefined || (Array.isArray(object) && object.length === 0);
};

export const hasNullOrUndefinedOrEmptyArrays = (object: any) => {
  const keysToIgnore = ["createdAt", "updatedAt", "deletedAt", "deletedBy", "organization", "representation"];
  const valuesToCheck = Object.entries(object).filter(([key, value]) => !keysToIgnore.includes(key));
  return valuesToCheck.some(([_, value]) => isNullOrUndefinedOrEmptyArray(value));
};

export const convertDollarsToCents = (amountInDollars: number): number => {
  if (isNaN(amountInDollars)) {
    throw new Error("Invalid amount");
  }
  const amountInCents = Math.round(amountInDollars * 100);

  return amountInCents;
};

export const convertCentsToDollars = (amountInCents: number): number => {
  if (isNaN(amountInCents)) {
    throw new Error("Invalid amount");
  }
  const amountInDollars = amountInCents / 100;

  return amountInDollars;
};

export const convertToIsoDate = (date: any): string => {
  const createdTimestampMilliseconds = date * 1000;
  const createdDate = new Date(createdTimestampMilliseconds);
  const createdIsoDate = createdDate.toISOString();
  return createdIsoDate;
};

export const hashSearch = (data: any) => {
  const processedData = JSON.stringify(data, (key, value) => {
    if (value instanceof RegExp) {
      return value.source;
    }
    return value;
  });
  return crypto.createHash("sha1").update(processedData).digest("hex");
};

export const getHTMLContents = ({ template_name, email_data }: any) => {
  const filePath = path.join(process.cwd(), `email-template/${template_name}`);
  const content = fs.readFileSync(filePath, "utf8");
  let html = content;
  for (const key in email_data) {
    const placeholder = `{${key}}`;
    html = html.replace(new RegExp(placeholder, "g"), email_data[key]);
  }
  return html;
};

export const sendTemplatedEmail = ({ template_name, subject, email_data, attachments = [], cc = null, isAdmin = false }: any) => {
  const html = getHTMLContents({ template_name, email_data });

  handleSendEmail({
    to: isAdmin ? SUPPORT_EMAIL : email_data.email,
    subject,
    html,
    attachments,
    cc: isDev ? DEBUG_EMAIL : cc,
    isAdmin,
  });
};

export const getVenueLocation = (venue: any): string => {
  const location = `${venue.address.street} ${venue.address.city} ${venue.address.state}`;
  return location;
};

export const getVenueCountry = (country: string) => {
  return COUNTRY[country];
};

export const convertToPDF = async (htmlContent: string) => {
  try {
    //const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const browser = await puppeteer.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: "dist/utils/chromium-browser",
    });
    //const browser = await puppeteer.launch({headless: "shell"})
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4" });
    logger.log({
      level: "info",
      message: `SUCCESS`,
    });
    await browser.close();
    return pdfBuffer;
  } catch (error) {
    logger.log({
      level: "info",
      message: `ERROR IN convertToPDF: ${error}`,
    });
    return false;
  }
};

// export const convertToPDF = async (htmlContent: string) => {};

export const createCurrencyFormatter = (locale: any, currency: any) => {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency,
  });
};

export const parseDate = (dateString: string, timeString: string) => {
  const [year, month, day] = dateString.split("-");
  const [hour, minute] = timeString.split(":");
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
};

export const dateFormat = (dateString: any) => {
  const formatSingleDate = (date: string) => {
    const newDate = dayjs(date, ["DD/MM/YYYY", "YYYY/MM/DD", "MM/DD/YYYY"]);
    const formattedDate = newDate.format("YYYY-MM-DD");

    const startDate = parseDate(formattedDate, dateString.from);
    let endDate = parseDate(formattedDate, dateString.to);

    if (dayjs(endDate).isBefore(startDate)) {
      endDate = dayjs(endDate).add(1, "day").toDate();
    }

    return {
      date: dateString.date,
      from: dateString.from,
      to: dateString.to,
      timestamp: {
        start_date_time: startDate,
        end_date_time: endDate,
      },
    };
  };

  if (Array.isArray(dateString.date)) {
    if (dateString.date.length > 1) {
      return dateString.date.map(formatSingleDate);
    } else {
      return formatSingleDate(dateString.date[0]);
    }
  } else {
    return formatSingleDate(dateString.date);
  }
};

export const bookingDateFormat = (dateString: any) => {
  const formatSingleDate = (date: string) => {
    const newDate = dayjs(date, ["DD/MM/YYYY", "YYYY/MM/DD", "MM/DD/YYYY"]);
    const formattedDate = newDate.format("YYYY-MM-DD");

    const startDate = parseDate(formattedDate, dateString.from);
    const endDate = parseDate(formattedDate, dateString.to);

    return {
      date: dateString.date,
      from: dateString.from,
      to: dateString.to,
      timestamp: {
        start_date_time: startDate,
        end_date_time: endDate,
      },
    };
  };

  if (Array.isArray(dateString.date)) {
    if (dateString.date.length === 1) {
      return [formatSingleDate(dateString.date[0])];
    } else {
      return dateString.date.map(formatSingleDate);
    }
  } else {
    return [formatSingleDate(dateString.date)];
  }
};

export const dateFormatter = (dateString: any) => {
  const newDate = dayjs(dateString, "DD/MM/YYYY");
  const formattedDate = newDate.format("YYYY-MM-DD");

  return formattedDate;
};

export const verifyObjectId = (id: string): ObjectId | null => {
  try {
    if (id.length !== 24) {
      console.error("Invalid ObjectId length: " + id);
      return null;
    }

    if (ObjectId.isValid(id)) {
      return new ObjectId(id);
    } else {
      console.error("Invalid ObjectId: " + id);
      return null;
    }
  } catch (error) {
    console.error("Error while verifying ObjectId: " + error);
    return null;
  }
};

export const calculatePagination = (totalItems: number, limitNumber: number, page: number, offset: number) => ({
  total_pages: Math.ceil(totalItems / limitNumber) || 0,
  total_items: totalItems,
  current_page: page,
  size: limitNumber,
  offset,
});

export const convertToCurrency = (amount: number, fromCurrency: string, toCurrency: string): number => {
  if (!CURRENCY_RATES[fromCurrency] || !CURRENCY_RATES[toCurrency]) {
    throw new Error(`Unsupported currency: ${fromCurrency} or ${toCurrency}`);
  }
  const baseInUSD = amount / CURRENCY_RATES[fromCurrency];
  const convertedAmount = baseInUSD * CURRENCY_RATES[toCurrency];
  return Math.round(convertedAmount);
};

export const getRoleName = (roleId: number): string => {
  switch (roleId) {
    case OrgRoles.VENUE_OWNER:
      return "Venue Owner";
    case OrgRoles.ADMIN:
      return "Admin";
    case OrgRoles.EVENT_MANAGER:
      return "Event Manager";
    case OrgRoles.MEMBER:
      return "Member";
    default:
      return "UNKNOWN_ROLE";
  }
};

export const extractS3KeyFromUrl = (url: string): string => {
  const urlObject = new URL(url);
  let s3Key = urlObject.pathname.substring(1);
  const decodedUrl = decodeURIComponent(s3Key);
  s3Key = decodedUrl.replace("+", " ");
  return s3Key;
};

export const generateFileName = (name: string, ext: string): string => {
  const timestamp = new Date().getTime();
  return `${name}-${timestamp}.${ext}`;
};

export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000);
};

export const checkVenueName = async (name: string): Promise<boolean> => {
  const venueExists = await VenueSvc.getVenueNameIdAndStatus({
    name: { $regex: new RegExp(`^${name}$`, "i") },
  });
  return !!venueExists; // Returns true if venueExists is truthy, otherwise false
};

export const checkSpaceName = async (name: string): Promise<boolean> => {
  const spaceExists = await SpaceSvc.getSpace({
    name: { $regex: new RegExp(`^${name}$`, "i") },
  });
  return !!spaceExists; // Returns true if spaceExists is truthy, otherwise false
};

export const getSummarizedPricing = async (pricingData: PricingData[]) => {
  const results: {
    space_id: string;
    pricing:
      | { days: string; time: string; rate: { perHour: string; perDay: string } }[]
      | { days: string; time: string; rate: { priceType: string; priceRate: string; minimumSpend: string } }[];
    selected_pricing: string;
  }[] = [];

  pricingData.forEach((space) => {
    const { custom_price, selected_pricing, space_id, currency, hire_fee } = space;

    let pricing = [];

    if (selected_pricing === "HIRE_FEE") {
      const groupedDays: { days: string[]; timeRange: string; rate: { perHour: string; perDay: string } }[] = [];
      let currentGroup: { days: string[]; timeRange: string; rate: { perHour: string; perDay: string } } | null = null;

      hire_fee.days.forEach((day: any, index: number) => {
        const timeRange = `${day.slots.start} - ${day.slots.end}`;
        const rate = {
          perHour: day.hourlyCheckBox ? `${day.slots.rate}${currency}` : "Not available",
          perDay: day.fullRateCheckkBox ? `${day.full_day_rate}${currency}` : "Not available",
        };

        if (
          currentGroup &&
          currentGroup.timeRange === timeRange &&
          currentGroup.rate.perHour === rate.perHour &&
          currentGroup.rate.perDay === rate.perDay
        ) {
          currentGroup.days.push(day.name);
        } else {
          if (currentGroup) groupedDays.push(currentGroup);
          currentGroup = { days: [day.name], timeRange, rate };
        }

        if (index === hire_fee.days.length - 1 && currentGroup) groupedDays.push(currentGroup);
      });

      pricing = groupedDays.map((group) => {
        const dayRange =
          group.days.length > 1 ? `${group.days[0].toUpperCase()}-${group.days[group.days.length - 1].toUpperCase()}` : group.days[0].toUpperCase();

        return {
          days: dayRange,
          time: group.timeRange,
          rate: {
            perHour: group.rate.perHour,
            perDay: group.rate.perDay,
          },
        };
      });
    } else if (selected_pricing === "CUSTOM_PRICE") {
      pricing = custom_price.prices.map((price) => {
        const timeRange = `${price.time.from} - ${price.time.to}`;
        const rateValue = `${price.price}${currency}`;
        const minimumSpend = price.minimum_spend ? `${price.minimum_spend}${currency}` : "Not available";

        return {
          days: groupConsecutiveDays(price.weekdays),
          time: timeRange,
          rate: {
            priceType: price.type,
            priceRate: rateValue,
            minimumSpend,
          },
        };
      });
    }

    const existingSpace = results.find((result) => result.space_id === space_id);
    if (existingSpace) {
      existingSpace.pricing.push(...pricing);
    } else {
      results.push({ space_id, pricing, selected_pricing });
    }
  });

  return results;
};

export const getOneSummarizedPricing = (pricingData: PricingData) => {
  const { custom_price, selected_pricing, space_id, currency, hire_fee } = pricingData;

  let pricing = [];

  if (selected_pricing === "HIRE_FEE") {
    const groupedDays: { days: string[]; timeRange: string; rate: { perHour: string; perDay: string } }[] = [];
    let currentGroup: { days: string[]; timeRange: string; rate: { perHour: string; perDay: string } } | null = null;

    hire_fee.days.forEach((day: any, index: number) => {
      const timeRange = `${day.slots.start} - ${day.slots.end}`;
      const rate = {
        perHour: day.hourlyCheckBox ? `${day.slots.rate}${currency}` : "Not available",
        perDay: day.fullRateCheckkBox ? `${day.full_day_rate}${currency}` : "Not available",
      };

      if (
        currentGroup &&
        currentGroup.timeRange === timeRange &&
        currentGroup.rate.perHour === rate.perHour &&
        currentGroup.rate.perDay === rate.perDay
      ) {
        currentGroup.days.push(day.name);
      } else {
        if (currentGroup) groupedDays.push(currentGroup);
        currentGroup = { days: [day.name], timeRange, rate };
      }

      if (index === hire_fee.days.length - 1 && currentGroup) groupedDays.push(currentGroup);
    });

    pricing = groupedDays.map((group) => {
      const dayRange =
        group.days.length > 1 ? `${group.days[0].toUpperCase()}-${group.days[group.days.length - 1].toUpperCase()}` : group.days[0].toUpperCase();

      return {
        days: dayRange,
        time: group.timeRange,
        rate: {
          perHour: group.rate.perHour,
          perDay: group.rate.perDay,
        },
      };
    });
  } else if (selected_pricing === "CUSTOM_PRICE") {
    pricing = custom_price.prices.map((price) => {
      const timeRange = `${price.time.from} - ${price.time.to}`;
      const rateValue = `${price.price}${currency}`;
      const minimumSpend = price.minimum_spend ? `${price.minimum_spend}${currency}` : "Not available";

      return {
        days: groupConsecutiveDays(price.weekdays),
        time: timeRange,
        rate: {
          priceType: price.type,
          priceRate: rateValue,
          minimumSpend,
        },
      };
    });
  }

  return {
    space_id,
    pricing,
    selected_pricing,
  };
};

export const stringToArray = (str: string | undefined, defaultValues: string[] = []): string[] => {
  return (str?.split(",") ?? defaultValues).map((item) => item.trim());
};

export const tenantBuildQuery = ({ status, tenant_code, tenant, country, supportedCountries, user_id }: QueryParams): any => {
  return {
    action: "VIEW_SPACE",
    space: {
      status,
    },
    venue: {
      ...(tenant?.config?.country
        ? { address: { country: tenant.config.country } }
        : country && supportedCountries.includes(country)
          ? { address: { country } }
          : { tenant: tenant_code }),
    },
    ...(user_id && { user_id }),
  };
};
