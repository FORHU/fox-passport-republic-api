import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../config";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function uploadVenueImage(
  file: Express.Multer.File,
  venueId: string,
) {
  const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;
  const filePath = `${venueId}/${filename}`; // Correct path for policy check

  const { error } = await supabase.storage
    .from("venues") // Match the bucket name in your policy
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (error) {
    console.error("Supabase upload error:", error);
    throw error;
  }

  const { data } = supabase.storage.from("venues").getPublicUrl(filePath);

  return data.publicUrl;
}

export async function uploadServiceImage(
  file: Express.Multer.File,
  serviceId: string,
) {
  const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;
  const filePath = `${serviceId}/${filename}`;

  const { error } = await supabase.storage
    .from("services")
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (error) {
    console.error("Supabase upload error:", error);
    throw error;
  }

  const { data } = supabase.storage.from("services").getPublicUrl(filePath);

  return data.publicUrl;
}

export async function uploadAssetImage(
  file: Express.Multer.File,
  assetId: string,
) {
  const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;
  const filePath = `${assetId}/${filename}`;

  const { error } = await supabase.storage
    .from("assets")
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (error) {
    console.error("Supabase upload error:", error);
    throw error;
  }

  const { data } = supabase.storage.from("assets").getPublicUrl(filePath);

  return data.publicUrl;
}

export default supabase;
