import ProfileRepo from "./profile.repository";
import { normalizeSocialLinks } from "../../utils/social-links";
import { permissionsForUser } from "../../types/permissions";
import { revokeAllSessions } from "../auth/sessions.service";
import { hashPassword, verifyPassword } from "../../utils/password";
import OnboardingSvc from "../onboarding/onboarding.service";
import { recordChange, type AuditActor } from "../audit/audit.service";
import { notFound } from "../../utils/errors";

export const USERNAME_TAKEN = "Username already taken";

export default class ProfileSvc {
  // Get user profile
  static async getProfile(userId: string) {
    const user = await ProfileRepo.findProfileById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    // Derived on read, never stored. The app holds no grant table, so this is
    // where its server-side guards learn what the person may do - and deriving
    // it here means it cannot go stale against the table the way a column
    // would. The API never reads it back: `can()` re-derives from the role.
    return { ...user, permissions: permissionsForUser(user) };
  }

  // Update profile
  static async updateProfile(
    userId: string,
    data: {
      name?: string;
      username?: string;
      phone?: string | null;
      profileImage?: string;
      country?: string;
      state?: string;
      city?: string;
      district?: string;
      isPrivate?: boolean;
      bio?: string;
      socialLinks?: Record<string, string>;
      preferredCurrency?: string;
    },
  ) {
    // Check if username is already taken (if updating username)
    if (data.username) {
      const existingUser = await ProfileRepo.findByUsernameExcludingUserId(
        data.username,
        userId,
      );

      if (existingUser) {
        throw new Error(USERNAME_TAKEN);
      }
    }

    const { profileImage, phone, bio, socialLinks, ...rest } = data;
    // The links sent replace the ones stored; none left clears them.
    const links =
      socialLinks === undefined ? undefined : normalizeSocialLinks(socialLinks);
    const updated = await ProfileRepo.updateProfile(userId, {
      ...rest,
      // An empty phone clears it: stored as null, not "".
      ...(phone !== undefined ? { phone: phone || null } : {}),
      ...(profileImage !== undefined ? { imgId: profileImage } : {}),
      ...(links !== undefined
        ? { socialLinks: Object.keys(links).length === 0 ? null : links }
        : {}),
      // An empty bio clears it.
      ...(bio !== undefined
        ? { bio: bio.trim() === "" ? null : bio.trim() }
        : {}),
    } as Parameters<typeof ProfileRepo.updateProfile>[1]);

    // A profile that now has a photo, username, bio and city earns its
    // one-time reward. Never fails the save.
    await OnboardingSvc.syncDetectedSteps(userId).catch(() => {});
    return updated;
  }

  // Change password
  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    // Get user with password
    const user = await ProfileRepo.findUserForPasswordCheck(userId);

    if (!user) {
      throw new Error("User not found");
    }

    const passwordToCheck = user.password;
    if (!passwordToCheck) {
      throw new Error(
        "This account does not have a password set (signed in with a social account).",
      );
    }

    // Verify current password
    const isPasswordValid = await verifyPassword(
      currentPassword,
      passwordToCheck,
    );
    if (!isPasswordValid) {
      throw new Error("Current password is incorrect");
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await ProfileRepo.updatePasswordHash(userId, hashedPassword);

    // A password change must not leave older sessions alive. This ends the
    // caller's own session too, so they sign in again with the new password.
    await revokeAllSessions(userId);

    return { message: "Password changed successfully" };
  }

  /** The EventFoxer's commission rate, in percent (#264 T5). */
  static async getCommission(userId: string) {
    const user = await ProfileRepo.findCommissionPct(userId);
    if (!user) throw notFound("User");
    return { commissionPct: user.commissionPct.toNumber() };
  }

  /**
   * Sets the EventFoxer's one commission rate, which applies to every Event
   * they created (#264 D5). Events with a booking that isn't cancelled keep
   * the rate their clients saw (D6, Q11); the response lists the upcoming
   * ones, so the EventFoxer knows which prices didn't move.
   */
  static async setCommission(
    userId: string,
    commissionPct: number,
    actor: AuditActor,
  ) {
    const result = await ProfileRepo.updateCommissionPct(userId, commissionPct);
    if (!result) throw notFound("User");

    const previous = result.previous.toNumber();
    const current = result.current.toNumber();
    if (previous !== current) {
      await recordChange(actor, "commission.update", userId, {
        previous: { commissionPct: previous },
        current: { commissionPct: current },
      });
    }

    const kept = await ProfileRepo.findBookedUpcomingEvents(userId, new Date());
    return {
      commissionPct: current,
      previousCommissionPct: previous,
      // Each keeps its own rate. `null` means it was booked before rates were
      // stored per Event, and is priced the way it was booked.
      eventsKeepingTheirRate: kept.map((e) => ({
        id: e.id,
        name: e.name,
        startAt: e.startAt,
        commissionPct: e.commissionPct?.toNumber() ?? null,
      })),
    };
  }

  // Delete account
  static async deleteAccount(userId: string, password: string) {
    // Get user with password
    const user = await ProfileRepo.findUserForPasswordCheck(userId);

    if (!user) {
      throw new Error("User not found");
    }

    const passwordToCheck = user.password;
    if (!passwordToCheck) {
      throw new Error(
        "Social login accounts must contact support to delete their account.",
      );
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, passwordToCheck);
    if (!isPasswordValid) {
      throw new Error("Password is incorrect");
    }

    // Delete user (cascade will handle related records)
    await ProfileRepo.deleteUser(userId);

    return { message: "Account deleted successfully" };
  }
}
