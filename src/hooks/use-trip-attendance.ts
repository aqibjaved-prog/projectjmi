import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AttendanceEventType =
  | "boarded"
  | "late"
  | "absent"
  | "dropped"
  | "wrong_stop";

export interface AttendanceRecord {
  student_id: string;
  event_type: AttendanceEventType;
  scanned_at: string;
}

export interface TripAttendance {
  byStudent: Record<string, AttendanceRecord>;
  counts: {
    boarded: number;
    late: number;
    absent: number;
    dropped: number;
    wrong_stop: number;
  };
}

/**
 * Attendance derived from qr_logs (single source of truth).
 * Each student's status is the latest event for that student on this trip.
 * Realtime-subscribed for instant updates across driver + school admin views.
 */
export function useTripAttendance(tripId: string | undefined | null) {
  const qc = useQueryClient();
  const key = ["trip-attendance", tripId];

  const query = useQuery({
    enabled: !!tripId,
    queryKey: key,
    queryFn: async (): Promise<TripAttendance> => {
      const { data, error } = await supabase
        .from("qr_logs")
        .select("student_id, event_type, scanned_at")
        .eq("trip_id", tripId!)
        .order("scanned_at", { ascending: true });
      if (error) throw error;
      const byStudent: Record<string, AttendanceRecord> = {};
      for (const row of (data ?? []) as AttendanceRecord[]) {
        // Later rows overwrite earlier ones — latest wins.
        byStudent[row.student_id] = row;
      }
      const counts = { boarded: 0, late: 0, absent: 0, dropped: 0, wrong_stop: 0 };
      for (const r of Object.values(byStudent)) {
        if (r.event_type in counts) counts[r.event_type as keyof typeof counts]++;
      }
      return { byStudent, counts };
    },
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!tripId) return;
    const channel = supabase
      .channel(`qr_logs:${tripId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "qr_logs", filter: `trip_id=eq.${tripId}` },
        () => { qc.invalidateQueries({ queryKey: key }); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  return query;
}
