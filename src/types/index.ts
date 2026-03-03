export interface ActiveAlert {
  id: string;
  city_name: string;
  city_name_he: string;
  timestamp: number;
  is_double: boolean;
  status: string;
}

export interface UavTrack {
  track_id: string;
  observed: [number, number][];
  predicted: [number, number][];
  heading_deg: number;
  speed_kmh: number;
  origin_type?: string;
  last_updated: number;
}

export interface OrefHistoryAlert {
  data: string;
  date: string;
  time: string;
  alertDate: string;
  category: number;
  category_desc: string;
  matrix_id: number;
  rid: number;
}

export interface IntelligenceUpdate {
  id: string;
  text: string;
  text_he: string;
  source: string;
  timestamp: number;
  severity: "low" | "medium" | "high" | "critical";
}