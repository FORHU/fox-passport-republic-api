import type { IncomingHttpHeaders } from "http";
import { fromNodeHeaders } from "better-auth/node";
import { APIError } from "better-auth/api";
import ProfileRepo, { type CredentialState } from "./profile.repository";
import { auth } from "../../infrastructure/auth/better-auth";
import { normalizeSocialLinks } from "../../utils/social-links";
import { permissionsForUser } from "../../types/permissions";
import { revokeAllSessions } from "../auth/sessions.service";
import { hashPassword, verifyPassword } from "../../utils/password";
import OnboardingSvc from "../onboarding/onboarding.service";
import { recordChange, type AuditActor } from "../audit/audit.service";
import { notFound } from "../../utils/errors";
import { RoleType } from "@prisma/client";
import ProviderSpecialtySvc from "../users/provider-specialty.service";

export const USERNAME_TAKEN = "Username already taken";
export const CREDENTIALS_ALREADY_SET =
  "Your account already has a username and password.";
export const PASSWORD_ALREADY_SET =
  "Your account already has a password. Change it from your account settings.";

/** A refused specialty edit; the form shows it under the specialties field. */
export class SpecialtyError extends Error {
  readonly field = "specialties";
}

/** A refused account setup (api#419), with its HTTP status and the field it is about. */
export class CredentialSetupError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly field?: "username" | "password",
  ) {
    super(message);
  }
}

/**
 * A Google account must have a username and a password before it uses the
 * app (api#419): without them it could only ever sign in with Google.
 * Email and Facebook accounts are not asked.
 */
export function needsCredentialSetup(state: CredentialState): boolean {
  return state.hasGoogle && (!state.username || !state.hasPassword);
}

export default class ProfileSvc {
  // Get user profile
  static async getProfile(userId: string) {
    const user = await ProfileRepo.findProfileById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    const { credentials, ...profile } = user;
    // Derived on read, never stored. The app holds no grant table, so this is
    // where its server-side guards learn what the person may do - and deriving
    // it here means it cannot go stale against the table the way a column
    // would. The API never reads it back: `can()` re-derives from the role.
    const specialties = profile.roleType.includes(RoleType.providerFoxer)
      ? await ProfileSvc.getProviderSpecialties(userId)
      : undefined;
    return {
      ...profile,
      permissions: permissionsForUser(profile),
      ...(specialties ? { specialties } : {}),
      // The apps send someone who must set these up to account setup before
      // anything else (api#419).
      hasPassword: credentials.hasPassword,
      needsCredentialSetup: needsCredentialSetup(credentials),
    };
  }

  /** Whether nobody else has this (already normalized) username. */
  static async isUsernameAvailable(userId: string, username: string) {
    const taken = await ProfileRepo.findByUsernameExcludingUserId(
      username,
      userId,
    );
    return !taken;
  }

  /**
   * Finishes a Google account's setup (api#419): saves the username and sets
   * the password, each only when the account lacks it. A password already set
   * is never replaced here (that is change-password, which asks for the
   * current one). The username goes first so a taken one changes nothing;
   * the password is set by Better Auth on the caller's session, which creates
   * the credential account with its own hash. Answers with the fresh profile.
   */
  static async setUpCredentials(
    userId: string,
    input: { username?: string; password?: string },
    headers: IncomingHttpHeaders,
  ) {
    const state = await ProfileRepo.findCredentialState(userId);
    if (!state) throw new Error("User not found");
    if (!needsCredentialSetup(state)) {
      throw new CredentialSetupError(CREDENTIALS_ALREADY_SET, 409);
    }
    if (state.hasPassword && input.password !== undefined) {
      throw new CredentialSetupError(PASSWORD_ALREADY_SET, 409, "password");
    }
    if (!state.username && !input.username) {
      throw new CredentialSetupError("Choose a username", 400, "username");
    }
    if (!state.hasPassword && !input.password) {
      throw new CredentialSetupError("Choose a password", 400, "password");
    }

    // An account that already has a username keeps it.
    if (!state.username && input.username) {
      if (!(await ProfileSvc.isUsernameAvailable(userId, input.username))) {
        throw new CredentialSetupError(USERNAME_TAKEN, 400, "username");
      }
      try {
        await ProfileRepo.updateProfile(userId, { username: input.username });
      } catch (e) {
        // Taken by someone else between the check and the save.
        if ((e as { code?: string } | null)?.code === "P2002") {
          throw new CredentialSetupError(USERNAME_TAKEN, 400, "username");
        }
        throw e;
      }
      await OnboardingSvc.syncDetectedSteps(userId).catch(() => {});
    }

    if (!state.hasPassword && input.password) {
      try {
        await auth.api.setPassword({
          body: { newPassword: input.password },
          headers: fromNodeHeaders(headers),
        });
      } catch (e) {
        if (e instanceof APIError) {
          const code = (e.body as { code?: string } | undefined)?.code;
          if (code === "PASSWORD_ALREADY_SET") {
            throw new CredentialSetupError(
              PASSWORD_ALREADY_SET,
              409,
              "password",
            );
          }
          throw new CredentialSetupError(e.message, 400, "password");
        }
        throw e;
      }
    }

    return ProfileSvc.getProfile(userId);
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
      specialties?: string[];
    },
  ) {
    // Specialties are checked first, so a refused edit saves nothing else.
    if (data.specialties !== undefined) {
      await ProfileSvc.setProviderSpecialties(userId, data.specialties);
    }

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

    const {
      profileImage,
      phone,
      bio,
      socialLinks,
      specialties: _specialties,
      ...rest
    } = data;
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

  /** A Provider's specialties as `{ slug, name }`, named from the catalog. */
  static async getProviderSpecialties(userId: string) {
    const [slugs, catalog] = await Promise.all([
      ProfileRepo.findProviderSpecialtyCategories(userId),
      ProviderSpecialtySvc.list(),
    ]);
    const names = new Map(catalog.map((c) => [c.slug, c.name]));
    return slugs.map((slug) => ({ slug, name: names.get(slug) ?? slug }));
  }

  /**
   * Replaces a Provider's specialties with `declared`. A Provider keeps at
   * least one, every one must be in the catalog, and one with a booking ahead
   * stays until that booking is done.
   */
  static async setProviderSpecialties(userId: string, declared: unknown) {
    const roles = await ProfileRepo.findRoleTypes(userId);
    if (!roles.includes(RoleType.providerFoxer)) {
      throw new SpecialtyError("Only Providers have specialties");
    }

    const current = await ProfileRepo.findProviderSpecialtyCategories(userId);
    const check = await ProviderSpecialtySvc.check(declared, current);
    if (!check.ok) throw new SpecialtyError(check.message);
    const next = new Set(check.slugs);
    const removed = current.filter((slug) => !next.has(slug));
    const added = check.slugs.filter((slug) => !current.includes(slug));

    const blocked = await ProfileRepo.categoriesWithUpcomingBookings(
      userId,
      removed,
    );
    if (blocked.length > 0) {
      throw new SpecialtyError(
        `You can't remove ${blocked.join(", ")} while it has upcoming bookings`,
      );
    }

    if (removed.length > 0 || added.length > 0) {
      await ProfileRepo.replaceProviderSpecialties(userId, removed, added);
    }
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
