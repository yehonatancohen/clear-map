export interface ActiveAlert {
  id: string;
  city_name: string;
  city_name_he: string;
  timestamp: number;
  is_double: boolean;
  status: string;
}

export interface IntelligenceUpdate {
  id: string;
  text: string;
  text_he: string;
  source: string;
  timestamp: number;
  severity: "low" | "medium" | "high" | "critical";
}