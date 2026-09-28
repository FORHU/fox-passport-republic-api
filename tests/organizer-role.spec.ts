import { describe, it, expect } from "vitest";
import { permissionsForUser } from "../src/types/permissions";
import { validateOrganizerApplication } from "../src/modules/role-request/role-request.controller";

/**
 * The Organizer role grants nothing on its own — every permission comes from
 * an accepted Appointment on one Venue or Event. See
 * docs/adr/0005-organizer-role-and-appointments.md. These tests pin that, so a
 * later edit to ROLE_TYPE_GRANTS cannot quietly turn the role into a global
 * pass over every Venue and Event.
 */
describe("organizer role grants", () => {
  it("grants a citizen holding only the Organizer role no permissions", () => {
    expect(
      permissionsForUser({ systemRole: "user", roleType: ["organizer"] }),
    ).toEqual([]);
  });

  it("adds nothing to what another role already grants", () => {
    const eventFoxer = permissionsForUser({
      systemRole: "user",
      roleType: ["eventFoxer"],
    });
    const both = permissionsForUser({
      systemRole: "user",
      roleType: ["eventFoxer", "organizer"],
    });
    expect(both.sort()).toEqual(eventFoxer.sort());
  });

  it("never grants payouts:onboard — Organizers are paid privately", () => {
    expect(
      permissionsForUser({ systemRole: "user", roleType: ["organizer"] }),
    ).not.toContain("payouts:onboard");
  });
});

describe("validateOrganizerApplication", () => {
  const valid = () => ({
    bio: "Ran the door and floor for a dozen weddings.",
    location: "Cebu City",
    experience: "4",
    specializations: ["wedding", "garden"],
    validId1FileId: "file-id",
    backgroundClearanceFileId: "file-clearance",
    selfieFileId: "file-selfie",
  });

  it("accepts a complete application and coerces experience to a number", () => {
    const data: Record<string, unknown> = valid();
    expect(validateOrganizerApplication(data)).toBeNull();
    expect(data.experience).toBe(4);
  });

  it("accepts both event and venue categories as specializations", () => {
    expect(
      validateOrganizerApplication({
        ...valid(),
        specializations: ["corporate", "beach_resort"],
      }),
    ).toBeNull();
  });

  it.each([
    ["bio", { bio: "   " }],
    ["location", { location: "" }],
    ["negative experience", { experience: -1 }],
    ["fractional experience", { experience: 2.5 }],
    ["experience over 100", { experience: 101 }],
    ["an unknown specialization", { specializations: ["karaoke"] }],
    ["a service category", { specializations: ["catering"] }],
  ])("rejects %s", (_label, override) => {
    expect(
      validateOrganizerApplication({ ...valid(), ...override }),
    ).not.toBeNull();
  });

  it.each(["validId1FileId", "backgroundClearanceFileId", "selfieFileId"])(
    "requires %s — vetting is the point of the role",
    (field) => {
      const data: Record<string, unknown> = valid();
      delete data[field];
      expect(validateOrganizerApplication(data)).not.toBeNull();
    },
  );

  it("does not ask for any business or tax document", () => {
    const data: Record<string, unknown> = valid();
    expect(data).not.toHaveProperty("tinIdFileId");
    expect(data).not.toHaveProperty("birPermitFileId");
    expect(validateOrganizerApplication(data)).toBeNull();
  });
});
