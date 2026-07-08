'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Check, ClipboardList, Printer, RefreshCcw, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorMessage, PaginatedResponse } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AdvisingRequest {
  _id: string;
  studentId?: { _id: string; name?: string; studentCode?: string };
  assignedStaffId?: { name?: string };
  reason: string;
  autoSuggestedCourses: string[];
  staffApprovedCourses: string[];
  staffNotes?: string;
  status: string;
}

interface GpaRule {
  _id: string;
  minGpa: number;
  maxGpa: number;
  maxCreditHours: number;
  requiresAdvisor: boolean;
  isActive: boolean;
}

interface Registration {
  _id: string;
  studentId?: { name?: string; studentCode?: string };
  courses: string[];
  totalCreditHours: number;
  source: string;
  status: string;
}

interface AcademicProfile {
  _id: string;
  studentId?: { _id: string; name?: string; studentCode?: string };
  academicLevel: string;
  semester: string;
  gpa: number;
  completedCourses: string[];
  failedCourses: string[];
  advisorId?: { name?: string };
}

function parseCodes(value: string) {
  return value
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

async function printRegistration(registrationId: string) {
  const res = await api.get<{ title: string; registeredCourses: unknown[] }>(
    `/registrations/${registrationId}/print`,
  );
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<pre>${JSON.stringify(res.data, null, 2)}</pre>`);
  win.document.close();
  win.print();
}

export default function RegistrationAdminPage() {
  const params = useParams();
  const locale = params.locale as string;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [courseEdits, setCourseEdits] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [profileForm, setProfileForm] = useState({
    studentId: '',
    academicLevel: '1',
    semester: 'first',
    gpa: '2.5',
    completedCourses: '',
    failedCourses: '',
    advisorId: '',
  });
  const [ruleForm, setRuleForm] = useState({
    minGpa: '0',
    maxGpa: '1.99',
    maxCreditHours: '12',
    requiresAdvisor: true,
  });

  const advisingQuery = useQuery({
    queryKey: ['office-advising-requests', user?.role],
    queryFn: async () => {
      const endpoint =
        user?.role === 'staff' ? '/staff/advising-requests' : '/admin/advising-requests';
      const res = await api.get<PaginatedResponse<AdvisingRequest>>(endpoint);
      return res.data.items;
    },
    enabled: Boolean(user),
  });

  const registrationsQuery = useQuery({
    queryKey: ['admin-registrations'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Registration>>('/admin/registrations');
      return res.data.items;
    },
  });

  const profilesQuery = useQuery({
    queryKey: ['academic-profiles'],
    queryFn: async () => {
      const res = await api.get<AcademicProfile[]>('/admin/academic-profiles');
      return res.data;
    },
  });

  const rulesQuery = useQuery({
    queryKey: ['gpa-rules'],
    enabled: user?.role === 'admin',
    queryFn: async () => {
      const res = await api.get<GpaRule[]>('/admin/gpa-rules');
      return res.data;
    },
  });

  const reviewRequest = async (
    request: AdvisingRequest,
    status: 'approved' | 'rejected',
  ) => {
    try {
      await api.patch(`/staff/advising-requests/${request._id}/review`, {
        staffApprovedCourses: parseCodes(
          courseEdits[request._id] ??
            (request.staffApprovedCourses.length
              ? request.staffApprovedCourses
              : request.autoSuggestedCourses
            ).join(', '),
        ),
        staffNotes: notes[request._id] ?? request.staffNotes,
        status,
      });
      toast.success(status === 'approved' ? 'Registration approved' : 'Request rejected');
      await queryClient.invalidateQueries({ queryKey: ['office-advising-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-registrations'] });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const saveProfile = async () => {
    try {
      await api.post('/admin/academic-profiles', {
        studentId: profileForm.studentId,
        academicLevel: profileForm.academicLevel,
        semester: profileForm.semester,
        gpa: Number(profileForm.gpa),
        completedCourses: parseCodes(profileForm.completedCourses),
        failedCourses: parseCodes(profileForm.failedCourses),
        advisorId: profileForm.advisorId || undefined,
      });
      toast.success('Academic profile saved');
      await queryClient.invalidateQueries({ queryKey: ['academic-profiles'] });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const saveRule = async () => {
    try {
      await api.post('/admin/gpa-rules', {
        minGpa: Number(ruleForm.minGpa),
        maxGpa: Number(ruleForm.maxGpa),
        maxCreditHours: Number(ruleForm.maxCreditHours),
        requiresAdvisor: ruleForm.requiresAdvisor,
      });
      toast.success('GPA rule saved');
      await queryClient.invalidateQueries({ queryKey: ['gpa-rules'] });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/90 p-5 shadow-[var(--shadow-glow)] backdrop-blur md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {locale === 'ar' ? 'إدارة التسجيل والإرشاد الأكاديمي' : 'Registration Office'}
            </h1>
            <p className="mt-1 text-sm text-muted">
              Advising review, GPA rules, academic profiles, and registration reports.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              void queryClient.invalidateQueries();
            }}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-5 w-5" />
            Academic advising requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Suggested / approved courses</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(advisingQuery.data ?? []).map((request) => (
                <TableRow key={request._id}>
                  <TableCell>
                    <div className="font-semibold">{request.studentId?.name ?? '-'}</div>
                    <div className="text-xs text-muted">{request.studentId?.studentCode}</div>
                  </TableCell>
                  <TableCell>{request.reason}</TableCell>
                  <TableCell className="min-w-64">
                    <Input
                      value={
                        courseEdits[request._id] ??
                        (request.staffApprovedCourses.length
                          ? request.staffApprovedCourses
                          : request.autoSuggestedCourses
                        ).join(', ')
                      }
                      onChange={(event) =>
                        setCourseEdits((current) => ({
                          ...current,
                          [request._id]: event.target.value,
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell className="min-w-56">
                    <Textarea
                      value={notes[request._id] ?? request.staffNotes ?? ''}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [request._id]: event.target.value,
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell>{request.status}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => reviewRequest(request, 'approved')}>
                        <Check className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => reviewRequest(request, 'rejected')}
                      >
                        <X className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Academic profiles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Student user ID"
                value={profileForm.studentId}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, studentId: event.target.value }))
                }
              />
              <Input
                placeholder="Advisor user ID"
                value={profileForm.advisorId}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, advisorId: event.target.value }))
                }
              />
              <Input
                placeholder="Level"
                value={profileForm.academicLevel}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    academicLevel: event.target.value,
                  }))
                }
              />
              <Input
                placeholder="Semester"
                value={profileForm.semester}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, semester: event.target.value }))
                }
              />
              <Input
                placeholder="GPA"
                type="number"
                step="0.01"
                value={profileForm.gpa}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, gpa: event.target.value }))
                }
              />
              <Input
                placeholder="Completed course codes"
                value={profileForm.completedCourses}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    completedCourses: event.target.value,
                  }))
                }
              />
              <Input
                placeholder="Failed course codes"
                value={profileForm.failedCourses}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    failedCourses: event.target.value,
                  }))
                }
              />
            </div>
            <Button onClick={saveProfile}>
              <Save className="h-4 w-4" />
              Save profile
            </Button>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>GPA</TableHead>
                  <TableHead>Failed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(profilesQuery.data ?? []).slice(0, 8).map((profile) => (
                  <TableRow key={profile._id}>
                    <TableCell>{profile.studentId?.name ?? profile.studentId?.studentCode}</TableCell>
                    <TableCell>
                      {profile.academicLevel} / {profile.semester}
                    </TableCell>
                    <TableCell>{profile.gpa}</TableCell>
                    <TableCell>{profile.failedCourses.join(', ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">GPA registration rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {user?.role === 'admin' && (
              <div className="grid gap-3 md:grid-cols-4">
                <Input
                  placeholder="Min GPA"
                  type="number"
                  step="0.01"
                  value={ruleForm.minGpa}
                  onChange={(event) =>
                    setRuleForm((current) => ({ ...current, minGpa: event.target.value }))
                  }
                />
                <Input
                  placeholder="Max GPA"
                  type="number"
                  step="0.01"
                  value={ruleForm.maxGpa}
                  onChange={(event) =>
                    setRuleForm((current) => ({ ...current, maxGpa: event.target.value }))
                  }
                />
                <Input
                  placeholder="Max hours"
                  type="number"
                  value={ruleForm.maxCreditHours}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      maxCreditHours: event.target.value,
                    }))
                  }
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={ruleForm.requiresAdvisor}
                    onChange={(event) =>
                      setRuleForm((current) => ({
                        ...current,
                        requiresAdvisor: event.target.checked,
                      }))
                    }
                    className="w-4 h-4 rounded-full text-primary bg-input border-input-border cursor-pointer focus:ring-primary"
                  />
                  Requires advisor
                </label>
                <Button onClick={saveRule}>
                  <Save className="h-4 w-4" />
                  Add rule
                </Button>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>GPA range</TableHead>
                  <TableHead>Max hours</TableHead>
                  <TableHead>Advisor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rulesQuery.data ?? []).map((rule) => (
                  <TableRow key={rule._id}>
                    <TableCell>
                      {rule.minGpa} - {rule.maxGpa}
                    </TableCell>
                    <TableCell>{rule.maxCreditHours}</TableCell>
                    <TableCell>{rule.requiresAdvisor ? 'Required' : 'Direct'}</TableCell>
                    <TableCell>{rule.isActive ? 'Active' : 'Inactive'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Registration reports</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Courses</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Print</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(registrationsQuery.data ?? []).map((registration) => (
                <TableRow key={registration._id}>
                  <TableCell>
                    {registration.studentId?.name ?? '-'}
                    <div className="text-xs text-muted">{registration.studentId?.studentCode}</div>
                  </TableCell>
                  <TableCell>{registration.courses.join(', ')}</TableCell>
                  <TableCell>{registration.totalCreditHours}</TableCell>
                  <TableCell>{registration.source}</TableCell>
                  <TableCell>{registration.status}</TableCell>
                  <TableCell>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        void printRegistration(registration._id);
                      }}
                    >
                      <Printer className="h-4 w-4" />
                      Print
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
