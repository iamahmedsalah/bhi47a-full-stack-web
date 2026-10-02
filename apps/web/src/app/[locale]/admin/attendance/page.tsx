"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import {
  QrCode,
  BookOpen,
  Play,
  Users,
  GraduationCap,
  Sparkles,
  Search,
  X,
  Layers,
  Clock,
  Filter,
  MapPin,
  Crosshair,
  ExternalLink,
  Building2,
  Monitor,
  MapPinned,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageTitleBanner } from "@/components/ui/page-title-banner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  CustomDropdown,
  type CustomDropdownOption,
} from "@/components/ui/custom-dropdown";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/feedback";
import {
  attendanceApi,
  AssignedClassItem,
  AttendanceSessionDto,
  QrPayload,
} from "@/features/attendance/api/attendance-api";
import {
  ActiveSessionPresenter,
  HALL_PRESETS,
} from "@/features/attendance/components/active-session-presenter";
import {
  INSTITUTE_VENUE_PRESETS,
  INSTITUTE_GEO_LOCATION,
  type InstituteVenuePreset,
} from "@student-portal/shared";
import { AdminAttendanceOverview } from "@/features/attendance/components/admin-attendance-overview";
import { useAuth } from "@/providers/auth-provider";
import { getHallPosition } from "@/features/attendance/lib/location";
import { toast } from "sonner";

export default function StaffAttendancePage() {
  const params = useParams();
  const locale = (params.locale as string) || "ar";
  const isArabic = locale === "ar";
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState<"classes" | "admin-overview">(
    "classes",
  );

  // Active session state (if presenter view is active)
  const [activeSession, setActiveSession] =
    useState<AttendanceSessionDto | null>(null);
  const [activeQr, setActiveQr] = useState<QrPayload | null>(null);

  // Dialog state
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [selectedClass, setSelectedClass] = useState<AssignedClassItem | null>(
    null,
  );
  const [sessionType, setSessionType] = useState<"lecture" | "section" | "lab">(
    "lecture",
  );
  const [group, setGroup] = useState("1");
  const [section, setSection] = useState("1");
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState(10);
  const [qrRotationSeconds, setQrRotationSeconds] = useState(20);
  const [isStarting, setIsStarting] = useState(false);

  // Location & Geofencing State
  const [enableGeofence, setEnableGeofence] = useState(false);
  const [venueName, setVenueName] = useState(
    INSTITUTE_VENUE_PRESETS[1]?.name || "مبنى نظم المعلومات (BIS Building)",
  );
  const [geoLat, setGeoLat] = useState("30.901143");
  const [geoLng, setGeoLng] = useState("29.874724");
  const [geoRadius, setGeoRadius] = useState(150);
  const [isLocating, setIsLocating] = useState(false);

  const [selectedVenuePresetId, setSelectedVenuePresetId] = useState<string>("bis_building");

  const venueDropdownOptions = React.useMemo<CustomDropdownOption[]>(() => {
    const categoryIcon = (cat: string) => {
      if (cat === "campus") return <Building2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />;
      if (cat === "hall") return <GraduationCap className="h-3.5 w-3.5 shrink-0 text-sky-400" />;
      return <Monitor className="h-3.5 w-3.5 shrink-0 text-violet-400" />;
    };
    const getVenueName = (p: InstituteVenuePreset) => isArabic ? p.name : p.nameEn;

    return [
      // Campus & Main Buildings
      ...INSTITUTE_VENUE_PRESETS.filter((p) => p.category === "campus").map((p) => ({
        value: p.id,
        label: (
          <div className="flex items-center justify-between w-full py-0.5 text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-foreground">
              {categoryIcon(p.category)} {getVenueName(p)}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground mr-2">{p.radius}{isArabic ? "م" : "m"}</span>
          </div>
        ),
      })),
      // Halls (Main, 315, 1-7)
      ...INSTITUTE_VENUE_PRESETS.filter((p) => p.category === "hall").map((p) => ({
        value: p.id,
        label: (
          <div className="flex items-center justify-between w-full py-0.5 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              {categoryIcon(p.category)} {getVenueName(p)}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground mr-2">{p.radius}{isArabic ? "م" : "m"}</span>
          </div>
        ),
      })),
      // Labs (1-7)
      ...INSTITUTE_VENUE_PRESETS.filter((p) => p.category === "lab").map((p) => ({
        value: p.id,
        label: (
          <div className="flex items-center justify-between w-full py-0.5 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              {categoryIcon(p.category)} {getVenueName(p)}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground mr-2">{p.radius}{isArabic ? "م" : "m"}</span>
          </div>
        ),
      })),
      // Custom Location
      {
        value: "custom",
        label: (
          <div className="flex items-center justify-between w-full py-0.5 text-xs text-primary font-bold">
            <span className="flex items-center gap-1.5">
              <MapPinned className="h-3.5 w-3.5 shrink-0" />
              {isArabic ? "إدخال يدوي مخصص" : "Custom Location"}
            </span>
          </div>
        ),
      },
    ];
  }, [isArabic]);

  const handleVenuePresetChange = (presetId: string) => {
    setSelectedVenuePresetId(presetId);
    if (presetId === "custom") return;
    const found = INSTITUTE_VENUE_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setVenueName(isArabic ? found.name : found.nameEn);
      setGeoLat(String(found.lat));
      setGeoLng(String(found.lng));
      setGeoRadius(found.radius);
    }
  };

  // Fetch staff assigned courses
  const classesQuery = useQuery({
    queryKey: ["staff-assigned-classes"],
    queryFn: () => attendanceApi.getStaffClasses(),
  });

  // Course Grid Filter States
  const [courseSearch, setCourseSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<"all" | "1" | "2" | "3" | "4">(
    "all",
  );
  const [roleFilter, setRoleFilter] = useState<"all" | "doctor" | "instructor">(
    "all",
  );

  const assignedClasses = classesQuery.data || [];
  const filteredClasses = assignedClasses.filter((item) => {
    if (levelFilter !== "all" && String(item.level) !== levelFilter)
      return false;
    if (roleFilter !== "all" && item.academicPosition !== roleFilter)
      return false;
    if (courseSearch.trim()) {
      const q = courseSearch.trim().toLowerCase();
      const code = item.courseCode.toLowerCase();
      const name = item.courseName.toLowerCase();
      if (!code.includes(q) && !name.includes(q)) return false;
    }
    return true;
  });

  const distinctLevels = Array.from(
    new Set(assignedClasses.map((c) => String(c.level))),
  );
  const doctorClassesCount = assignedClasses.filter(
    (c) => c.academicPosition === "doctor",
  ).length;
  const instructorClassesCount = assignedClasses.filter(
    (c) => c.academicPosition === "instructor",
  ).length;

  const handleOpenStartDialog = (item: AssignedClassItem) => {
    setSelectedClass(item);
    // If instructor, default to section
    if (item.academicPosition === "instructor") {
      setSessionType("section");
    } else {
      setSessionType("lecture");
    }
    setShowStartDialog(true);
  };

  const handleUseCurrentLocation = async () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      toast.error(
        isArabic
          ? "تحديد الموقع غير مدعوم في هذا المتصفح"
          : "Geolocation not supported in this browser",
      );
      return;
    }
    setIsLocating(true);
    try {
      const pos = await getHallPosition(navigator.geolocation, isArabic);
      setGeoLat(pos.coords.latitude.toFixed(6));
      setGeoLng(pos.coords.longitude.toFixed(6));
      setVenueName(isArabic ? "موقعي الحالي في القاعة" : "My Current Hall Location");
      setSelectedVenuePresetId("custom");
      setEnableGeofence(true);
      toast.success(
        isArabic
          ? `تم التقاط الموقع بدقة ±${Math.round(pos.coords.accuracy)} متر. ابدأ الجلسة لتطبيق الموقع.`
          : `Location captured (±${Math.round(pos.coords.accuracy)} m). Start the session to apply it.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : isArabic
          ? "تعذر الحصول على الموقع الجغرافي. تأكد من تفعيل صلاحيات GPS."
          : "Could not retrieve GPS coordinates.",
      );
    } finally {
      setIsLocating(false);
    }
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass || isLocating) return;

    setIsStarting(true);
    try {
      const res = await attendanceApi.createSession({
        courseCode: selectedClass.courseCode,
        sessionType,
        level: selectedClass.level,
        group: sessionType !== "lecture" ? group : undefined,
        section: sessionType !== "lecture" ? section : undefined,
        sessionDurationMinutes: durationMinutes,
        lateThresholdMinutes: lateThresholdMinutes,
        qrRotationSeconds: qrRotationSeconds,
        ...(enableGeofence && geoLat && geoLng
          ? {
              location: {
                venueName: venueName.trim(),
                latitude: Number(geoLat),
                longitude: Number(geoLng),
                radiusMeters: Number(geoRadius) || 100,
              },
            }
          : {}),
      });

      setActiveSession(res.session);
      setActiveQr(res.qr);
      setShowStartDialog(false);
      toast.success(
        isArabic
          ? "تم بدء جلسة الحضور الذكي وتوليد رمز QR المتجدد بنجاح!"
          : "Smart attendance session started successfully!",
      );
    } catch {
      toast.error(isArabic ? "فشل بدء جلسة الحضور" : "Failed to start session");
    } finally {
      setIsStarting(false);
    }
  };

  if (activeSession && activeQr) {
    return (
      <div className="mx-auto max-w-7xl py-4 space-y-6">
        <ActiveSessionPresenter
          session={activeSession}
          initialQr={activeQr}
          onSessionClosed={() => {
            setActiveSession(null);
            setActiveQr(null);
            classesQuery.refetch();
          }}
          isArabic={isArabic}
        />
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-7xl space-y-8 py-2"
      dir={isArabic ? "rtl" : "ltr"}
    >
      {/* Top Banner */}
      <PageTitleBanner
        title={
          isArabic
            ? "إدارة الحضور الذكي للمحاضرات والسكاشن"
            : "Smart Attendance Management"
        }
        subtitle={
          isArabic
            ? "اختر المقرر والقاعة، وابدأ جلسة الحضور لعرض رمز الاستجابة السريعة (QR) المتجدد تلقائيًا كل دقيقة (60 ثانية) على شاشة العرض. يتم التحقق من قيد الطالب وحساب الحضور والغياب والتأخير فورياً."
            : "Launch real-time attendance sessions with rotating anti-screenshot QR codes. Student enrollment and server timestamps are verified instantly."
        }
        icon={<QrCode className="h-5 w-5" />}
      />

      {/* Admin Tab Switcher */}
      {isAdmin && (
        <div className="flex items-center gap-2 border-b border-border/70 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("classes")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "classes"
                ? "bg-primary text-primary-foreground font-bold shadow-sm"
                : "bg-secondary/40 text-muted-foreground hover:text-foreground border border-border/60"
            }`}
          >
            <BookOpen className="h-4 w-4" />
            <span>
              {isArabic ? "المقررات وبدء الجلسات" : "My Classes & QR"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("admin-overview")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "admin-overview"
                ? "bg-primary text-primary-foreground font-bold shadow-sm"
                : "bg-secondary/40 text-muted-foreground hover:text-foreground border border-border/60"
            }`}
          >
            <Users className="h-4 w-4" />
            <span>
              {isArabic
                ? "الرقابة وإدارة الحضور العامة"
                : "System Overview & Sessions"}
            </span>
          </button>
        </div>
      )}

      {isAdmin && activeTab === "admin-overview" ? (
        <AdminAttendanceOverview
          isArabic={isArabic}
          onOpenSessionPresenter={async (session) => {
            try {
              const qr = await attendanceApi.getCurrentQr(session._id);
              setActiveSession(session);
              setActiveQr(qr);
            } catch (err) {
              toast.error(
                isArabic
                  ? "تعذر فتح عرض الجلسة"
                  : "Failed to open session presenter",
              );
            }
          }}
        />
      ) : (
        /* Classes Grid */
        <div className="space-y-6">
          {/* Section Header with KPI row */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold text-foreground">
                  {isArabic
                    ? "المقررات المكلف بها"
                    : "Assigned Courses & Classes"}
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                {isArabic
                  ? "اختر المقرر لبدء جلسة الحضور وتوليد رمز QR المتجدد للطلاب"
                  : "Select a course to launch smart attendance with rotating QR codes"}
              </p>
            </div>

            {/* Quick KPI Counters */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-3 py-1 rounded-xl bg-primary/10 border border-primary/20 text-primary font-mono font-bold">
                {assignedClasses.length} {isArabic ? "مقرر" : "Courses"}
              </span>
              <span className="px-3 py-1 rounded-xl bg-secondary/50 border border-border/70 text-muted-foreground font-mono">
                {distinctLevels.length} {isArabic ? "مستويات" : "Levels"}
              </span>
              <span className="px-3 py-1 rounded-xl bg-secondary/50 border border-border/70 text-muted-foreground font-mono">
                {doctorClassesCount} {isArabic ? "محاضرات" : "Lectures"}
              </span>
              <span className="px-3 py-1 rounded-xl bg-secondary/50 border border-border/70 text-muted-foreground font-mono">
                {instructorClassesCount} {isArabic ? "سكاشن" : "Sections"}
              </span>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3.5 rounded-2xl bg-card/50 border border-border/70 backdrop-blur-md">
            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder={
                  isArabic
                    ? "بحث باسم أو كود المقرر..."
                    : "Search course name or code..."
                }
                className="ps-9 pe-8 h-9 text-xs"
              />
              {courseSearch && (
                <button
                  type="button"
                  onClick={() => setCourseSearch("")}
                  className="absolute end-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Level Filter */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary/40 border border-border/60">
                {(["all", "1", "2", "3", "4"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setLevelFilter(lvl)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      levelFilter === lvl
                        ? "bg-primary text-primary-foreground font-bold shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {lvl === "all"
                      ? isArabic
                        ? "كل المستويات"
                        : "All Levels"
                      : isArabic
                        ? `مستوى ${lvl}`
                        : `L${lvl}`}
                  </button>
                ))}
              </div>

              {/* Role Filter */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary/40 border border-border/60">
                {(["all", "doctor", "instructor"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoleFilter(r)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      roleFilter === r
                        ? "bg-primary text-primary-foreground font-bold shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r === "all"
                      ? isArabic
                        ? "الكل"
                        : "All Roles"
                      : r === "doctor"
                        ? isArabic
                          ? "محاضرات"
                          : "Lectures"
                        : isArabic
                          ? "سكاشن"
                          : "Sections"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {classesQuery.isLoading ? (
            <LoadingState
              title={isArabic ? "جاري تحميل المواد..." : "Loading..."}
            />
          ) : classesQuery.isError ? (
            <ErrorState
              error={classesQuery.error}
              onRetry={() => classesQuery.refetch()}
            />
          ) : filteredClasses.length === 0 ? (
            <Card className="p-8">
              <EmptyState
                title={
                  courseSearch || levelFilter !== "all" || roleFilter !== "all"
                    ? isArabic
                      ? "لا توجد نتائج مطابقة لخيارات التصفية"
                      : "No matching courses found"
                    : isArabic
                      ? "لا توجد مقررات مكلف بها"
                      : "No assigned courses"
                }
                description={
                  courseSearch || levelFilter !== "all" || roleFilter !== "all"
                    ? isArabic
                      ? "يرجى تجربة تعديل مصطلح البحث أو إزالة المرشحات النشطة."
                      : "Try adjusting your search query or removing active filters."
                    : isArabic
                      ? "لم يتم تعيين أي مواد لحسابك حالياً. يرجى التواصل مع إدارة المعهد."
                      : "No classes have been assigned to your account."
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredClasses.map((item) => {
                const levelNum = Number(item.level);
                const levelColor =
                  levelNum === 1
                    ? "border-primary/25 bg-primary/10 text-primary"
                    : levelNum === 2
                      ? "border-primary/20 bg-primary/10 text-primary"
                      : levelNum === 3
                        ? "border-sky-500/25 bg-sky-500/10 text-sky-400"
                        : "border-purple-500/25 bg-purple-500/10 text-purple-400";

                return (
                  <Card
                    key={`${item.courseCode}-${item.academicPosition}`}
                    className="p-5 bg-card border border-border/70 hover:border-primary/40 transition-all duration-300 shadow-sm space-y-4 flex flex-col justify-between group rounded-2xl"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                            {item.courseCode}
                          </span>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${levelColor}`}
                          >
                            {isArabic
                              ? `المستوى ${item.level}`
                              : `Level ${item.level}`}
                          </span>
                        </div>
                        <Badge
                          variant="secondary"
                          className="text-xs bg-secondary/60 border-border/80"
                        >
                          {item.academicPosition === "doctor"
                            ? isArabic
                              ? "دكتور"
                              : "Doctor"
                            : isArabic
                              ? "معيد"
                              : "Teaching Assistant"}
                        </Badge>
                      </div>

                      <div>
                        <h3 className="text-base font-bold text-foreground leading-snug group-hover:text-primary transition-colors">
                          {item.courseName}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {item.semester
                            ? isArabic
                              ? `الفصل الدراسي: ${item.semester === "first" ? "الأول" : item.semester === "second" ? "الثاني" : item.semester}`
                              : `Semester: ${item.semester}`
                            : isArabic
                              ? "فصل دراسي معتمد"
                              : "Active Semester"}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3.5 border-t border-border/60 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                        <GraduationCap className="h-4 w-4 text-primary" />
                        <span>
                          {item.academicPosition === "doctor"
                            ? isArabic
                              ? "محاضرة أسبوعية"
                              : "Lectures"
                            : isArabic
                              ? "سكشن عملي"
                              : "Sections"}
                        </span>
                      </div>

                      <Button
                        onClick={() => handleOpenStartDialog(item)}
                        className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shadow-sm cursor-pointer transition-all hover:scale-105 active:scale-95"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>
                          {isArabic ? "بدء الحضور" : "Start Attendance"}
                        </span>
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Dialog: Start Attendance Configuration */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent
          className="sm:max-w-lg border-border bg-card rounded-2xl"
          dir={isArabic ? "rtl" : "ltr"}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
              <QrCode className="h-6 w-6 text-primary" />
              <span>
                {isArabic
                  ? "إعداد جلسة الحضور الذكي"
                  : "Configure Attendance Session"}
              </span>
            </DialogTitle>
          </DialogHeader>

          {selectedClass && (
            <form onSubmit={handleStartSession} className="space-y-4 py-2">
              <div className="p-3 rounded-xl bg-secondary/50 border border-border/70">
                <div className="text-sm font-bold text-foreground">
                  {selectedClass.courseName}
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                  {selectedClass.courseCode} •{" "}
                  {isArabic
                    ? `المستوى ${selectedClass.level}`
                    : `Level ${selectedClass.level}`}
                </div>
              </div>

              {/* Session Type */}
              <div className="space-y-2">
                <Label>{isArabic ? "نوع الجلسة" : "Session Type"}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "lecture", labelAr: "محاضرة", labelEn: "Lecture" },
                    { id: "section", labelAr: "سكشن", labelEn: "Section" },
                    { id: "lab", labelAr: "معمل", labelEn: "Lab" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setSessionType(t.id as "lecture" | "section" | "lab")
                      }
                      className={`p-2.5 rounded-xl border text-sm font-medium transition-all ${
                        sessionType === t.id
                          ? "bg-primary text-primary-foreground font-bold shadow-sm"
                          : "bg-background/60 border-border text-muted-foreground hover:bg-muted/30"
                      }`}
                    >
                      {isArabic ? t.labelAr : t.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              {/* Group and Section */}
              {sessionType !== "lecture" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{isArabic ? "المجموعة (Group)" : "Group"}</Label>
                    <Input
                      value={group}
                      onChange={(e) => setGroup(e.target.value)}
                      placeholder="1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{isArabic ? "السكشن (Section)" : "Section"}</Label>
                    <Input
                      value={section}
                      onChange={(e) => setSection(e.target.value)}
                      placeholder="1"
                    />
                  </div>
                </div>
              )}

              {/* Timing parameters */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    {isArabic
                      ? "مدة فتح الحضور (بالدقائق)"
                      : "Session Duration (Minutes)"}
                  </Label>
                  <Input
                    type="number"
                    min={3}
                    max={120}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    {isArabic
                      ? "اعتبار تأخير بعد (دقائق)"
                      : "Late Threshold (Minutes)"}
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={lateThresholdMinutes}
                    onChange={(e) =>
                      setLateThresholdMinutes(Number(e.target.value))
                    }
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>
                  {isArabic
                    ? "تجديد رمز QR (بالثواني) لمنع التقاط الشاشة"
                    : "QR Rotation (Seconds)"}
                </Label>
                <Input
                  type="number"
                  min={15}
                  max={120}
                  value={qrRotationSeconds}
                  onChange={(e) => setQrRotationSeconds(Number(e.target.value))}
                  required
                />
              </div>

              {/* Geofencing Location Controls */}
              <div className="space-y-3 pt-2 border-t border-border/60">
                {/* STEP 1: Enable / Disable Geofencing */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-secondary/35 border border-border/70">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2.5 rounded-xl border ${
                        enableGeofence
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-muted/30 text-muted-foreground border-border"
                      }`}
                    >
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-bold text-foreground cursor-pointer">
                          {isArabic
                            ? "الخطوة 1: تفعيل قيد الموقع (Geofencing)"
                            : "Step 1: Enable Hall Geofencing"}
                        </Label>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            enableGeofence
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {enableGeofence
                            ? isArabic
                              ? "مفعل ومحمي"
                              : "Active"
                            : isArabic
                              ? "معطل"
                              : "Disabled"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isArabic
                          ? "التحقق من تواجد الطالب داخل نطاق القاعة عند مسح الرمز"
                          : "Enforce student presence within lecture hall radius"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enableGeofence}
                    onClick={() => setEnableGeofence(!enableGeofence)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                      enableGeofence
                        ? "bg-primary justify-end"
                        : "bg-muted justify-start"
                    }`}
                  >
                    <div className="bg-white w-4 h-4 rounded-full shadow-md" />
                  </button>
                </div>

                {enableGeofence && (
                  <div className="space-y-4 pt-1">
                    {/* STEP 2: Venue Selection via Dropdown & GPS Auto-Detect */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-mono flex items-center justify-center font-bold">
                            2
                          </span>
                          {isArabic
                            ? "الخطوة 2: اختيار القاعة أو المعمل أو الحرم"
                            : "Step 2: Select Hall, Lab, or Campus"}
                        </Label>
                        <a
                          href={INSTITUTE_GEO_LOCATION.GOOGLE_MAPS_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>
                            {isArabic ? "خريطة المعهد (Maps)" : "Institute Map"}
                          </span>
                        </a>
                      </div>

                      {/* Dropdown for selecting venue */}
                      <CustomDropdown
                        value={selectedVenuePresetId}
                        options={venueDropdownOptions}
                        onValueChange={handleVenuePresetChange}
                        className="w-full bg-background border-border text-xs font-medium"
                        placeholder={
                          isArabic
                            ? "اختر القاعة أو المعمل..."
                            : "Choose Hall or Lab..."
                        }
                      />

                      {/* GPS Button */}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleUseCurrentLocation}
                        disabled={isLocating}
                        className="w-full flex items-center justify-center gap-2 border-primary/30 text-primary bg-primary/5 hover:bg-primary/15 text-xs font-semibold cursor-pointer py-2 rounded-xl"
                      >
                        <Crosshair
                          className={`h-4 w-4 ${isLocating ? "animate-spin text-primary" : ""}`}
                        />
                        <span>
                          {isLocating
                            ? isArabic
                              ? "جاري تحديد موقعك بالـ GPS..."
                              : "Detecting GPS..."
                            : isArabic
                              ? "تحديد موقعي الحالي كقاعة للمحاضرة (تلقائي)"
                              : "Use My Current Hall Location"}
                        </span>
                      </Button>
                    </div>

                    {/* STEP 3: Allowed Radius & Quick Pills */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-mono flex items-center justify-center font-bold">
                            3
                          </span>
                          {isArabic
                            ? "الخطوة 3: نطاق السماح بالمتر (Radius)"
                            : "Step 3: Allowed Radius (Meters)"}
                        </Label>
                        <span className="font-mono font-bold text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                          {geoRadius} {isArabic ? "متر" : "meters"}
                        </span>
                      </div>

                      {/* Quick Radius Selection */}
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                        {[
                          { r: 50, label: isArabic ? "50م دقيق" : "50m Strict" },
                          { r: 60, label: isArabic ? "60م معمل" : "60m Lab" },
                          { r: 100, label: isArabic ? "100م مدرج" : "100m Hall" },
                          { r: 150, label: isArabic ? "150م مبنى" : "150m Bldg" },
                          { r: 350, label: isArabic ? "350م حرم" : "350m Campus" },
                          { r: 500, label: isArabic ? "500م واسع" : "500m Wide" },
                        ].map((pill) => (
                          <button
                            key={pill.r}
                            type="button"
                            onClick={() => setGeoRadius(pill.r)}
                            className={`text-xs py-1.5 rounded-lg border font-semibold transition-all cursor-pointer text-center ${
                              geoRadius === pill.r
                                ? "bg-primary text-primary-foreground font-bold border-primary shadow-xs"
                                : "bg-secondary/40 text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
                            }`}
                          >
                            {pill.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={10}
                          max={1000}
                          value={geoRadius}
                          onChange={(e) => setGeoRadius(Number(e.target.value))}
                          className="h-8 text-xs"
                        />
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {isArabic ? "متر مسموح للابتعاد" : "meters allowed distance"}
                        </span>
                      </div>
                    </div>

                    {/* STEP 4: Venue Details & Coordinates Preview */}
                    <div className="p-3 rounded-2xl bg-secondary/25 border border-border/70 space-y-2.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-semibold flex items-center gap-1.5 text-foreground">
                          <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-mono flex items-center justify-center font-bold">
                            4
                          </span>
                          {isArabic ? "معاينة الإحداثيات واسم القاعة" : "Coordinates Preview"}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          King Maryut (30.9011, 29.8747)
                        </span>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">
                          {isArabic ? "اسم القاعة أو المعمل:" : "Hall / Lab Name:"}
                        </Label>
                        <Input
                          value={venueName}
                          onChange={(e) => {
                            setVenueName(e.target.value);
                            setSelectedVenuePresetId("custom");
                          }}
                          placeholder="مدرج 1 أو معمل 3"
                          className="h-8 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">
                            {isArabic ? "خط العرض (Lat)" : "Latitude"}
                          </Label>
                          <Input
                            type="number"
                            step="any"
                            value={geoLat}
                            onChange={(e) => {
                              setGeoLat(e.target.value);
                              setSelectedVenuePresetId("custom");
                            }}
                            dir="ltr"
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">
                            {isArabic ? "خط الطول (Lng)" : "Longitude"}
                          </Label>
                          <Input
                            type="number"
                            step="any"
                            value={geoLng}
                            onChange={(e) => {
                              setGeoLng(e.target.value);
                              setSelectedVenuePresetId("custom");
                            }}
                            dir="ltr"
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowStartDialog(false)}
                  disabled={isStarting || isLocating}
                >
                  {isArabic ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  disabled={isStarting || isLocating}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-2 shadow-sm"
                >
                  {isStarting ? (
                    "..."
                  ) : (
                    <>
                      <QrCode className="h-4 w-4" />
                      <span>
                        {isArabic
                          ? "توليد الرمز وبدء الحضور"
                          : "Generate QR & Start"}
                      </span>
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
