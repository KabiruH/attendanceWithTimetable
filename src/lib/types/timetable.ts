// types/timetable.ts

export interface TimetableSlot {
  id: string;
  class_id: number;
  subject_id: number;
  employee_id: number;
  room_id: number;
  lesson_period_id: number;
  day_of_week: number;
  status: string;
  classes: {
    id: number;
    name: string;
    code: string;
    description: string;
    department: string;
    duration_hours: number;
  };
  subjects: {
    id: number;
    name: string;
    code: string;
    department: string;
    credit_hours?: number | null;
    description?: string | null;
  };
  rooms: {
    id: number;
    name: string;
    capacity: number;
    room_type: string;
  };
  lessonperiods: {
    id: number;
    name: string;
    start_time: Date;
    end_time: Date;
    duration: number;
  };
  users: {
    id: number;
    name: string;
    department: string;
  };
}