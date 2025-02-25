export interface TMostPopular {
  page: number;
  limit: number;
  country: string;
  status: string;
  user_id?: string;
  tenant?: any;
  tenant_code?: string;
}

export interface TSpaceProjectPayload {
  _id?: any;
  status?: any;
  name?: any;
  type?: any;
  representation?: any;
  description?: any;
  space_photo?: any;
  venue?: any;
  pricing?: any;
  capacity_layout?: any;
  marked_as_favorite?: any;
  rating?: any;
  total_views?: any;
  keywords?: any;
  bookings?: any;
}
