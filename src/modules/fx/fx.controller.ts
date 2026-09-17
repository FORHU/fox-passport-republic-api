import { Request, Response } from "express";
import FxSvc, { SUPPORTED_CURRENCIES } from "./fx.service";

export default class FxCtrl {
  static async getRates(req: Request, res: Response) {
    const baseParam = (req.query.base as string | undefined)?.toUpperCase();
    const base =
      baseParam &&
      (SUPPORTED_CURRENCIES as readonly string[]).includes(baseParam)
        ? baseParam
        : "PHP";

    try {
      const snapshot = await FxSvc.getRates(base);
      return res.status(200).json({
        success: true,
        data: {
          base: snapshot.base,
          rates: snapshot.rates,
          fetchedAt: snapshot.fetchedAt,
          currencies: SUPPORTED_CURRENCIES,
        },
      });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(502).json({
        success: false,
        message: err.message || "Failed to fetch exchange rates",
      });
    }
  }
}
