import {
  GOGOJI_URI,
  TENANT_ALLOW_REFERER,
  TENANT_GOGOJI_API_KEY,
  TENANT_VENUE4USE_API_KEY,
  VENUE_4_USE_URI,
  VENUE4USE_ALLOW_REFERER,
} from "../config";
import { stringToArray } from "./helpers";

type CountryCodes = {
  [key: string]: string;
};

type TREFUND = {
  [key: string]: number;
};

export const USER_ROLES = {
  ADMIN: "ADMIN",
  USER: "USER",
  VENUE_OWNER: "VENUE_OWNER",
  VENUE_LISTER: "VENUE_LISTER",
  EVENT_MANAGER: "EVENT_MANAGER",
  FINANCE_AND_ACCOUNTING: "FINANCE_AND_ACCOUNTING",
};

export const MESSAGE_CODE = {
  "1001": {
    code: 1001,
    message: "Invalid Email",
    description: "The user is not valid",
    status_code: 404,
  },
  "1002": {
    code: 1002,
    message: "Role not match",
    description: "The role is not match",
    status_code: 400,
  },
  "1003": {
    code: 1003,
    message: "Invalid Password",
    description: "Invalid Password",
    status_code: 404,
  },
  "1004": {
    code: 1004,
    message: "User already exists through Google",
    description: "User already exists through Google",
    status_code: 403,
  },
  "1005": {
    code: 1005,
    message: "Refresh Token expired",
    description: "Refresh Token expired. Please login again",
    status_code: 403,
  },
  "2001": {
    code: 2001,
    message: "Venue not found",
    description: "The venue is not found",
    status_code: 404,
  },
  "3001": {
    code: 3001,
    message: "Space not found",
    description: "The space is not found",
    status_code: 404,
  },
};

export const COUNTRY: CountryCodes = {
  SG: "SINGAPORE",
};

export const REFUND_PERCENTAGE: TREFUND = {
  NO_REFUND: 0,
  FULL_REFUND: 1,
  HALF_REFUND: 0.5,
};

export const CURRENCY_RATES: { [key: string]: number } = {
  USD: 1,
  MYR: 4.6,
  SGD: 1.36,
  THB: 36.5,
  PHP: 56.8,
  IDR: 15300,
  VND: 24000,
  TWD: 32.0,
};

export const SUPPORTED_CURRENCIES = ["MYR", "SGD", "THB", "PHP", "TWD", "USD", "IDR", "VND", "TWD"];

export const STRIPE_EVENTS = {
  ACCOUNT_UPDATED: "account.updated",
  PAYMENT_ATTACHED: "payment_method.attached",
  INVOICE_PAYMENT_SUCCEDED: "invoice.payment_succeeded",
  INVOICE_FAILED: "invoice.payment_failed",
};

export const PERMISSION = {
  READ: "read",
  WRITE: "write",
  DELETE: "delete",
};

export const ADMIN_ROLES = {
  1: "ADMIN",
  2: "SALES",
  3: "MEMBER",
  4: "SUPER_ADMIN",
};

export const TENANT_MAPPING = {
  thailand: "TH",
  venue4use: "VENUE4USE",
};

export const TENANT_CONFIGS = {
  VENUE4USE: {
    name: "VENUE4USE",
    allowed_domains: stringToArray(VENUE4USE_ALLOW_REFERER),
    require_referer: true,
    require_tenant: true,
    strict_mode: true,
    site_url: VENUE_4_USE_URI,
    SUPPORTED_COUNTRIES: ["SG", "MY", "PH"],
    X_API_KEYS: stringToArray(TENANT_VENUE4USE_API_KEY),
  },
  TH: {
    name: "Gogoji",
    allowed_domains: stringToArray(TENANT_ALLOW_REFERER),
    require_referer: true,
    require_tenant: true,
    strict_mode: true,
    country: "TH",
    currency: "THB",
    site_url: GOGOJI_URI,
    SUPPORTED_COUNTRIES: ["TH"],
    X_API_KEYS: stringToArray(TENANT_GOGOJI_API_KEY),
  },
};
