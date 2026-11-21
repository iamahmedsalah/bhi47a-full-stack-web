export const ATTENDANCE_SESSION_TYPES = {
  LECTURE: 'lecture',
  SECTION: 'section',
  LAB: 'lab',
} as const;

export type AttendanceSessionType =
  (typeof ATTENDANCE_SESSION_TYPES)[keyof typeof ATTENDANCE_SESSION_TYPES];

export const ATTENDANCE_SESSION_TYPE_VALUES: AttendanceSessionType[] =
  Object.values(ATTENDANCE_SESSION_TYPES);

export const ATTENDANCE_SESSION_STATUSES = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  EXPIRED: 'EXPIRED',
} as const;

export type AttendanceSessionStatus =
  (typeof ATTENDANCE_SESSION_STATUSES)[keyof typeof ATTENDANCE_SESSION_STATUSES];

export const ATTENDANCE_SESSION_STATUS_VALUES: AttendanceSessionStatus[] =
  Object.values(ATTENDANCE_SESSION_STATUSES);

export const ATTENDANCE_RECORD_STATUSES = {
  PRESENT: 'present',
  LATE: 'late',
  EXCUSED: 'excused',
  ABSENT: 'absent',
} as const;

export type AttendanceRecordStatus =
  (typeof ATTENDANCE_RECORD_STATUSES)[keyof typeof ATTENDANCE_RECORD_STATUSES];

export const ATTENDANCE_RECORD_STATUS_VALUES: AttendanceRecordStatus[] =
  Object.values(ATTENDANCE_RECORD_STATUSES);

export const ATTENDANCE_METHODS = {
  QR: 'qr',
  MANUAL: 'manual',
} as const;

export type AttendanceMethod =
  (typeof ATTENDANCE_METHODS)[keyof typeof ATTENDANCE_METHODS];

export const ATTENDANCE_METHOD_VALUES: AttendanceMethod[] =
  Object.values(ATTENDANCE_METHODS);

export const STAFF_ACADEMIC_POSITIONS = {
  DOCTOR: 'doctor',
  INSTRUCTOR: 'instructor',
} as const;

export type StaffAcademicPosition =
  (typeof STAFF_ACADEMIC_POSITIONS)[keyof typeof STAFF_ACADEMIC_POSITIONS];

export const STAFF_ACADEMIC_POSITION_VALUES: StaffAcademicPosition[] =
  Object.values(STAFF_ACADEMIC_POSITIONS);

export const ATTENDANCE_CONFIG_DEFAULTS = {
  SESSION_DURATION_MINUTES: 15,
  QR_ROTATION_SECONDS: 20,
  LATE_AFTER_MINUTES: 10,
  QR_TOLERANCE_SECONDS: 5,
} as const;

export const ATTENDANCE_RECORD_DELETE_LIMIT = 200;

export const INSTITUTE_GEO_LOCATION = {
  VENUE_NAME: 'المعهد العالى للعلوم الادارية والحاسبات',
  VENUE_NAME_EN: 'BHI Advanced administrative sciences and computers K47',
  LATITUDE: 30.901143,
  LONGITUDE: 29.874724,
  DEFAULT_RADIUS_METERS: 150,
  CAMPUS_RADIUS_METERS: 350,
  GOOGLE_MAPS_URL: 'https://maps.app.goo.gl/zH8dqgbJG51u54re6',
} as const;

export interface InstituteVenuePreset {
  id: string;
  name: string;
  nameEn: string;
  category: 'campus' | 'hall' | 'lab';
  lat: number;
  lng: number;
  radius: number;
}

export const INSTITUTE_VENUE_PRESETS: readonly InstituteVenuePreset[] = [
  // Campus & Buildings
  {
    id: 'campus',
    name: 'حرم المعهد بالكامل (Campus Wide)',
    nameEn: 'Campus Wide',
    category: 'campus',
    lat: 30.901143,
    lng: 29.874724,
    radius: 350,
  },
  {
    id: 'bis_building',
    name: 'مبنى نظم المعلومات (BIS Building)',
    nameEn: 'BIS Building',
    category: 'campus',
    lat: 30.901143,
    lng: 29.874724,
    radius: 150,
  },
  {
    id: 'main_auditorium',
    name: 'المدرج المركزي (Main Auditorium)',
    nameEn: 'Main Auditorium',
    category: 'hall',
    lat: 30.901143,
    lng: 29.874724,
    radius: 120,
  },
  {
    id: 'hall_315',
    name: 'مدرج 315 (Hall 315)',
    nameEn: 'Hall 315',
    category: 'hall',
    lat: 30.901143,
    lng: 29.874724,
    radius: 100,
  },
  // Halls 1 to 7
  {
    id: 'hall_1',
    name: 'مدرج 1 (Hall 1)',
    nameEn: 'Hall 1',
    category: 'hall',
    lat: 30.901143,
    lng: 29.874724,
    radius: 100,
  },
  {
    id: 'hall_2',
    name: 'مدرج 2 (Hall 2)',
    nameEn: 'Hall 2',
    category: 'hall',
    lat: 30.901143,
    lng: 29.874724,
    radius: 100,
  },
  {
    id: 'hall_3',
    name: 'مدرج 3 (Hall 3)',
    nameEn: 'Hall 3',
    category: 'hall',
    lat: 30.901143,
    lng: 29.874724,
    radius: 100,
  },
  {
    id: 'hall_4',
    name: 'مدرج 4 (Hall 4)',
    nameEn: 'Hall 4',
    category: 'hall',
    lat: 30.901143,
    lng: 29.874724,
    radius: 100,
  },
  {
    id: 'hall_5',
    name: 'مدرج 5 (Hall 5)',
    nameEn: 'Hall 5',
    category: 'hall',
    lat: 30.901143,
    lng: 29.874724,
    radius: 100,
  },
  {
    id: 'hall_6',
    name: 'مدرج 6 (Hall 6)',
    nameEn: 'Hall 6',
    category: 'hall',
    lat: 30.901143,
    lng: 29.874724,
    radius: 100,
  },
  {
    id: 'hall_7',
    name: 'مدرج 7 (Hall 7)',
    nameEn: 'Hall 7',
    category: 'hall',
    lat: 30.901143,
    lng: 29.874724,
    radius: 100,
  },
  // Labs 1 to 7
  {
    id: 'lab_1',
    name: 'معمل الحاسب 1 (Lab 1)',
    nameEn: 'Computer Lab 1',
    category: 'lab',
    lat: 30.901143,
    lng: 29.874724,
    radius: 60,
  },
  {
    id: 'lab_2',
    name: 'معمل الحاسب 2 (Lab 2)',
    nameEn: 'Computer Lab 2',
    category: 'lab',
    lat: 30.901143,
    lng: 29.874724,
    radius: 60,
  },
  {
    id: 'lab_3',
    name: 'معمل الحاسب 3 (Lab 3)',
    nameEn: 'Computer Lab 3',
    category: 'lab',
    lat: 30.901143,
    lng: 29.874724,
    radius: 60,
  },
  {
    id: 'lab_4',
    name: 'معمل الحاسب 4 (Lab 4)',
    nameEn: 'Computer Lab 4',
    category: 'lab',
    lat: 30.901143,
    lng: 29.874724,
    radius: 60,
  },
  {
    id: 'lab_5',
    name: 'معمل الحاسب 5 (Lab 5)',
    nameEn: 'Computer Lab 5',
    category: 'lab',
    lat: 30.901143,
    lng: 29.874724,
    radius: 60,
  },
  {
    id: 'lab_6',
    name: 'معمل الحاسب 6 (Lab 6)',
    nameEn: 'Computer Lab 6',
    category: 'lab',
    lat: 30.901143,
    lng: 29.874724,
    radius: 60,
  },
  {
    id: 'lab_7',
    name: 'معمل الحاسب 7 (Lab 7)',
    nameEn: 'Computer Lab 7',
    category: 'lab',
    lat: 30.901143,
    lng: 29.874724,
    radius: 60,
  },
];
