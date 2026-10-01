import api from "@/lib/api";

export interface AssignedClassItem {
  courseCode: string;
  courseName: string;
  level: string;
  semester: string;
  academicPosition: "doctor" | "instructor";
  groups?: string[];
  sections?: string[];
}

export interface CreateSessionPayload {
  courseCode: string;
  sessionType: "lecture" | "section" | "lab";
  level: string;
  group?: string;
  section?: string;
  academicYear?: string;
  semester?: string;
  lateThresholdMinutes?: number;
  sessionDurationMinutes?: number;
  qrRotationSeconds?: number;
}

export interface QrPayload {
  token: string;
  manualCode: string;
  checkInUrl: string;
  rotationSeconds: number;
  remainingSeconds: number;
  expiresAt: string;
}

export interface AttendanceSessionDto {
  _id: string;
  courseCode: string;
  courseName?: string;
  sessionType: "lecture" | "section" | "lab";
  level: string;
  group?: string;
  section?: string;
  academicYear: string;
  semester: string;
  createdBy: string;
  createdByName: string;
  academicPosition: "doctor" | "instructor";
  status: "OPEN" | "CLOSED" | "EXPIRED";
  startsAt: string;
  expiresAt: string;
  closedAt?: string;
  lateThresholdMinutes: number;
  sessionDurationMinutes: number;
  qrRotationSeconds: number;
  stats?: {
    totalCheckedIn: number;
    presentCount: number;
    lateCount: number;
    excusedCount: number;
  };
}

export interface StudentLiveSessionItem {
  _id: string;
  courseCode: string;
  courseName?: string;
  sessionType: "lecture" | "section" | "lab";
  level: string;
  group?: string;
  section?: string;
  createdByName: string;
  academicPosition: "doctor" | "instructor";
  startsAt: string;
  expiresAt: string;
  durationMinutes: number;
  remainingSeconds: number;
  alreadyCheckedIn: boolean;
  checkedInStatus?: "present" | "late" | "excused" | null;
}

export interface AttendanceRecordDto {
  _id: string;
  sessionId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  courseCode: string;
  sessionType: string;
  status: "present" | "late" | "excused" | "absent";
  method: "qr" | "manual";
  checkedInAt: string;
  markedByName?: string;
  note?: string;
}

export interface PaginatedRecordsResponse {
  items: AttendanceRecordDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CheckInResponse {
  alreadyCheckedIn: boolean;
  status: "present" | "late";
  checkedInAt: string;
  sessionType: string;
  courseCode: string;
  courseName?: string;
  message: string;
}

export interface CourseAttendanceSummary {
  courseCode: string;
  courseName?: string;
  totalSessions: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  attendanceRate: number;
}

export interface StudentAttendanceHistoryResponse {
  summary: {
    totalSessions: number;
    presentCount: number;
    lateCount: number;
    excusedCount: number;
    absentCount: number;
    attendanceRate: number;
  };
  courses?: CourseAttendanceSummary[];
  records: AttendanceRecordDto[];
}

export const attendanceApi = {
  // Staff classes
  async getStaffClasses(): Promise<AssignedClassItem[]> {
    const res = await api.get<AssignedClassItem[]>("/attendance/my-classes");
    return res.data;
  },

  // Create session
  async createSession(payload: CreateSessionPayload): Promise<{
    session: AttendanceSessionDto;
    qr: QrPayload;
    isExisting: boolean;
  }> {
    const res = await api.post("/attendance/sessions", payload);
    return res.data;
  },

  // Get session details & stats
  async getSessionDetails(sessionId: string): Promise<AttendanceSessionDto> {
    const res = await api.get<AttendanceSessionDto>(
      `/attendance/sessions/${sessionId}`,
    );
    return res.data;
  },

  // Get current rotating QR
  async getCurrentQr(sessionId: string): Promise<QrPayload> {
    const res = await api.get<QrPayload>(
      `/attendance/sessions/${sessionId}/qr`,
    );
    return res.data;
  },

  // Close session
  async closeSession(
    sessionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const res = await api.post(`/attendance/sessions/${sessionId}/close`);
    return res.data;
  },

  // Get attendees list
  async getSessionRecords(
    sessionId: string,
    params?: {
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<PaginatedRecordsResponse> {
    const res = await api.get<PaginatedRecordsResponse>(
      `/attendance/sessions/${sessionId}/records`,
      { params },
    );
    return res.data;
  },

  // Manual status change
  async manualUpdateRecord(
    recordId: string,
    payload: { status: string; reason?: string; note?: string },
  ): Promise<AttendanceRecordDto> {
    const res = await api.patch<AttendanceRecordDto>(
      `/attendance/records/${recordId}`,
      payload,
    );
    return res.data;
  },

  // Manual check-in student
  async manualStudentCheckIn(
    sessionId: string,
    payload: { studentCode: string; status: string; reason?: string },
  ): Promise<AttendanceRecordDto> {
    const res = await api.post<AttendanceRecordDto>(
      `/attendance/sessions/${sessionId}/manual-mark`,
      payload,
    );
    return res.data;
  },

  // Student QR Check-in with anti-proxy deviceId and optional GPS geofencing
  async checkIn(
    payloadOrToken:
      | string
      | {
          token: string;
          deviceId?: string;
          latitude?: number;
          longitude?: number;
        },
    meta?: { deviceId?: string; latitude?: number; longitude?: number },
  ): Promise<CheckInResponse> {
    const body =
      typeof payloadOrToken === "string"
        ? { token: payloadOrToken, ...meta }
        : payloadOrToken;
    const res = await api.post<CheckInResponse>("/attendance/check-in", body);
    return res.data;
  },

  // Student active/live sessions
  async getStudentLiveSessions(): Promise<{
    sessions: StudentLiveSessionItem[];
  }> {
    const res = await api.get<{ sessions: StudentLiveSessionItem[] }>(
      "/attendance/student/live-sessions",
    );
    return res.data;
  },

  // Student history
  async getMyAttendanceHistory(): Promise<StudentAttendanceHistoryResponse> {
    const res = await api.get<StudentAttendanceHistoryResponse>(
      "/students/me/attendance-history",
    );
    return res.data;
  },

  // Admin overview
  async getAdminOverview(): Promise<{
    kpi: {
      totalSessions: number;
      activeSessions: number;
      totalCheckedIn: number;
      presentCount: number;
      lateCount: number;
    };
    sessions: AttendanceSessionDto[];
  }> {
    const res = await api.get("/attendance/admin/overview");
    return res.data;
  },
};
