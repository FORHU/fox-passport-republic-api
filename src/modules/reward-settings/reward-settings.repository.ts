import { prisma } from "../../utils/prisma";

export interface RewardSettingRow {
  key: string;
  value: unknown;
  updatedBy: string;
  updatedAt: Date;
}

export default class RewardSettingsRepo {
  static findAll(): Promise<RewardSettingRow[]> {
    return prisma.rewardSetting.findMany();
  }

  static findByKey(key: string): Promise<RewardSettingRow | null> {
    return prisma.rewardSetting.findUnique({ where: { key } });
  }

  static upsert(
    key: string,
    value: number,
    updatedBy: string,
  ): Promise<RewardSettingRow> {
    return prisma.rewardSetting.upsert({
      where: { key },
      create: { key, value, updatedBy },
      update: { value, updatedBy },
    });
  }

  /** Removes the override, so the default applies again. False if there was none. */
  static async remove(key: string): Promise<boolean> {
    const { count } = await prisma.rewardSetting.deleteMany({ where: { key } });
    return count > 0;
  }
}
