import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type StationReport = {
  id: string;
  station_id: string;
  is_working: boolean;
  created_at: string;
};

export async function fetchStationStats(stationIds: string[]) {
  if (!stationIds.length) return {};
  
  const { data, error } = await supabase
    .from('station_reports')
    .select('station_id, is_working')
    .in('station_id', stationIds);

  if (error) {
    console.error("Error fetching reports:", error);
    return {};
  }

  // Aggregate
  const stats: Record<string, { working: number, broken: number }> = {};
  for (const row of data || []) {
    if (!stats[row.station_id]) stats[row.station_id] = { working: 0, broken: 0 };
    if (row.is_working) stats[row.station_id].working++;
    else stats[row.station_id].broken++;
  }
  
  return stats;
}

export async function submitStationReport(stationId: string, isWorking: boolean) {
  const { error } = await supabase
    .from('station_reports')
    .insert([{ station_id: stationId, is_working: isWorking }]);
  
  if (error) {
    console.error("Error submitting report:", error);
    throw error;
  }
}
