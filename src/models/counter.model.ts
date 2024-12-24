export enum CounterType {
  BOOKING = "BOOKING",
  INVOICE = "INVOICE",
  RECEIPT = "RECEIPT",
}

export interface TCounter {
  count?: number;
  type?: CounterType;
}
