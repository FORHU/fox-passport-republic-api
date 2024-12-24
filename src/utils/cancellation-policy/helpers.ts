import { REFUND_PERCENTAGE } from "../constant";

export const customCancellation = (data: any, cancellation_policy: any): { amount?: number; message: string; allowed: boolean } => {
  const current_date = new Date();
  const start_date = new Date(data.start_date);
  const diffInTime = start_date.getTime() - current_date.getTime();
  const diffInDays = Math.ceil(diffInTime / (1000 * 3600 * 24));

  const policy = cancellation_policy.policy.custom;

  if (diffInDays >= policy.days_at_least.number_of_days) {
    return {
      amount: 1 - policy.days_at_least.total_price / 100,
      message: `Cancellation allowed as it is at least ${policy.days_at_least.number_of_days} days in advance. Total hire cost payable to the venue is: ${policy.days_at_least.total_price}%`,
      allowed: true,
    };
  } else if (diffInDays <= policy.days_less_than.number_of_days) {
    return {
      amount: 1 - policy.days_less_than.total_price / 100,
      message: `Cancellation allowed as it is less than ${policy.days_less_than.number_of_days} days in advance. Total hire cost payable to the venue is: ${policy.days_less_than.total_price}%`,
      allowed: true,
    };
  } else {
    for (const condition of policy.days_less_than_but_at_least) {
      if (diffInDays < condition.days_less_than && diffInDays >= condition.days_at_least) {
        return {
          amount: 1 - condition.total_price / 100,
          message: `Cancellation allowed as it is between ${condition.days_at_least} and ${condition.days_less_than} days in advance. Total hire cost payable to the venue is: ${condition.total_price}%`,
          allowed: true,
        };
      }
    }
  }

  return {
    amount: REFUND_PERCENTAGE["NO_REFUND"],
    message: "Cancellation is allowed but client will receive no refund.",
    allowed: true,
  };
};

export const veryFlexibleCancellation = (data: any): { amount?: number; message: string; allowed: boolean } => {
  const current_date = new Date();
  const start_date = new Date(data.start_date);
  const diffInTime = start_date.getTime() - current_date.getTime();
  const diffInDays = Math.ceil(diffInTime / (1000 * 3600 * 24));

  if (diffInDays >= 1) {
    return {
      amount: REFUND_PERCENTAGE["FULL_REFUND"],
      message: `Cancellation allowed as it is at least 1 day in advance and client will receive a full refund.`,
      allowed: true,
    };
  }

  return {
    amount: REFUND_PERCENTAGE["NO_REFUND"],
    message: "Cancellation is allowed but client will receive no refund.",
    allowed: true,
  };
};

export const flexibleCancellation = (data: any): { amount?: number; message: string; allowed: boolean } => {
  const current_date = new Date();
  const start_date = new Date(data.start_date);
  const diffInTime = start_date.getTime() - current_date.getTime();
  const diffInDays = Math.ceil(diffInTime / (1000 * 3600 * 24));

  if (diffInDays >= 7) {
    return {
      amount: REFUND_PERCENTAGE["FULL_REFUND"],
      message: `Cancellation allowed as it is at least 7 days in advance and client will receive a full refund.`,
      allowed: true,
    };
  } else if (diffInDays >= 1) {
    return {
      amount: REFUND_PERCENTAGE["HALF_REFUND"],
      message: `Cancellation allowed as it is at least 1 day in advance and client will receive 50% refund.`,
      allowed: true,
    };
  }

  return {
    amount: REFUND_PERCENTAGE["NO_REFUND"],
    message: "Cancellation is allowed but client will receive no refund.",
    allowed: true,
  };
};

export const standardThirtyCancellation = (data: any): { amount?: number; message: string; allowed: boolean } => {
  const current_date = new Date();
  const start_date = new Date(data.start_date);
  const diffInTime = start_date.getTime() - current_date.getTime();
  const diffInDays = Math.ceil(diffInTime / (1000 * 3600 * 24));

  if (diffInDays >= 30) {
    return {
      amount: REFUND_PERCENTAGE["FULL_REFUND"],
      message: `Cancellation allowed as it is at least 30 days in advance and client will receive a full refund`,
      allowed: true,
    };
  } else if (diffInDays >= 7) {
    return {
      amount: REFUND_PERCENTAGE["HALF_REFUND"],
      message: `Cancellation allowed as it is between 30 and 7 days in advance and the client will receive a 50% refund.`,
      allowed: true,
    };
  }

  return {
    amount: REFUND_PERCENTAGE["NO_REFUND"],
    message: "Cancellation is allowed but client will receive no refund.",
    allowed: true,
  };
};

export const standardSixtyCancellation = (data: any): { amount?: number; message: string; allowed: boolean } => {
  const current_date = new Date();
  const start_date = new Date(data.start_date);
  const diffInTime = start_date.getTime() - current_date.getTime();
  const diffInDays = Math.ceil(diffInTime / (1000 * 3600 * 24));

  if (diffInDays >= 60) {
    return {
      amount: REFUND_PERCENTAGE["FULL_REFUND"],
      message: `Cancellation allowed as it is at least 60 days in advance and client will receive a full refund.`,
      allowed: true,
    };
  } else if (diffInDays >= 30) {
    return {
      amount: REFUND_PERCENTAGE["HALF_REFUND"],
      message: `Cancellation allowed as it is between 60 and 30 days in advance and the client will receive a 50% refund.`,
      allowed: true,
    };
  }

  return {
    amount: REFUND_PERCENTAGE["NO_REFUND"],
    message: "Cancellation is allowed but client will receive no refund.",
    allowed: true,
  };
};
